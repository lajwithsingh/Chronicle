import json
import logging
import os
import tempfile
from typing import AsyncGenerator
from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types
from backend.config.settings import settings
from backend.tools import gcs_tool, assembly_tool

logger = logging.getLogger("chronicle.assembly_agent")


class AssemblyAgent(BaseAgent):
    """
    Assembles the final documentary:
    1. Sort video clips by window_index
    2. Sort narration WAV files by act_number
    3. Concatenate clips, overlay TTS narration (100%) over Veo ambient audio (20% — soft background)
    4. Upload to GCS, emit documentary_complete
    """
    model_config = {"arbitrary_types_allowed": True}

    async def _run_async_impl(self, ctx) -> AsyncGenerator[Event, None]:
        session_id = ctx.session.id
        video_clips: list[dict] = ctx.session.state.get("video_clips", [])
        narration_acts_audio: list[dict] = ctx.session.state.get("narration_acts_audio", [])
        total_narration_duration: float = ctx.session.state.get("total_narration_duration", 0.0)
        topic: str = ctx.session.state.get("topic", "")
        era_style: str = ctx.session.state.get("era_style", "")

        if not video_clips:
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=json.dumps({
                        "sse_type": "error",
                        "agent": self.name,
                        "message": "No video clips to assemble",
                        "recoverable": False,
                    }))],
                ),
            )
            return

        tmp_dir = tempfile.mkdtemp(prefix=f"chronicle_assembly_{session_id}_")

        async def _progress(percent: int, stage: str):
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=json.dumps({
                        "sse_type": "assembly_progress",
                        "percent": percent,
                        "stage": stage,
                    }))],
                ),
            )

        # Step 1: Sort clips by window_index, resolve local paths
        async for event in _progress(10, "collecting clips"):
            yield event

        sorted_clips = sorted(video_clips, key=lambda c: c.get("window_index", c.get("act_number", 0)))

        # Build act_number → local_path lookup for resolved clip paths
        clip_by_act: dict[int, str] = {}
        for clip in sorted_clips:
            act_num = clip.get("act_number", clip.get("window_index", 0))
            local_path = clip.get("local_path", "")
            if local_path and os.path.exists(local_path):
                clip_by_act[act_num] = local_path
            else:
                gcs_uri = clip.get("gcs_uri", "")
                if gcs_uri:
                    local_path = os.path.join(tmp_dir, f"clip_{act_num}.mp4")
                    gcs_tool.download_file(gcs_uri, local_path)
                    clip_by_act[act_num] = local_path

        # Step 2: Sort narration WAVs by act_number, pair with clips
        sorted_narration = sorted(narration_acts_audio, key=lambda a: a.get("act_number", 0))
        transcript = " ".join(a.get("narration_text", "") for a in sorted_narration)

        # Build per-segment act_data list — each entry = one clip paired with its narration.
        # This ensures the video clip for segment N is synced only with narration for segment N.
        act_data = []
        for narr in sorted_narration:
            act_num = narr.get("act_number", 0)
            narration_path = narr.get("narration_path", "")
            clip_path = clip_by_act.get(act_num)
            if clip_path and os.path.exists(narration_path):
                act_data.append({
                    "clip_path": clip_path,
                    "narration_path": narration_path,
                })
            else:
                logger.warning(f"Segment {act_num}: missing clip or narration — skipping from assembly")

        segments_count = len(act_data)
        logger.info(f"[{session_id}] Assembling {segments_count} synced segment(s)")

        async for event in _progress(40, "assembling synced documentary"):
            yield event

        # Step 3: Per-segment sync assembly
        # assemble_synced_documentary zips each clip with its own narration:
        #   - If clip (8s) < narration → loops the clip to fill narration duration
        #   - If clip (8s) > narration → trims clip to narration duration
        # This guarantees perfect audio/video alignment per segment.
        output_path = os.path.join(tmp_dir, f"{session_id}_final.mp4")

        try:
            assembly_tool.assemble_synced_documentary(
                act_data=act_data,
                output_path=output_path,
                crossfade_duration=0.5,
                veo_audio_volume=0.20,
            )
        except Exception as e:
            logger.exception(f"[{session_id}] Assembly pipeline failed: {e}")
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=json.dumps({
                        "sse_type": "error",
                        "agent": self.name,
                        "message": f"Final assembly failed: {e}",
                        "recoverable": False,
                    }))],
                ),
            )
            return

        async for event in _progress(90, "uploading to GCS"):
            yield event

        # Step 4: Upload to GCS
        final_blob = f"finals/{session_id}/chronicle.mp4"
        try:
            final_gcs_uri = gcs_tool.upload_file(output_path, final_blob)
            # Use backend proxy path — avoids CORS and signed URL expiration issues.
            signed_url = f"/chronicle/clip/{final_blob}"
        except Exception as e:
            logger.exception(f"[{session_id}] GCS upload failed: {e}")
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=json.dumps({
                        "sse_type": "error",
                        "agent": self.name,
                        "message": f"Upload failed: {e}",
                        "recoverable": False,
                    }))],
                ),
            )
            return

        async for event in _progress(100, "complete"):
            yield event

        duration_seconds = round(total_narration_duration, 1)

        final_video = {
            "gcs_uri": final_gcs_uri,
            "signed_url": signed_url,
            "duration_seconds": duration_seconds,
            "transcript": transcript,
            "topic": topic,
            "segments_count": segments_count,
            "era_style": era_style,
        }
        ctx.session.state["final_video"] = final_video

        yield Event(
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=json.dumps({
                    "sse_type": "documentary_complete",
                    "final_video_url": signed_url,
                    "duration_seconds": duration_seconds,
                    "transcript": transcript,
                    "topic": topic,
                    "segments_count": segments_count,
                    "era_style": era_style,
                }))],
            ),
        )
