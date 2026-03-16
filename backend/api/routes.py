import asyncio
import json
import logging
import time
import uuid
from typing import AsyncGenerator, Any

import re
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from backend.config.settings import settings
from backend.models.schemas import (
    ChronicleRequest,
    GenerateNarrativeRequest,
    GenerateStoryboardRequest,
    GenerateVideoRequest,
    SegmentUpdateRequest,
    RegenerateVideoClipRequest,
    RewriteSegmentRequest,
)
from backend.chronicle.agent import root_agent as chronicle_agent
from backend.services.persistence import (
    sync_state,
    hydrate_session,
    persist_current_session,
    get_persistence_service,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("chronicle.routes")

router = APIRouter(prefix="/chronicle", tags=["chronicle"])

APP_NAME = "chronicle"
USER_ID = "chronicle_user"

# ADK session service and runner
session_service = InMemorySessionService()
runner = Runner(
    agent=chronicle_agent,
    app_name=APP_NAME,
    session_service=session_service,
)

# Per-session SSE queues: session_id → asyncio.Queue
_session_queues: dict[str, asyncio.Queue] = {}


async def _get_or_hydrate_session(session_id: str):
    """Loads session from memory, or hydrates it from Firestore if missing."""
    await hydrate_session(session_id, session_service, APP_NAME, USER_ID)
    stored = session_service.sessions.get(APP_NAME, {}).get(USER_ID, {}).get(session_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Session not found")
    return stored

async def _persist_session_state(session_id: str, updates: dict[str, Any]) -> None:
    """Mutate the stored session object and sync to Firestore."""
    await sync_state(session_id, updates, session_service, APP_NAME, USER_ID)


def _extract_sse_event(event) -> dict | None:
    """Convert an ADK Event to an SSE payload dict, or None if not an SSE event."""
    if not event.content or not event.content.parts:
        return None
    part = event.content.parts[0]
    text = getattr(part, "text", None)
    if not text:
        return None
    try:
        data = json.loads(text)
        if "sse_type" in data:
            sse_type = data.pop("sse_type")
            return {"event": sse_type, "data": data}
    except (json.JSONDecodeError, TypeError):
        pass
    return None


def _is_rate_limit(exc: Exception) -> bool:
    msg = str(exc).upper()
    return "429" in msg or "RESOURCE_EXHAUSTED" in msg


async def _run_pipeline(session_id: str, topic: str, queue: asyncio.Queue):
    """Run the ADK pipeline and push SSE events to the queue."""
    MAX_RETRIES = 3
    RETRY_WAITS = [30, 60, 120]

    logger.info(f"[{session_id}] Pipeline starting for topic: {topic!r}")
    t0 = time.time()
    event_count = 0

    try:
        for attempt in range(MAX_RETRIES):
            try:
                async for event in runner.run_async(
                    user_id=USER_ID,
                    session_id=session_id,
                    new_message=types.Content(
                        role="user",
                        parts=[types.Part(text=topic)],
                    ),
                ):
                    event_count += 1
                    author = getattr(event, "author", "?")
                    has_content = bool(event.content and event.content.parts)
                    part_preview = ""
                    if has_content:
                        t = getattr(event.content.parts[0], "text", None)
                        part_preview = (t[:400] + "…") if t and len(t) > 400 else (t or "<non-text>")
                    logger.info(
                        f"[{session_id}] Event #{event_count} from={author!r} "
                        f"has_content={has_content} preview={part_preview!r}"
                    )
                    sse = _extract_sse_event(event)
                    if sse:
                        logger.info(f"[{session_id}] → SSE event type={sse['event']!r}")
                        await queue.put(sse)
                    await persist_current_session(session_id, session_service, APP_NAME, USER_ID)

                # Pipeline finished successfully
                logger.info(
                    f"[{session_id}] Pipeline done (attempt {attempt + 1}). "
                    f"total_events={event_count} elapsed={time.time()-t0:.1f}s"
                )
                break  # exit retry loop

            except Exception as e:
                is_rl = _is_rate_limit(e)
                if is_rl and attempt < MAX_RETRIES - 1:
                    wait = RETRY_WAITS[attempt]
                    logger.warning(
                        f"[{session_id}] Rate limited (attempt {attempt + 1}/{MAX_RETRIES}) "
                        f"— retrying in {wait}s"
                    )
                    # Notify the frontend so it shows a live status
                    for remaining in range(wait, 0, -10):
                        await queue.put({
                            "event": "pipeline_status",
                            "data": {
                                "stage": "system",
                                "step": "rate_limited",
                                "attempt": attempt + 1,
                                "message": (
                                    f"API rate limited — resuming in {remaining}s "
                                    f"(attempt {attempt + 1}/{MAX_RETRIES})"
                                ),
                            },
                        })
                        await asyncio.sleep(min(10, remaining))
                else:
                    # Non-retriable error or final retry exhausted
                    logger.exception(f"[{session_id}] Pipeline error after {time.time()-t0:.1f}s")
                    user_msg = (
                        "Too many rate limit errors. Please wait a minute and try again."
                        if is_rl else str(e)
                    )
                    await queue.put({
                        "event": "error",
                        "data": {
                            "agent": "pipeline",
                            "message": user_msg,
                            "recoverable": is_rl,
                        },
                    })
                    break  # exit retry loop on unrecoverable or final failure

    finally:
        await persist_current_session(session_id, session_service, APP_NAME, USER_ID)
        await queue.put(None)           # Signal end-of-stream to event_generator
        _session_queues.pop(session_id, None)   # Queue lifecycle ends here


@router.post("/generate")
async def generate(request: ChronicleRequest, background_tasks: BackgroundTasks):
    """
    Start a Chronicle generation pipeline.
    Returns session_id immediately; stream events via GET /chronicle/stream/{session_id}.
    """
    session_id = request.session_id or str(uuid.uuid4())
    logger.info(f"[{session_id}] /generate called topic={request.topic!r}")

    await session_service.create_session(
        app_name=APP_NAME,
        user_id=USER_ID,
        session_id=session_id,
        state={
            "topic": request.topic,
            "visual_style": request.visual_style or "cinematic",
            "voice_preference": request.voice_preference or "male",
            "autonomous_mode": request.autonomous,
        },
    )
    # Persist initial creation state
    await sync_state(
        session_id,
        {
            "topic": request.topic,
            "visual_style": request.visual_style or "cinematic",
            "voice_preference": request.voice_preference or "male",
            "pipeline_stage": "research",
            "autonomous_mode": request.autonomous,
        },
        session_service, APP_NAME, USER_ID
    )

    queue: asyncio.Queue = asyncio.Queue()
    _session_queues[session_id] = queue

    background_tasks.add_task(_run_pipeline, session_id, request.topic, queue)

    return {"session_id": session_id}


@router.post("/retry/{session_id}")
async def retry_pipeline(session_id: str, background_tasks: BackgroundTasks):
    """
    Restart the pipeline for a session that previously failed (e.g. 429 exhausted).
    Picks up from the pipeline_stage already stored in session state.
    A new SSE queue is created; clients must reconnect to /stream/{session_id}.
    """
    try:
        await _get_or_hydrate_session(session_id)
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=session_id,
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")

    topic = session.state.get("topic", "")
    queue: asyncio.Queue = asyncio.Queue()
    _session_queues[session_id] = queue

    background_tasks.add_task(_run_pipeline, session_id, topic, queue)

    return {"session_id": session_id, "retrying": True}


@router.get("/stream/{session_id}")
async def stream(session_id: str):
    """SSE stream for a Chronicle generation session."""
    if session_id not in _session_queues:
        raise HTTPException(status_code=404, detail="Session not found")

    queue = _session_queues[session_id]

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                try:
                    # Short timeout so we can send heartbeat comments to keep
                    # the connection alive during long Veo generation phases
                    # (and during rate-limit retry waits of 30–120s)
                    item = await asyncio.wait_for(queue.get(), timeout=30)
                except asyncio.TimeoutError:
                    # SSE comment — keeps browser EventSource alive, ignored by clients
                    yield ": heartbeat\n\n"
                    continue
                if item is None:
                    break
                event_type = item.get("event", "message")
                data = json.dumps(item.get("data", {}))
                yield f"event: {event_type}\ndata: {data}\n\n"
        except Exception:
            yield f"event: error\ndata: {json.dumps({'agent': 'stream', 'message': 'Stream error', 'recoverable': False})}\n\n"
        # Queue lifecycle is owned by _run_pipeline so reconnects during retry waits
        # can still find the existing queue.

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/result/{session_id}")
async def get_result(session_id: str):
    """Get the final video result for a completed session."""
    try:
        await _get_or_hydrate_session(session_id)
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=session_id,
        )
        final_video = session.state.get("final_video")
        if not final_video:
            return {"status": "in_progress", "final_video": None}
        return {"status": "complete", "final_video": final_video}
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")


@router.get("/media/{blob_path:path}")
async def proxy_media(blob_path: str):
    """Proxy a generic GCS asset such as storyboard or character images."""
    from backend.tools.gcs_tool import get_gcs_client
    import io

    client = get_gcs_client()
    blob = client.bucket(settings.GCS_BUCKET).blob(blob_path)
    blob.reload()

    buf = io.BytesIO()
    blob.download_to_file(buf)
    buf.seek(0)

    return Response(
        content=buf.read(),
        media_type=blob.content_type or "application/octet-stream",
        headers={
            "Content-Length": str(blob.size or 0),
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/clip/{blob_path:path}")
async def proxy_clip(blob_path: str, request: Request):
    """
    Proxy a GCS clip to the browser with HTTP range request support.
    Required for video seeking and for browsers that require range responses.
    """
    from backend.tools.gcs_tool import get_gcs_client
    import io

    client = get_gcs_client()
    blob = client.bucket(settings.GCS_BUCKET).blob(blob_path)
    blob.reload()  # fetch metadata (size, content-type)
    total_size = blob.size or 0

    range_header = request.headers.get("range")
    if range_header:
        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if m:
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else total_size - 1
            end = min(end, total_size - 1)
            length = end - start + 1

            buf = io.BytesIO()
            blob.download_to_file(buf, start=start, end=end + 1)
            buf.seek(0)

            return Response(
                content=buf.read(),
                status_code=206,
                media_type="video/mp4",
                headers={
                    "Content-Range": f"bytes {start}-{end}/{total_size}",
                    "Content-Length": str(length),
                    "Accept-Ranges": "bytes",
                },
            )

    # Full file
    buf = io.BytesIO()
    blob.download_to_file(buf)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(total_size),
        },
    )


def _apply_segment_edits(stored_session, edits) -> None:
    """Apply segment edits to documentary_script.segments in the stored session."""
    if not edits:
        return
    doc_script = stored_session.state.get("documentary_script", {})
    if not isinstance(doc_script, dict):
        return
    segments = doc_script.get("segments", [])
    edit_map = {e.segment_number: e for e in edits}
    for seg in segments:
        seg_num = seg.get("segment_number")
        if seg_num in edit_map:
            edit = edit_map[seg_num]
            if edit.narration_chunk is not None:
                seg["narration_chunk"] = edit.narration_chunk
            if edit.veo_prompt is not None:
                seg["veo_prompt"] = edit.veo_prompt
            if edit.segment_title is not None:
                seg["segment_title"] = edit.segment_title
    doc_script["segments"] = segments
    stored_session.state["documentary_script"] = doc_script


class RestartResearchRequest(BaseModel):
    restart_notes: str = ""


@router.post("/restart-research/{session_id}")
async def restart_research(session_id: str, background_tasks: BackgroundTasks, request: RestartResearchRequest = RestartResearchRequest()):
    """Restart the research phase for an existing session."""
    stored = await _get_or_hydrate_session(session_id)

    topic = stored.state.get("topic", "")

    # Clear all research and era state so the pipeline starts fresh
    for key in [
        "research_brief", "research_validation",
        "era_context", "style_bible", "era_style", "detected_year",
        "era_material_culture_raw", "era_architecture_raw",
        "era_technology_raw",
        "user_research_notes", "script_issues",
        "documentary_script", "script_validation",
        "character_reference_images", "character_collage_b64",
        "storyboard", "media_segments",
        "video_clips", "narration_acts_audio", "total_narration_duration",
        "selected_storyboard_segments", "final_video",
    ]:
        stored.state.pop(key, None)

    state_updates: dict[str, Any] = {"pipeline_stage": "research", "autonomous_mode": False}
    if request.restart_notes.strip():
        state_updates["restart_notes"] = request.restart_notes.strip()
    else:
        stored.state.pop("restart_notes", None)

    await _persist_session_state(session_id, state_updates)

    queue: asyncio.Queue = asyncio.Queue()
    _session_queues[session_id] = queue
    background_tasks.add_task(_run_pipeline, session_id, topic, queue)

    return {"session_id": session_id, "restarted": True}


@router.post("/generate-narrative/{session_id}")
async def generate_narrative(session_id: str, request: GenerateNarrativeRequest, background_tasks: BackgroundTasks):
    """
    Trigger story writing after user finalizes research.
    Applies any user edits to the research brief in session state, stores user notes,
    sets pipeline_stage to 'narrative', and resumes the pipeline.
    """
    # Retrieve the STORED session directly
    stored = await _get_or_hydrate_session(session_id)

    topic = stored.state.get("topic", "")

    # Build the complete set of state updates to apply atomically
    state_updates: dict[str, Any] = {
        "pipeline_stage": "narrative",
        "autonomous_mode": request.autonomous,
    }

    # Apply user-edited research fields
    research_brief = stored.state.get("research_brief", {})
    if isinstance(research_brief, dict):
        updated_brief = dict(research_brief)  # shallow copy — we'll mutate this
        if request.defining_moment is not None:
            updated_brief["defining_moment"] = request.defining_moment
        if request.key_figures is not None:
            updated_brief["key_figures"] = [
                {"name": f, "role": ""} for f in request.key_figures
            ]
        if request.brief_summary is not None:
            updated_brief["emotional_core"] = request.brief_summary
        if request.detected_year is not None:
            updated_brief["detected_year"] = request.detected_year
        state_updates["research_brief"] = updated_brief

    if request.detected_year is not None:
        state_updates["detected_year"] = request.detected_year
    if request.era_style is not None:
        state_updates["era_style"] = request.era_style
    if request.style_bible is not None:
        state_updates["style_bible"] = request.style_bible
    if request.user_notes:
        state_updates["user_research_notes"] = request.user_notes
    else:
        stored.state.pop("user_research_notes", None)

    # Persist ALL updates directly to the stored session object BEFORE the background task runs
    await _persist_session_state(session_id, state_updates)

    queue: asyncio.Queue = asyncio.Queue()
    _session_queues[session_id] = queue

    background_tasks.add_task(_run_pipeline, session_id, topic, queue)

    return {"session_id": session_id}


@router.post("/generate-storyboard/{session_id}")
async def generate_storyboard(session_id: str, request: GenerateStoryboardRequest, background_tasks: BackgroundTasks):
    """
    Trigger storyboard generation after user reviews and optionally edits the narrative.
    Applies segment edits, sets pipeline_stage to 'storyboard', and resumes the pipeline.
    """
    # Access the STORED session directly
    stored = await _get_or_hydrate_session(session_id)

    _apply_segment_edits(stored, request.segment_edits)
    topic = stored.state.get("topic", "")

    await _persist_session_state(session_id, {
        "pipeline_stage": "storyboard",
        "autonomous_mode": request.autonomous,
    })

    queue: asyncio.Queue = asyncio.Queue()
    _session_queues[session_id] = queue

    background_tasks.add_task(_run_pipeline, session_id, topic, queue)

    return {"session_id": session_id}


@router.post("/generate-video/{session_id}")
async def generate_video(session_id: str, request: GenerateVideoRequest, background_tasks: BackgroundTasks):
    """
    Trigger video generation after user reviews the storyboard.
    Applies segment edits, stores selected storyboard segments, sets pipeline_stage to 'video'.
    """
    # Access the STORED session directly
    stored = await _get_or_hydrate_session(session_id)

    _apply_segment_edits(stored, request.segment_edits)
    topic = stored.state.get("topic", "")

    await _persist_session_state(session_id, {
        "pipeline_stage": "video",
        "autonomous_mode": request.autonomous,
        "selected_storyboard_segments": request.selected_storyboard_segments,
        "voice_preference": request.voice_preference,
    })

    queue: asyncio.Queue = asyncio.Queue()
    _session_queues[session_id] = queue

    background_tasks.add_task(_run_pipeline, session_id, topic, queue)

    return {"session_id": session_id}


@router.patch("/session/{session_id}/segment/{segment_number}")
async def update_segment(session_id: str, segment_number: int, request: SegmentUpdateRequest):
    """Update a single segment's editable fields in session state."""
    stored = await _get_or_hydrate_session(session_id)

    doc_script = stored.state.get("documentary_script", {})
    if not isinstance(doc_script, dict):
        raise HTTPException(status_code=404, detail="Documentary script not found")

    segments = doc_script.get("segments", [])
    for seg in segments:
        if seg.get("segment_number") == segment_number:
            if request.narration_chunk is not None:
                seg["narration_chunk"] = request.narration_chunk
            if request.veo_prompt is not None:
                seg["veo_prompt"] = request.veo_prompt
            if request.segment_title is not None:
                seg["segment_title"] = request.segment_title
            doc_script["segments"] = segments
            stored.state["documentary_script"] = doc_script
            await persist_current_session(session_id, session_service, APP_NAME, USER_ID)
            return {"ok": True}

    raise HTTPException(status_code=404, detail=f"Segment {segment_number} not found")

@router.get("/session/{session_id}/segment/{segment_number}/regenerate-image")
async def regenerate_image(session_id: str, segment_number: int):
    """
    Regenerate a single storyboard image for a segment.
    Returns an SSE stream: emits segment_media_done then closes.
    """
    from backend.agents.media_agent import _generate_act_media, _upload_storyboard_image
    from backend.config.genai_client import get_client

    try:
        await _get_or_hydrate_session(session_id)
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=session_id,
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")

    doc_script = session.state.get("documentary_script", {})
    if not isinstance(doc_script, dict):
        raise HTTPException(status_code=404, detail="Documentary script not found")

    segments = doc_script.get("segments", [])
    segment = next((s for s in segments if s.get("segment_number") == segment_number), None)
    if segment is None:
        raise HTTPException(status_code=404, detail=f"Segment {segment_number} not found")

    async def _regen_stream():
        client = get_client()
        try:
            result = await _generate_act_media(client, segment)
        except Exception as e:
            logger.error(f"[{session_id}] Regenerate image for segment {segment_number} failed: {e}")
            result = {
                "act_number": segment_number,
                "act_title": segment.get("segment_title", ""),
                "narration": segment.get("narration_chunk", ""),
                "image_b64": "",
                "image_mime": "image/png",
            }

        image_url = _upload_storyboard_image(session_id, result["act_number"], result["image_b64"], result["image_mime"])
        persisted_result = {
            "segment_number": result["act_number"],
            "segment_title": result["act_title"],
            "narration_chunk": result["narration"],
            "image_url": image_url,
            "image_mime": result["image_mime"],
        }

        # Update media_segments in session state
        media_segments = session.state.get("media_segments", [])
        replaced = False
        for i, ms in enumerate(media_segments):
            ms_num = ms.get("act_number", ms.get("segment_number", 0))
            if ms_num == segment_number:
                media_segments[i] = persisted_result
                replaced = True
                break
        if not replaced:
            media_segments.append(persisted_result)
        session.state["media_segments"] = media_segments
        await persist_current_session(session_id, session_service, APP_NAME, USER_ID)

        event_data = json.dumps({
            "segment_number": persisted_result["segment_number"],
            "segment_title": persisted_result["segment_title"],
            "narration_chunk": persisted_result["narration_chunk"],
            "image_url": persisted_result["image_url"],
            "image_mime": persisted_result["image_mime"],
        })
        yield f"event: segment_media_done\ndata: {event_data}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        _regen_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/session/{session_id}/segment/{segment_number}/regenerate-video-clip")
async def regenerate_video_clip(session_id: str, segment_number: int, request: RegenerateVideoClipRequest):
    """
    Regenerate a single video clip for a segment with a custom prompt.
    """
    from backend.agents.video_agent import _generate_clip_with_retry, _pick_clip_references, _get_lut_path, _extract_segments
    from backend.prompts.style_bible import get_style_bible
    import tempfile
    import hashlib

    stored = await _get_or_hydrate_session(session_id)
    doc_script = stored.state.get("documentary_script", {})
    segments = _extract_segments(doc_script)
    target_seg = next((s for s in segments if s.get("segment_number") == segment_number), None)
    
    if not target_seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    # Update the veo_prompt for this segment with the user's custom instruction
    original_prompt = target_seg.get("veo_prompt", "")
    target_seg["veo_prompt"] = f"{original_prompt}. User instruction: {request.user_prompt}"

    year = stored.state.get("detected_year", 1969)
    style_bible = stored.state.get("style_bible", get_style_bible(year))
    lut_path = _get_lut_path(year)
    tmp_dir = tempfile.mkdtemp(prefix=f"chronicle_regen_{session_id}_")
    session_seed = int(hashlib.md5(session_id.encode()).hexdigest()[:8], 16) % (2**31)

    # Reference imagery
    media_segments = stored.state.get("media_segments", [])
    storyboard_by_seg = {
        ms.get("segment_number", 0): (ms.get("image_b64") or ms.get("image_url", ""))
        for ms in media_segments
    }
    character_reference_images = stored.state.get("character_reference_images", [])
    character_collage_b64 = stored.state.get("character_collage_b64")
    research_brief = stored.state.get("research_brief", {})
    key_figures = [
        figure.get("name", "")
        for figure in research_brief.get("key_figures", [])
        if isinstance(figure, dict) and figure.get("name")
    ] if isinstance(research_brief, dict) else []
    visual_style = stored.state.get("visual_style", "cinematic")

    start_frame, last_frame, character_refs, _ = _pick_clip_references(
        target_seg,
        segments,
        storyboard_by_seg,
        character_collage_b64,
        character_reference_images,
        key_figures=key_figures,
        visual_style=visual_style,
    )

    # We need to know the narration duration to match the clip length
    narration_acts_audio = stored.state.get("narration_acts_audio", [])
    current_narration = next((na for na in narration_acts_audio if na["act_number"] == segment_number), {})
    duration = current_narration.get("duration", 8.0)

    try:
        new_clip = await _generate_clip_with_retry(
            window_index=segment_number - 1,
            act=target_seg,
            session_id=session_id,
            style_bible=style_bible,
            lut_path=lut_path,
            tmp_dir=tmp_dir,
            session_seed=session_seed,
            start_frame_b64=start_frame,
            last_frame_b64=last_frame,
            reference_images_b64=character_refs,
            visual_style=visual_style,
            narration_duration=duration
        )

        # Update the video_clips list in session state
        video_clips = stored.state.get("video_clips", [])
        updated = False
        for i, clip in enumerate(video_clips):
            if clip.get("act_number") == segment_number:
                video_clips[i] = new_clip
                updated = True
                break
        if not updated:
            video_clips.append(new_clip)
        
        await _persist_session_state(session_id, {"video_clips": video_clips})

        queue = _session_queues.get(session_id)
        if queue:
            await queue.put({
                "event": "clip_done",
                "data": {
                    "segment_number": segment_number,
                    "segment_title": target_seg.get("segment_title", ""),
                    "clip_signed_url": new_clip["signed_url"],
                    "window_index": new_clip["window_index"]
                }
            })

        return {"ok": True, "clip": new_clip}

    except Exception as e:
        logger.error(f"[{session_id}] Regenerate clip {segment_number} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/{session_id}/regenerate-video-all")
async def regenerate_video_all(session_id: str, background_tasks: BackgroundTasks):
    """
    Restart the entire video generation phase.
    """
    stored = await _get_or_hydrate_session(session_id)
    topic = stored.state.get("topic", "")

    # Reset pipeline stage and clear existing video data
    await _persist_session_state(session_id, {
        "pipeline_stage": "video",
        "video_clips": [],
        "assembling": False,
        "assembly_percent": 0
    })

    queue = asyncio.Queue()
    _session_queues[session_id] = queue

    background_tasks.add_task(_run_pipeline, session_id, topic, queue)

    return {"ok": True}


class GenerateCharactersRequest(BaseModel):
    user_prompt: str = ""

@router.post("/characters/{session_id}")
async def regenerate_characters(session_id: str, request: GenerateCharactersRequest, background_tasks: BackgroundTasks):
    """Manually trigger character reference search from the current research brief."""
    stored = await _get_or_hydrate_session(session_id)
    topic = stored.state.get("topic", "")
    
    updates: dict[str, Any] = {
        "pipeline_stage": "characters",
        "autonomous_mode": False,  # Manual trigger implies user wants control
    }
    if request.user_prompt.strip():
        updates["character_instructions"] = request.user_prompt.strip()
    else:
        stored.state.pop("character_instructions", None)

    await _persist_session_state(session_id, updates)

    queue: asyncio.Queue = asyncio.Queue()
    _session_queues[session_id] = queue
    
    background_tasks.add_task(_run_pipeline, session_id, topic, queue)

    return {"session_id": session_id}


@router.get("/session/{session_id}/characters")
async def get_characters(session_id: str):
    """Retrieve character references for a session."""
    try:
        await _get_or_hydrate_session(session_id)
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=session_id,
        )
        return {
            "character_reference_images": session.state.get("character_reference_images", []),
            "character_collage_b64": session.state.get("character_collage_b64"),
        }
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Clean up a session."""
    _session_queues.pop(session_id, None)
    try:
        await session_service.delete_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=session_id,
        )
    except Exception:
        pass
    await get_persistence_service().delete_session_state(session_id)
    return {"deleted": True}


@router.post("/session/{session_id}/segment/{segment_number}/rewrite")
async def rewrite_segment(
    session_id: str,
    segment_number: int,
    request: RewriteSegmentRequest
):
    """Rewrite a specific segment's narration using AI."""
    from backend.config.genai_client import get_client

    try:
        stored = await _get_or_hydrate_session(session_id)
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=session_id,
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")

    doc_script = session.state.get("documentary_script", {})
    if not isinstance(doc_script, dict):
        raise HTTPException(status_code=500, detail="Invalid script state")

    segments = doc_script.get("segments", [])
    target_seg = next((s for s in segments if s.get("segment_number") == segment_number), None)
    
    if not target_seg:
        raise HTTPException(status_code=404, detail="Segment not found")
        
    old_narration = target_seg.get("narration_chunk", "")
    era_style = session.state.get("era_style", "")

    client = get_client()
    prompt = f"""You are a documentary writer. Rewrite this narration chunk (max 18 words).
User instruction: {request.user_prompt}

Original chunk: {old_narration}
Era style context: {era_style}

Return ONLY the rewritten text, nothing else. NO quotes around it. Max 18 words."""

    try:
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.7)
        )
        new_text = response.text.strip().strip('"').strip()
    except Exception as e:
        logger.exception("Failed to call LLM for narrative rewrite")
        raise HTTPException(status_code=500, detail=str(e))
        
    target_seg["narration_chunk"] = new_text
    
    # Save back to state
    await _persist_session_state(session_id, {"documentary_script": doc_script})
    
    return {"status": "success", "new_narration": new_text}
