import asyncio
import base64
from google.genai import types
from backend.config.genai_client import get_vertex_client
from backend.config.settings import settings


import logging as _logging
_veo_logger = _logging.getLogger("chronicle.veo_tool")


async def generate_video_clip(
    prompt: str,
    output_gcs_prefix: str,
    start_frame_b64: str | None = None,
    last_frame_b64: str | None = None,
    reference_images_b64: list[str] | None = None,
    duration_seconds: int = 8,
    aspect_ratio: str = "16:9",
    poll_interval: int = 15,
    max_wait_seconds: int = 600,
    seed: int | None = None,
) -> str:
    """
    Generate a video clip using Veo 3.1.

    reference_images_b64: up to 3 base64 PNG strings (front, ¾, full body) of the
        primary character. Passed as referenceType="ASSET" per guide Section 9 for
        cross-clip character consistency. Gracefully ignored if the SDK doesn't support it.
    seed: fixed integer for visual consistency (Verbatim Rule companion, guide Section 2).
    Returns the GCS URI of the generated video.
    """
    client = get_vertex_client()

    config_kwargs: dict = dict(
        aspect_ratio=aspect_ratio,
        output_gcs_uri=output_gcs_prefix,
        generate_audio=True,
        # Guide §8: "allow_adult" avoids child-safety false positives on
        # historical figures; "allow_all" is overly broad.
        person_generation="allow_adult",
    )
    if 5 <= duration_seconds <= 8:
        config_kwargs["duration_seconds"] = duration_seconds
    # Seed locks visual style/character appearance across clips (guide §2 Verbatim Rule)
    if seed is not None:
        try:
            config_kwargs["seed"] = seed
        except Exception:
            pass  # SDK version may not support seed yet — fail silently

    # Guide §9: pass up to 3 reference images as ASSET type for character consistency.
    # Try/except so older SDK versions degrade gracefully to text-only prompting.
    if reference_images_b64:
        try:
            ref_imgs = [
                types.VideoGenerationReferenceImage(
                    image=types.Image(
                        image_bytes=base64.b64decode(b64),
                        mime_type="image/png",
                    ),
                    reference_type="ASSET",
                )
                for b64 in reference_images_b64[:3]  # guide: max 3
            ]
            config_kwargs["reference_images"] = ref_imgs
            _veo_logger.debug(f"Using {len(ref_imgs)} character reference image(s)")
        except (TypeError, AttributeError, Exception) as e:
            _veo_logger.warning(
                f"Reference images not supported by current SDK version ({e}), "
                "proceeding with text prompt only"
            )

    if last_frame_b64:
        # Veo image-to-video takes the start frame as a top-level `image` argument,
        # but the end frame is passed as `last_frame` in the config.
        config_kwargs["last_frame"] = types.Image(
            image_bytes=base64.b64decode(last_frame_b64),
            mime_type="image/png",
        )

    config = types.GenerateVideosConfig(**config_kwargs)

    top_level_kwargs = {
        "model": settings.VEO_MODEL,
        "prompt": prompt,
        "config": config,
    }

    if start_frame_b64:
        top_level_kwargs["image"] = types.Image(
            image_bytes=base64.b64decode(start_frame_b64),
            mime_type="image/png",
        )

    operation = await client.aio.models.generate_videos(**top_level_kwargs)

    # Poll until complete
    elapsed = 0
    while not operation.done:
        if elapsed >= max_wait_seconds:
            raise TimeoutError(f"Veo generation timed out after {max_wait_seconds}s")
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
        operation = await client.aio.operations.get(operation)

    # Check for API-level error first
    if hasattr(operation, "error") and operation.error:
        raise RuntimeError(f"Veo operation error: {operation.error}")

    # SDK uses operation.result (not operation.response)
    result = operation.result
    if not result or not result.generated_videos:
        import logging
        logging.getLogger("chronicle.veo_tool").error(
            f"Veo returned no videos. result={result!r}"
        )
        raise RuntimeError(
            "Veo generation completed but returned no videos "
            "(likely content filtered or invalid GCS URI)"
        )

    video = result.generated_videos[0]
    return video.video.uri


async def download_clip_from_gcs(gcs_uri: str, local_path: str) -> str:
    """Download a video clip from GCS to local filesystem."""
    from backend.tools.gcs_tool import download_file
    return download_file(gcs_uri, local_path)


def extract_last_frame(video_path: str) -> bytes:
    """Extract the last frame of a video clip as JPEG bytes for scene extension."""
    import io
    from PIL import Image
    from moviepy.editor import VideoFileClip

    clip = VideoFileClip(video_path)
    frame_time = clip.duration * 0.95
    frame = clip.get_frame(frame_time)
    clip.close()

    img = Image.fromarray(frame.astype("uint8"))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()
