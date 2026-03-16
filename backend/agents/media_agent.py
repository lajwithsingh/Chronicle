import asyncio
import base64
import json
import logging
import random
import time
from typing import Any, AsyncGenerator

from httpx import RequestError
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types
from google.genai.errors import ClientError

from backend.config.genai_client import get_image_client
from backend.config.settings import settings
from backend.prompts.visual_styles import get_gemini_style_prompt
from backend.services.persistence import sync_state
from backend.tools import gcs_tool

logger = logging.getLogger("chronicle.media_agent")

IMAGE_GENERATION_CONCURRENCY = max(1, settings.IMAGE_GENERATION_CONCURRENCY)
IMAGE_GENERATION_RETRIES = 6
MAX_GLOBAL_COOLDOWN_SECONDS = 90


class _ImageRateLimiter:
    """Coordinate cooldowns across all storyboard image requests."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._cooldown_until = 0.0
        self._recent_429s = 0
        self._next_request_at = 0.0

    async def wait_for_turn(self, act_number: int) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                wait_for = max(self._cooldown_until, self._next_request_at) - now
                if wait_for <= 0:
                    self._next_request_at = now + max(0.0, settings.IMAGE_REQUEST_SPACING_SECONDS)
                    return
            logger.info(
                "Act %s waiting %.1fs for shared Gemini image cooldown",
                act_number,
                wait_for,
            )
            await asyncio.sleep(wait_for)

    async def note_success(self) -> None:
        async with self._lock:
            self._recent_429s = max(0, self._recent_429s - 1)

    async def note_rate_limit(self, act_number: int, attempt: int) -> float:
        async with self._lock:
            self._recent_429s += 1
            base_delay = min(10 * (2 ** (attempt - 1)), 60)
            pressure_delay = min(self._recent_429s * 4, 20)
            delay = min(
                base_delay + pressure_delay + random.uniform(0, 3),
                MAX_GLOBAL_COOLDOWN_SECONDS,
            )
            self._cooldown_until = max(self._cooldown_until, time.monotonic() + delay)
            logger.warning(
                "Act %s hit 429. Applying shared storyboard cooldown of %.1fs (attempt %s, recent_429s=%s)",
                act_number,
                delay,
                attempt,
                self._recent_429s,
            )
            return delay


_IMAGE_CONCURRENCY = asyncio.Semaphore(IMAGE_GENERATION_CONCURRENCY)
_IMAGE_RATE_LIMITER = _ImageRateLimiter()


def _extract_acts(script_data: Any) -> list[dict]:
    """Extract documentary segments from documentary_script session state."""
    if isinstance(script_data, dict):
        segs = script_data.get("segments", [])
        if segs:
            return [s.model_dump() if hasattr(s, "model_dump") else s for s in segs]
        return script_data.get("acts", [])
    if hasattr(script_data, "segments"):
        segs = script_data.segments
        return [s.model_dump() if hasattr(s, "model_dump") else s for s in segs]
    if isinstance(script_data, list):
        return script_data
    return []


def _should_use_character_references(act: dict, key_figures: list[str]) -> bool:
    if not key_figures:
        return False

    searchable_text = " ".join(
        str(
            act.get(field, "")
        )
        for field in ["segment_title", "act_title", "narration_chunk", "narration", "veo_prompt"]
    ).lower()

    for figure in key_figures:
        figure = figure.strip().lower()
        if not figure:
            continue
        if figure in searchable_text:
            return True
        parts = [part for part in figure.split() if len(part) > 2]
        if parts and all(part in searchable_text for part in parts):
            return True

    return False


def _upload_storyboard_image(session_id: str, act_number: int, image_b64: str, image_mime: str) -> str | None:
    if not image_b64:
        return None

    ext = "png"
    if "/" in image_mime:
        ext = image_mime.split("/", 1)[1]

    blob_name = f"images/{session_id}/storyboard/segment_{act_number}.{ext}"
    gcs_tool.upload_bytes(base64.b64decode(image_b64), blob_name, content_type=image_mime)
    return gcs_tool.get_media_proxy_url(blob_name)


def _resolve_reference_image(image_ref: str | None) -> bytes | None:
    if not image_ref:
        return None

    try:
        if image_ref.startswith("/") and "/chronicle/media/" in image_ref:
            blob_name = image_ref.split("/chronicle/media/", 1)[1]
            client = gcs_tool.get_gcs_client()
            blob = client.bucket(settings.GCS_BUCKET).blob(blob_name)
            return blob.download_as_bytes()

        if image_ref.startswith("http") and "/chronicle/media/" in image_ref:
            blob_name = image_ref.split("/chronicle/media/", 1)[1]
            client = gcs_tool.get_gcs_client()
            blob = client.bucket(settings.GCS_BUCKET).blob(blob_name)
            return blob.download_as_bytes()

        return base64.b64decode(image_ref)
    except Exception:
        return None


def _build_storyboard_placeholder(act_number: int, act_title: str, narration: str, image_mime: str = "image/png") -> dict:
    return {
        "act_number": act_number,
        "act_title": act_title,
        "narration": narration,
        "image_b64": "",
        "image_mime": image_mime,
        "image_status": "failed",
    }


def _extract_candidate_parts(response: Any) -> tuple[list[Any], str | None]:
    candidates = response.candidates if getattr(response, "candidates", None) else []
    if not candidates:
        finish_reason = getattr(response, "prompt_feedback", None)
        return [], f"No candidates returned (feedback={finish_reason!r})"

    candidate = candidates[0]
    content = getattr(candidate, "content", None)
    parts = getattr(content, "parts", None) if content else None
    if not parts:
        finish_reason = getattr(candidate, "finish_reason", None)
        return [], f"Candidate had no content parts (finish_reason={finish_reason!r})"
    return list(parts), None


async def _generate_act_media(
    client,
    act: dict,
    character_collage: str | None = None,
    key_figures: list[str] | None = None,
    visual_style: str = "cinematic",
    max_retries: int = IMAGE_GENERATION_RETRIES,
) -> dict:
    """Generate narration text and an illustration for a single documentary segment."""
    act_number = act.get("segment_number", act.get("act_number", 0))
    act_title = act.get("segment_title", act.get("act_title", ""))
    narration = act.get("narration_chunk", act.get("narration", ""))
    veo_prompt = act.get("veo_prompt", "")
    emotional_beat = act.get("emotional_beat", "")
    visual_purpose = act.get("visual_purpose", "")
    veo_visual_brief = veo_prompt[:300] if veo_prompt else ""

    content_parts: list[Any] = []
    style_prompt = get_gemini_style_prompt(visual_style)

    reference_images_attached = 0
    use_character_refs = _should_use_character_references(act, key_figures or [])
    if use_character_refs:
        resolved_collage = _resolve_reference_image(character_collage)
        if resolved_collage:
            content_parts.append(
                types.Part.from_bytes(
                    data=resolved_collage,
                    mime_type="image/png",
                )
            )
            reference_images_attached += 1

    anchor_instruction = ""
    if reference_images_attached > 0:
        anchor_instruction = (
            "The attached image is the style-adapted character reference collage. "
            "Preserve the same identity, facial structure, age cues, and wardrobe silhouette from that collage."
        )

    prompt_text = f"""Mosaic documentary image for a factual documentary or news video.

{style_prompt}

{anchor_instruction}

Segment {act_number} ({visual_purpose}): {act_title}

Generate only the image for this segment.
Base narration context: {narration}
Key Visual Detail: {veo_visual_brief}
Emotional Score: {emotional_beat}
"""

    content_parts.append(types.Part.from_text(text=prompt_text))

    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            await _IMAGE_RATE_LIMITER.wait_for_turn(act_number)
            async with _IMAGE_CONCURRENCY:
                response = await client.aio.models.generate_content(
                    model=settings.GEMINI_IMAGE_MODEL,
                    contents=content_parts,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(aspect_ratio="16:9"),
                    ),
                )

            parts, parse_error = _extract_candidate_parts(response)
            if parse_error:
                logger.warning("Act %s %s", act_number, parse_error)
                last_exc = ValueError(parse_error)
                if attempt < max_retries:
                    await asyncio.sleep(2 + random.uniform(0, 2))
                    continue
                break

            image_b64 = ""
            image_mime = "image/png"
            for part in parts:
                if getattr(part, "inline_data", None):
                    inline_data = part.inline_data
                    if getattr(inline_data, "data", None):
                        image_b64 = base64.b64encode(inline_data.data).decode()
                        image_mime = inline_data.mime_type or "image/png"

            if not image_b64:
                finish_reason = getattr(response.candidates[0], "finish_reason", None)
                safety_ratings = getattr(response.candidates[0], "safety_ratings", None)
                logger.warning(
                    "Act %s response had no image part - finish_reason=%r safety_ratings=%r",
                    act_number,
                    finish_reason,
                    safety_ratings,
                )
                last_exc = ValueError(f"Response had no image part (finish_reason={finish_reason!r})")
                if attempt < max_retries:
                    await asyncio.sleep(2 + random.uniform(0, 2))
                    continue
                break

            await _IMAGE_RATE_LIMITER.note_success()
            return {
                "act_number": act_number,
                "act_title": act_title,
                "narration": narration,
                "image_b64": image_b64,
                "image_mime": image_mime,
                "image_status": "ready",
            }

        except (ClientError, RequestError) as e:
            is_rate_limit = isinstance(e, ClientError) and e.code == 429
            is_request_error = isinstance(e, RequestError)
            last_exc = e

            if is_rate_limit and attempt < max_retries:
                delay = await _IMAGE_RATE_LIMITER.note_rate_limit(act_number, attempt)
                await asyncio.sleep(delay)
                continue

            if is_request_error and attempt < max_retries:
                delay = min(4 * (2 ** (attempt - 1)) + random.uniform(0, 2), 30)
                logger.warning(
                    "Act %s connectivity issue (%s), retrying in %.1fs (attempt %s)",
                    act_number,
                    type(e).__name__,
                    delay,
                    attempt,
                )
                await asyncio.sleep(delay)
                continue

            logger.error("Act %s %s: %s", act_number, type(e).__name__, e)
            break
        except Exception as e:
            logger.error("Act %s unexpected error: %s", act_number, e, exc_info=True)
            last_exc = e
            if attempt < max_retries:
                await asyncio.sleep(2 + random.uniform(0, 2))
                continue
            break

    logger.error("Act %s image generation gave up after %s attempts: %s", act_number, max_retries, last_exc)
    return _build_storyboard_placeholder(act_number, act_title, narration)


class InterleavedMediaAgent(BaseAgent):
    """
    Gemini 2.5 Flash Image generates narration text and illustrations together.
    Storyboard generation uses bounded concurrency and shared cooldowns so
    quota pressure does not take down the whole batch.
    """

    model_config = {"arbitrary_types_allowed": True}

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        segments = _extract_acts(ctx.session.state.get("documentary_script", {}))

        if not segments:
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(text=json.dumps({
                            "sse_type": "error",
                            "agent": self.name,
                            "message": "No documentary segments found for storyboard generation",
                            "recoverable": False,
                        }))
                    ],
                ),
            )
            return

        client = get_image_client()
        character_collage = ctx.session.state.get("character_collage_b64")
        research_brief = ctx.session.state.get("research_brief", {})
        key_figures = [
            figure.get("name", "")
            for figure in research_brief.get("key_figures", [])
            if isinstance(figure, dict) and figure.get("name")
        ] if isinstance(research_brief, dict) else []
        visual_style = ctx.session.state.get("visual_style", "cinematic")
        session_id = ctx.session.id
        session_service = ctx.session_service
        app_name = getattr(ctx.session, "app_name", settings.APP_NAME)
        user_id = ctx.user_id

        existing_media = {
            seg.get("segment_number"): seg
            for seg in ctx.session.state.get("media_segments", [])
            if isinstance(seg, dict) and seg.get("segment_number") is not None
        }
        failed_segments: set[int] = set(ctx.session.state.get("storyboard_failed_segments", []))

        async def _run_segment(seg_idx: int, seg: dict) -> dict:
            act_num = seg.get("segment_number", seg.get("act_number", seg_idx + 1))
            act_title = seg.get("segment_title", seg.get("act_title", "Untitled"))
            logger.info("Generating image for segment %s: %s", act_num, act_title)
            return await _generate_act_media(
                client,
                seg,
                character_collage=character_collage,
                key_figures=key_figures,
                visual_style=visual_style,
            )

        tasks = [asyncio.create_task(_run_segment(i, seg)) for i, seg in enumerate(segments)]

        try:
            for task in asyncio.as_completed(tasks):
                res = await task
                previous_result = existing_media.get(res["act_number"])
                image_url = _upload_storyboard_image(
                    session_id,
                    res["act_number"],
                    res["image_b64"],
                    res["image_mime"],
                )

                if not image_url and previous_result and previous_result.get("image_url"):
                    persisted_result = {
                        **previous_result,
                        "segment_number": res["act_number"],
                        "segment_title": res["act_title"],
                        "narration_chunk": res["narration"],
                        "image_status": "stale",
                    }
                else:
                    persisted_result = {
                        "segment_number": res["act_number"],
                        "segment_title": res["act_title"],
                        "narration_chunk": res["narration"],
                        "image_url": image_url,
                        "image_mime": res["image_mime"],
                        "image_status": res.get("image_status", "ready"),
                    }
                existing_media[res["act_number"]] = persisted_result

                if image_url:
                    failed_segments.discard(res["act_number"])
                else:
                    failed_segments.add(res["act_number"])

                ordered_storyboard = [
                    existing_media[seg.get("segment_number", seg.get("act_number", idx + 1))]
                    for idx, seg in enumerate(segments)
                    if seg.get("segment_number", seg.get("act_number", idx + 1)) in existing_media
                ]

                await sync_state(
                    session_id,
                    {
                        "media_segments": ordered_storyboard,
                        "storyboard": ordered_storyboard,
                        "storyboard_failed_segments": sorted(failed_segments),
                        "pipeline_stage": "storyboard",
                    },
                    session_service,
                    app_name,
                    user_id,
                )

                yield Event(
                    author=self.name,
                    content=types.Content(
                        role="model",
                        parts=[
                            types.Part.from_text(
                                text=json.dumps(
                                    {
                                        "sse_type": "segment_media_done",
                                        "segment_number": res["act_number"],
                                        "segment_title": res["act_title"],
                                        "narration_chunk": res["narration"],
                                        "image_url": persisted_result.get("image_url"),
                                        "image_mime": persisted_result["image_mime"],
                                        "image_status": persisted_result.get("image_status", "ready"),
                                    }
                                )
                            )
                        ],
                    ),
                )
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()

        # Sequential retry pass — any segment that failed all concurrent attempts gets
        # another go without competing for quota with other segments.
        if failed_segments:
            logger.info(
                "Retry pass: %d segment(s) failed during concurrent phase — retrying sequentially",
                len(failed_segments),
            )
            for retry_seg in segments:
                act_num = retry_seg.get("segment_number", retry_seg.get("act_number", 0))
                if act_num not in failed_segments:
                    continue
                logger.info("Retry pass: segment %s", act_num)
                res = await _generate_act_media(
                    client,
                    retry_seg,
                    character_collage=character_collage,
                    key_figures=key_figures,
                    visual_style=visual_style,
                    max_retries=4,
                )
                image_url = _upload_storyboard_image(
                    session_id, res["act_number"], res["image_b64"], res["image_mime"]
                )
                if image_url:
                    failed_segments.discard(act_num)
                persisted_result = {
                    "segment_number": res["act_number"],
                    "segment_title": res["act_title"],
                    "narration_chunk": res["narration"],
                    "image_url": image_url,
                    "image_mime": res["image_mime"],
                    "image_status": res.get("image_status", "ready") if image_url else "failed",
                }
                existing_media[act_num] = persisted_result
                ordered_storyboard = [
                    existing_media[s.get("segment_number", s.get("act_number", idx + 1))]
                    for idx, s in enumerate(segments)
                    if s.get("segment_number", s.get("act_number", idx + 1)) in existing_media
                ]
                await sync_state(
                    session_id,
                    {
                        "media_segments": ordered_storyboard,
                        "storyboard": ordered_storyboard,
                        "storyboard_failed_segments": sorted(failed_segments),
                        "pipeline_stage": "storyboard",
                    },
                    session_service,
                    app_name,
                    user_id,
                )
                yield Event(
                    author=self.name,
                    content=types.Content(
                        role="model",
                        parts=[
                            types.Part.from_text(
                                text=json.dumps({
                                    "sse_type": "segment_media_done",
                                    "segment_number": res["act_number"],
                                    "segment_title": res["act_title"],
                                    "narration_chunk": res["narration"],
                                    "image_url": persisted_result.get("image_url"),
                                    "image_mime": persisted_result["image_mime"],
                                    "image_status": persisted_result.get("image_status", "ready"),
                                })
                            )
                        ],
                    ),
                )
