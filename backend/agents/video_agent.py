import asyncio
import base64
import json
import logging
import math
import os
import subprocess
import tempfile
import wave
from typing import AsyncGenerator
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types
from backend.config.settings import settings
from backend.config.genai_client import get_client
from backend.prompts.style_bible import get_style_bible
from backend.prompts.visual_styles import get_veo_style_suffix
from backend.tools import veo_tool, gcs_tool, assembly_tool, tts_tool

logger = logging.getLogger("chronicle.video_agent")

MAX_CLIPS = 12
MAX_NARRATION_SECONDS = 90.0
CLIP_DURATION = 8
VEO_RETRY_ATTEMPTS = 5

# Ambient-only audio direction injected into every Veo prompt.
# Veo generates soft environment sounds + subtle background music — NO narration voice.
_AMBIENT_AUDIO = (
    "Audio: soft natural environmental sounds of the era — ambient atmosphere only. "
    "Subtle period-appropriate background music at very low volume. "
    "No narration voice. No dialogue. No loud sound effects."
)


def _extract_segments(script_data) -> list[dict]:
    if isinstance(script_data, dict):
        segs = script_data.get("segments", [])
        if segs:
            return [s.model_dump() if hasattr(s, "model_dump") else s for s in segs]
        return script_data.get("acts", [])
    elif hasattr(script_data, "segments"):
        segs = script_data.segments
        return [s.model_dump() if hasattr(s, "model_dump") else s for s in segs]
    elif isinstance(script_data, list):
        return script_data
    return []


def _resolve_image_reference(image_ref: str | None) -> str | None:
    """Return base64 image data from either raw base64 or a proxied GCS URL."""
    if not image_ref:
        return None

    if image_ref.startswith("/") and "/chronicle/media/" in image_ref:
        blob_name = image_ref.split("/chronicle/media/", 1)[1]
        client = gcs_tool.get_gcs_client()
        blob = client.bucket(settings.GCS_BUCKET).blob(blob_name)
        return base64.b64encode(blob.download_as_bytes()).decode()

    if image_ref.startswith("http") and "/chronicle/media/" in image_ref:
        blob_name = image_ref.split("/chronicle/media/", 1)[1]
        client = gcs_tool.get_gcs_client()
        blob = client.bucket(settings.GCS_BUCKET).blob(blob_name)
        return base64.b64encode(blob.download_as_bytes()).decode()

    return image_ref


def _get_lut_path(year: int) -> str:
    base = os.path.join(os.path.dirname(__file__), "..", "assets", "luts")
    if year <= 1979:
        return os.path.join(base, "documentary_archival.cube")
    elif year <= 1988:
        return os.path.join(base, "broadcast_tape.cube")
    else:
        return os.path.join(base, "betacam_night.cube")


def _get_wav_duration(path: str) -> float:
    try:
        with wave.open(path, "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        return CLIP_DURATION


def _create_silent_audio(output_path: str, duration: int = 8) -> str:
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg = "ffmpeg"
    subprocess.run([
        ffmpeg, "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", str(duration), "-y", output_path,
    ], check=True, capture_output=True)
    return output_path


def _get_documentary_prefix(visual_style: str) -> str:
    if visual_style == "rotoscope":
        return "Rotoscope documentary scene. Stylized animated imagery, not photoreal live-action footage. "
    if visual_style == "illustrated":
        return "Illustrated documentary scene. Painted editorial artwork, not photoreal live-action footage. "
    if visual_style == "anime":
        return "Animated documentary scene. Hand-drawn anime imagery, not photoreal live-action footage. "
    return "Documentary live-action scene. "


def _get_style_override(visual_style: str) -> str:
    if visual_style == "rotoscope":
        return (
            "TOP PRIORITY STYLE INSTRUCTION: This clip must be rotoscope animation. "
            "It must look illustrated and traced, not like live-action cinema. "
            "Render people as stylized animated figures with bold outlines, graphic shadow masses, "
            "posterized cel-shading, flattened color planes, and drawn facial features. "
            "Do not render realistic skin, realistic pores, cinematic lens behavior, or natural live-action humans."
        )
    if visual_style == "illustrated":
        return (
            "TOP PRIORITY STYLE INSTRUCTION: This clip must be painted illustration. "
            "It must look like editorial concept art, not like live-action cinema. "
            "Render all people and environments with painterly brushwork, canvas texture, and stylized forms."
        )
    if visual_style == "anime":
        return (
            "TOP PRIORITY STYLE INSTRUCTION: This clip must be hand-drawn anime animation. "
            "It must look animated, not like live-action cinema. "
            "Render all people and environments with clean linework, cel shading, and stylized animated forms."
        )
    return ""


def _get_era_thematic_template(visual_style: str) -> str:
    if visual_style == "rotoscope":
        return (
            "Rotoscope documentary scene illustrating a {visual_purpose} moment in history. "
            "Period-accurate figures traced from live action with bold outlines, graphic novel shading, "
            "posterized cel-shaded shadows, and a limited dramatic color palette. "
            "Authentic wardrobe, props, and location details. Subject pauses in a strong held pose. (no subtitles!) "
            + _AMBIENT_AUDIO +
            " Negative: photorealistic footage, lens flare, shallow depth of field, text overlays, watermarks, modern objects."
        )
    if visual_style == "illustrated":
        return (
            "Painted documentary scene illustrating a {visual_purpose} moment in history. "
            "Period-accurate figures rendered as editorial concept art with painterly brushstrokes, "
            "canvas texture, and controlled chiaroscuro. Authentic wardrobe, props, and location details. "
            "Subject pauses in a strong held pose. (no subtitles!) "
            + _AMBIENT_AUDIO +
            " Negative: photorealistic footage, anime, text overlays, watermarks, modern objects."
        )
    if visual_style == "anime":
        return (
            "Animated documentary scene illustrating a {visual_purpose} moment in history. "
            "Period-accurate figures rendered with clean linework, cel shading, expressive silhouettes, "
            "and lush animated background depth. Authentic wardrobe, props, and location details. "
            "Subject pauses in a strong held pose. (no subtitles!) "
            + _AMBIENT_AUDIO +
            " Negative: photorealistic footage, oil painting, text overlays, watermarks, modern objects."
        )
    return (
        "Documentary scene illustrating a {visual_purpose} moment in history. "
        "Period-accurate figures in authentic clothing gathered in a significant location. "
        "Strong composition, clear subject focus, grounded physical detail. "
        "Warm practical light, visible fabric weave, subject holds still and regards camera. (no subtitles!) "
        + _AMBIENT_AUDIO +
        " Negative: text overlays, watermarks, modern objects, extra limbs."
    )


def _get_safe_fallback(visual_style: str) -> str:
    if visual_style == "rotoscope":
        return (
            "Rotoscope documentary establishing shot. "
            "Wide view across an authentic context-accurate environment rendered with bold outlines, "
            "graphic novel shading, cel-shaded shadow blocks, and a limited stark color palette. "
            "Stylized figures in period clothing stand in clear silhouette. Camera locked-off, completely still. (no subtitles!) "
            + _AMBIENT_AUDIO +
            " Negative: photorealistic footage, lens flare, shallow depth of field, violence, weapons, modern objects."
        )
    if visual_style == "illustrated":
        return (
            "Illustrated documentary establishing shot. "
            "Wide view across an authentic context-accurate environment rendered as painterly concept art "
            "with visible brush texture and controlled color blocks. Stylized figures in period clothing "
            "stand in clear silhouette. Camera locked-off, completely still. (no subtitles!) "
            + _AMBIENT_AUDIO +
            " Negative: photorealistic footage, anime, violence, weapons, modern objects."
        )
    if visual_style == "anime":
        return (
            "Animated documentary establishing shot. "
            "Wide view across an authentic context-accurate environment with clean linework, cel shading, "
            "and lush stylized background layers. Figures in period clothing stand in clear silhouette. "
            "Camera locked-off, completely still. (no subtitles!) "
            + _AMBIENT_AUDIO +
            " Negative: photorealistic footage, oil painting, violence, weapons, modern objects."
        )
    return (
        "Documentary establishing shot. "
        "Wide view across an authentic context-accurate environment. "
        "Neutral subjects in period clothing engaged in everyday activities. "
        "Camera locked-off, completely still, strong visual clarity, grounded lighting. "
        "Natural skin texture, visible fabric weave. Subject holds still. (no subtitles!) "
        + _AMBIENT_AUDIO +
        " Negative: text overlays, watermarks, violence, weapons, modern objects."
    )


def _compose_style_context(style_bible: str, visual_style: str) -> str:
    if not style_bible:
        return ""

    if visual_style == "cinematic":
        return style_bible

    sanitized_style_bible = style_bible
    for phrase in [
        "Cinematic aesthetic,",
        "Cinematic 4K documentary style,",
        "Cinematic reportage style,",
        "anamorphic lens flares,",
        "anamorphic lens,",
        "shallow depth of field,",
        "ARRI Alexa aesthetic,",
        "organic texture,",
        "Natural skin texture,",
        "fine skin pores,",
        "visible fabric weave.",
        "dramatic lighting.",
        "naturalistic lighting.",
        "cinematic rim lighting.",
    ]:
        sanitized_style_bible = sanitized_style_bible.replace(phrase, "")

    return (
        f"Selected visual style is {visual_style}. This selected style is the top priority. "
        "Use the style bible below only for historical props, wardrobe, setting, and mood continuity. "
        "Do not let it override the selected rendering style.\n"
        f"{sanitized_style_bible.strip()}"
    )


def _is_content_filter(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "no videos" in msg
        or "content filter" in msg
        or "could not be submitted" in msg
        or "usage guidelines" in msg
        or "'code': 3" in msg
        or '"code": 3' in msg
        or "support codes:" in msg
    )


async def _sanitize_veo_prompt(veo_prompt: str, visual_style: str) -> str:
    instruction = (
        "You are a Veo 3.1 prompt safety specialist.\n"
        "The following video prompt was rejected by Vertex AI content filters.\n"
        "Rewrite it to pass filters by substituting ONLY the unsafe words:\n"
        "  explosion/bomb/bombing → 'smoke-filled ruins' or 'devastated architecture'\n"
        "  surrender → 'document-signing ceremony'\n"
        "  kill/death/massacre/executed → 'solemn gathering' or 'aftermath of conflict'\n"
        "  weapons/guns/rifle → 'contextual artifacts' or remove\n"
        "  war/battle/combat → 'authentic period or contemporary scene'\n"
        "  shoot/shot (weapon) → 'capture' / 'moment'\n"
        "  fire (weapon context) → 'flames' or 'light'\n"
        "  strike (attack context) → 'protest march' or 'gathering'\n"
        "  nuclear/atomic → 'industrial' or remove\n"
        "  child/kid → 'young person' or remove\n"
        "  ANY real person name → role only (e.g. 'the general', 'the leader')\n\n"
        "Rules:\n"
        "- Keep the SAME camera movement, lighting, era, and composition\n"
        f"- Keep the SAME selected visual style: {visual_style}\n"
        "- Do not introduce photorealistic live-action wording when the selected style is non-cinematic\n"
        "- Keep the SAME word count (80-110 words)\n"
        "- Return ONLY the rewritten prompt — no explanation\n\n"
        f"Original:\n{veo_prompt}"
    )
    try:
        client = get_client()
        response = await client.aio.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=instruction,
            config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=512),
        )
        sanitized = (response.text or "").strip()
        if len(sanitized) > 50:
            logger.info("Gemini sanitized Veo prompt successfully")
            return sanitized
    except Exception as e:
        logger.warning(f"Gemini prompt sanitization failed ({e}), using original")
    return veo_prompt


async def _generate_clip_with_retry(
    window_index: int,
    act: dict,
    session_id: str,
    style_bible: str,
    lut_path: str,
    tmp_dir: str,
    session_seed: int | None = None,
    start_frame_b64: str | None = None,
    last_frame_b64: str | None = None,
    reference_images_b64: list[str] | None = None,
    visual_style: str = "cinematic",
    narration_duration: float = CLIP_DURATION,
) -> dict:
    """
    Generate, download, process and upload a single Veo clip.
    Veo audio = ambient environment sounds + soft background music only (no narration).

    5-level prompt escalation on content-filter rejection:
      0 → full veo_prompt + ambient audio + style bible
      1 → Gemini-sanitized prompt + ambient audio + style bible
      2 → Gemini-sanitized prompt + ambient audio, no style bible
      3 → Era-thematic template + ambient audio
      4 → Fully static safe fallback + ambient audio
    """
    act_number = act.get("segment_number", act.get("act_number", window_index + 1))
    act_title = act.get("segment_title", act.get("act_title", f"Segment {act_number}"))
    visual_purpose = act.get("visual_purpose", "contextual")
    veo_prompt = act.get("veo_prompt", "")

    clip_blob = f"clips/{session_id}/window_{window_index}.mp4"
    output_gcs_prefix = f"gs://{settings.GCS_BUCKET}/{clip_blob}"
    style_context = _compose_style_context(style_bible, visual_style)

    last_exc = None
    content_filter_count = 0
    sanitized_prompt: str | None = None
    veo_visual_style = get_veo_style_suffix(visual_style)
    documentary_prefix = _get_documentary_prefix(visual_style)
    style_override = _get_style_override(visual_style)
    era_thematic_template = _get_era_thematic_template(visual_style)
    safe_fallback = _get_safe_fallback(visual_style)

    # Clamp narration duration to Veo's valid range (5–8s)
    clip_duration = int(min(8, max(5, round(narration_duration))))

    for attempt in range(VEO_RETRY_ATTEMPTS):
        if content_filter_count == 0:
            prompt = (
                style_override
                + "\n"
                + documentary_prefix
                + veo_prompt
                + "\n\n"
                + _AMBIENT_AUDIO
                + "\n"
                + veo_visual_style
                + "\n"
                + style_context
            )
        elif content_filter_count == 1:
            if sanitized_prompt is None:
                sanitized_prompt = await _sanitize_veo_prompt(veo_prompt, visual_style)
            prompt = (
                style_override
                + "\n"
                + documentary_prefix
                + sanitized_prompt
                + "\n\n"
                + _AMBIENT_AUDIO
                + "\n"
                + veo_visual_style
                + "\n"
                + style_context
            )
            logger.info(f"Clip window_{window_index}: Gemini-sanitized prompt (level 1)")
        elif content_filter_count == 2:
            prompt = (
                style_override
                + "\n"
                + documentary_prefix
                + (sanitized_prompt or veo_prompt)
                + "\n\n"
                + _AMBIENT_AUDIO
                + "\n"
                + veo_visual_style
            )
            logger.info(f"Clip window_{window_index}: sanitized, no style bible (level 2)")
        elif content_filter_count == 3:
            prompt = style_override + "\n" + era_thematic_template.format(visual_purpose=visual_purpose) + "\n" + veo_visual_style
            logger.info(f"Clip window_{window_index}: era-thematic fallback (level 3)")
        else:
            prompt = style_override + "\n" + safe_fallback + "\n" + veo_visual_style
            logger.info(f"Clip window_{window_index}: static safe fallback (level 4)")

        try:
            gcs_uri = await veo_tool.generate_video_clip(
                prompt=prompt,
                output_gcs_prefix=output_gcs_prefix,
                start_frame_b64=start_frame_b64,
                last_frame_b64=last_frame_b64,
                reference_images_b64=reference_images_b64,
                duration_seconds=clip_duration,
                aspect_ratio="16:9",
                seed=session_seed,
            )

            raw_path = os.path.join(tmp_dir, f"window_{window_index}_raw.mp4")
            processed_path = os.path.join(tmp_dir, f"window_{window_index}_processed.mp4")
            await veo_tool.download_clip_from_gcs(gcs_uri, raw_path)

            assembly_tool.process_clip(raw_path, processed_path, lut_path)

            processed_blob = f"clips/{session_id}/window_{window_index}_processed.mp4"
            processed_gcs_uri = gcs_tool.upload_file(processed_path, processed_blob)
            # Use backend proxy path — avoids CORS and signed URL expiration issues.
            # resolveMediaUrl() on the frontend prepends BACKEND_DIRECT automatically.
            signed_url = f"/chronicle/clip/{processed_blob}"

            if content_filter_count > 0:
                logger.info(
                    f"Clip window_{window_index} succeeded at prompt level {content_filter_count} "
                    f"(attempt {attempt + 1})"
                )

            return {
                "window_index": window_index,
                "act_number": act_number,
                "act_title": act_title,
                "visual_purpose": visual_purpose,
                "local_path": processed_path,
                "gcs_uri": processed_gcs_uri,
                "signed_url": signed_url,
                "duration_seconds": CLIP_DURATION,
            }

        except Exception as e:
            last_exc = e
            if _is_content_filter(e):
                content_filter_count += 1
                logger.warning(
                    f"Clip window_{window_index} attempt {attempt + 1} safety-filtered "
                    f"(escalating to level {content_filter_count}): {e}"
                )
            else:
                backoff = min(10 * (2 ** attempt), 60)
                logger.warning(
                    f"Clip window_{window_index} attempt {attempt + 1} transient error "
                    f"({type(e).__name__}) — retrying in {backoff}s: {e}"
                )
                if attempt < VEO_RETRY_ATTEMPTS - 1:
                    await asyncio.sleep(backoff)

    raise last_exc


def _pick_clip_references(
    act: dict,
    segments: list[dict],
    storyboard_by_seg: dict[int, str],
    character_collage_b64: str | None,
    character_reference_images: list[str],
    key_figures: list[str] | None = None,
    visual_style: str = "cinematic",
) -> tuple[str | None, str | None, list[str], list[int]]:
    """Return specific reference frames for Veo.

    Image order:
      1. Start image: storyboard for this segment (visual anchor for clip start)
      2. End image: storyboard for the NEXT segment (guides where clip ends visually)
      3. Character collage: all character reference portraits in one image

    Returns (start_frame_b64, last_frame_b64, character_refs, reference_segment_numbers).
    """
    seg_num = act.get("segment_number", act.get("act_number", 0))
    start_frame: str | None = None
    last_frame: str | None = None
    character_refs: list[str] = []
    ref_seg_nums: list[int] = []
    use_character_refs = False

    searchable_text = " ".join(
        str(act.get(field, ""))
        for field in ["segment_title", "act_title", "narration_chunk", "narration", "veo_prompt"]
    ).lower()
    for figure in (key_figures or []):
        normalized = figure.strip().lower()
        if not normalized:
            continue
        if normalized in searchable_text:
            use_character_refs = True
            break
        parts = [part for part in normalized.split() if len(part) > 2]
        if parts and all(part in searchable_text for part in parts):
            use_character_refs = True
            break

    # 1. Start image — current segment storyboard
    if seg_num in storyboard_by_seg:
        start_frame = _resolve_image_reference(storyboard_by_seg[seg_num])
        ref_seg_nums.append(seg_num)

    # 2. End image — next segment storyboard (for visual continuity)
    next_seg_num = seg_num + 1
    if next_seg_num in storyboard_by_seg:
        last_frame = _resolve_image_reference(storyboard_by_seg[next_seg_num])
        ref_seg_nums.append(next_seg_num)

    # 3. Character collage only — use the style-adapted collage as the sole character anchor.
    if use_character_refs and character_collage_b64:
        resolved = _resolve_image_reference(character_collage_b64)
        if resolved:
            character_refs.append(resolved)

    return start_frame, last_frame, character_refs, ref_seg_nums


class VideoAgent(BaseAgent):
    """
    Narration-first Veo pipeline:
    1. Generate TTS per segment → measure total narration duration (cap 90s)
    2. n_clips = min(12, ceil(total_duration / 8))
    3. Map each 8-second window to the act being narrated at that time
    4. Generate all clips in parallel — Veo audio = ambient + soft music only (no narration)
    5. Store clips + narration paths in session state for AssemblyAgent
       AssemblyAgent mixes: TTS narration (100%) over Veo ambient (20% volume)
    """
    model_config = {"arbitrary_types_allowed": True}

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        segments = _extract_segments(ctx.session.state.get("documentary_script", {}))

        if not segments:
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=json.dumps({
                        "sse_type": "error",
                        "agent": self.name,
                        "message": "No documentary segments found for video generation",
                        "recoverable": False,
                    }))],
                ),
            )
            return

        session_id = ctx.session.id
        year = ctx.session.state.get("detected_year", 1969)
        style_bible = ctx.session.state.get("style_bible", get_style_bible(year))
        lut_path = _get_lut_path(year)
        voice_preference = ctx.session.state.get("voice_preference", "male")
        tmp_dir = tempfile.mkdtemp(prefix=f"chronicle_{session_id}_")
        import hashlib
        session_seed = int(hashlib.md5(session_id.encode()).hexdigest()[:8], 16) % (2**31)

        # Step 1: Generate TTS per segment, measure durations
        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "video_progress",
                    "stage": "generating narration audio",
                    "percent": 5,
                }))],
            ),
        )

        narration_acts_audio = []
        cumulative_starts = []
        running_total = 0.0

        for seg in segments:
            seg_number = seg.get("segment_number", seg.get("act_number", 0))
            narration_text = seg.get("narration_chunk", seg.get("narration", ""))
            narration_path = os.path.join(tmp_dir, f"narration_seg_{seg_number}.wav")

            try:
                await tts_tool.generate_narration_audio(narration_text, narration_path, voice_preference)
            except Exception as e:
                logger.warning(f"Segment {seg_number} TTS failed ({e}), using silence")
                narration_path = _create_silent_audio(narration_path, duration=8)

            duration = _get_wav_duration(narration_path)
            cumulative_starts.append(running_total)
            running_total += duration

            narration_acts_audio.append({
                "act_number": seg_number,
                "narration_path": narration_path,
                "duration": duration,
                "narration_text": narration_text,
            })
            logger.info(f"Segment {seg_number} TTS: {duration:.1f}s (running total: {running_total:.1f}s)")

        total_narration_duration = min(running_total, MAX_NARRATION_SECONDS)

        # Step 2: 1-to-1 segment → clip mapping
        # Every segment gets its own unique Veo clip (no re-use, no time-window math).
        # Cap at MAX_CLIPS if somehow more segments than the limit.
        n_clips = min(MAX_CLIPS, len(segments))
        logger.info(f"Total narration: {total_narration_duration:.1f}s → {n_clips} clips (1 per segment)")

        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "video_progress",
                    "stage": f"narration ready ({total_narration_duration:.0f}s) — generating {n_clips} clips",
                    "percent": 15,
                    "n_clips": n_clips,
                    "total_narration_seconds": round(total_narration_duration, 1),
                }))],
            ),
        )

        # Step 3: Direct 1-to-1 segment → clip map
        window_acts = segments[:n_clips]

        # Step 4: Build per-clip storyboard reference map
        media_segments = ctx.session.state.get("media_segments", [])
        selected_storyboard = ctx.session.state.get("selected_storyboard_segments", [])

        # Build segment_number → image_b64 lookup from storyboard
        storyboard_by_seg: dict[int, str] = {}
        for ms in media_segments:
            seg_num = ms.get("act_number", ms.get("segment_number", 0))
            img = ms.get("image_b64") or ms.get("image_url", "")
            if img:
                storyboard_by_seg[seg_num] = img

        # If selected_storyboard_segments is non-empty, only use those
        if selected_storyboard:
            storyboard_by_seg = {k: v for k, v in storyboard_by_seg.items() if k in selected_storyboard}

        character_reference_images: list[str] = ctx.session.state.get("character_reference_images", [])
        character_collage_b64: str | None = ctx.session.state.get("character_collage_b64")
        research_brief = ctx.session.state.get("research_brief", {})
        key_figures = [
            figure.get("name", "")
            for figure in research_brief.get("key_figures", [])
            if isinstance(figure, dict) and figure.get("name")
        ] if isinstance(research_brief, dict) else []

        visual_style = ctx.session.state.get("visual_style", "cinematic")

        if storyboard_by_seg:
            logger.info(f"Using storyboard images for {len(storyboard_by_seg)} segment(s) as Veo reference")
        elif character_reference_images:
            logger.info(f"No storyboard images — falling back to {len(character_reference_images)} character reference image(s)")
        else:
            logger.info("No reference images available — relying on seed + text Verbatim Rule only")

        # Step 4a: Build per-clip reference lists and emit clip_started events
        clip_refs_data = []
        for i in range(n_clips):
            act = window_acts[i]
            start_frame, last_frame, character_refs, ref_seg_nums = _pick_clip_references(
                act,
                segments,
                storyboard_by_seg,
                character_collage_b64,
                character_reference_images,
                key_figures=key_figures,
                visual_style=visual_style,
            )
            clip_refs_data.append({
                "start_frame": start_frame,
                "last_frame": last_frame,
                "character_refs": character_refs,
            })

            act_number = act.get("segment_number", act.get("act_number", i + 1))
            act_title = act.get("segment_title", act.get("act_title", f"Segment {act_number}"))
            narration_text = act.get("narration_chunk", act.get("narration", ""))
            has_collage = bool(character_collage_b64)

            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=json.dumps({
                        "sse_type": "clip_started",
                        "window_index": i,
                        "segment_number": act_number,
                        "segment_title": act_title,
                        "narration_text": narration_text,
                        "reference_segment_numbers": ref_seg_nums,
                        "has_character_collage": has_collage,
                        "clips_total": n_clips,
                    }))],
                ),
            )

        # Step 4b: Generate all clips in parallel
        results = await asyncio.gather(
            *[
                _generate_clip_with_retry(
                    i, window_acts[i], session_id, style_bible, lut_path, tmp_dir,
                    session_seed=session_seed,
                    start_frame_b64=clip_refs_data[i]["start_frame"],
                    last_frame_b64=clip_refs_data[i]["last_frame"],
                    reference_images_b64=clip_refs_data[i]["character_refs"],
                    visual_style=visual_style,
                )
                for i in range(n_clips)
            ],
            return_exceptions=True,
        )

        # Step 5: Collect results, emit clip_done
        video_clips = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Window {i} clip failed after {VEO_RETRY_ATTEMPTS} retries: {result}")
                yield Event(
                    author=self.name,
                    content=types.Content(
                        role="model",
                        parts=[types.Part(text=json.dumps({
                            "sse_type": "error",
                            "agent": self.name,
                            "message": f"Clip {i+1}/{n_clips} failed after {VEO_RETRY_ATTEMPTS} retries: {str(result)}",
                            "recoverable": True,
                        }))],
                    ),
                )
                continue

            video_clips.append(result)

            # Find narration text for this clip
            clip_narration = ""
            for na in narration_acts_audio:
                if na["act_number"] == result["act_number"]:
                    clip_narration = na.get("narration_text", "")
                    break

            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=json.dumps({
                        "sse_type": "clip_done",
                        "segment_number": result["act_number"],
                        "segment_title": result["act_title"],
                        "narration_text": clip_narration,
                        "visual_purpose": result.get("visual_purpose", ""),
                        "clip_signed_url": result["signed_url"],
                        "duration_seconds": CLIP_DURATION,
                        "window_index": result["window_index"],
                        "clips_done": len(video_clips),
                        "clips_total": n_clips,
                    }))],
                ),
            )

        # Store in session state for AssemblyAgent
        ctx.session.state["video_clips"] = video_clips
        ctx.session.state["narration_acts_audio"] = narration_acts_audio
        ctx.session.state["total_narration_duration"] = total_narration_duration
