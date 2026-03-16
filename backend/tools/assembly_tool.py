import logging
import math
import subprocess
import json
import re
import os
from pathlib import Path

logger = logging.getLogger("chronicle.assembly_tool")

try:
    import imageio_ffmpeg
    _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    _FFMPEG = "ffmpeg"


def process_clip(input_path: str, output_path: str, lut_path: str) -> str:
    """
    Run steps 1-3 of the pipeline on a single clip.
    1. Resolution normalize → 1920×1080 @ 24fps
    2. Two-pass loudnorm → -16 LUFS (ITU-R BS.1770)
    3. Apply LUT color grade
    Returns processed output path.
    """
    os.makedirs(Path(output_path).parent, exist_ok=True)

    # Pass 1: Measure loudness
    cmd1 = [
        _FFMPEG, "-i", input_path,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-", "-v", "quiet",
    ]
    result = subprocess.run(cmd1, capture_output=True, text=True)

    # Extract JSON loudness stats from stderr
    json_match = re.search(r"\{[^{}]+\}", result.stderr, re.DOTALL)
    stats = json.loads(json_match.group()) if json_match else {}

    # Build measured loudnorm filter for pass 2
    if stats:
        af = (
            f"loudnorm=I=-16:TP=-1.5:LRA=11"
            f":measured_I={stats.get('input_i', -24)}"
            f":measured_LRA={stats.get('input_lra', 7)}"
            f":measured_TP={stats.get('input_tp', -2)}"
            f":measured_thresh={stats.get('input_thresh', -34)}"
            f":offset={stats.get('target_offset', 0)}:linear=true"
        )
    else:
        af = "loudnorm=I=-16:TP=-1.5:LRA=11"

    # Pass 2: Apply normalization + LUT + resolution normalize
    vf_parts = [
        # Step 1: Resolution normalize to 1080p
        "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos",
        "pad=1920:1080:-1:-1:color=black",
        "setsar=1:1",
    ]
    # Step 3: Apply LUT if file exists
    if lut_path and os.path.exists(lut_path):
        # Escape path for ffmpeg filtergraph: forward slashes + escape drive colon + single-quote wrap
        lut_safe = str(Path(lut_path).resolve()).replace("\\", "/").replace(":", "\\:")
        vf_parts.append(f"lut3d=file='{lut_safe}'")

    cmd2 = [
        _FFMPEG, "-i", input_path,
        "-vf", ",".join(vf_parts),
        "-af", af,
        "-r", "24",
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "slow",
        "-tune", "film",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-y", output_path,
    ]
    subprocess.run(cmd2, check=True, capture_output=True)
    return output_path


def assemble_clips_only(clip_paths: list[str], output_path: str) -> str:
    """
    Concatenate video clips using ffmpeg concat demuxer.
    Preserves native Veo audio (narrator voice + ambient + music baked in by Veo).
    No external narration overlay — each clip is self-contained.
    Returns path to the final MP4.
    """
    import tempfile as _tempfile

    os.makedirs(Path(output_path).parent, exist_ok=True)

    # Write ffmpeg concat list
    with _tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        for p in clip_paths:
            # ffmpeg requires forward slashes; escape single quotes in path
            safe_path = str(Path(p).resolve()).replace("\\", "/")
            f.write(f"file '{safe_path}'\n")
        list_file = f.name

    try:
        cmd = [
            _FFMPEG, "-f", "concat", "-safe", "0", "-i", list_file,
            "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-tune", "film",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-y", output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        try:
            os.unlink(list_file)
        except OSError:
            pass

    return output_path


def assemble_documentary(
    clip_paths: list[str],
    narration_path: str,
    output_path: str,
    crossfade_duration: float = 1.0,
    veo_audio_volume: float = 0.35,
) -> str:
    """
    Steps 5-7: cross-dissolve assembly + audio ducking + export.
    Returns path to the final exported MP4.
    """
    from moviepy.editor import (
        VideoFileClip,
        CompositeVideoClip,
        AudioFileClip,
        CompositeAudioClip,
    )

    os.makedirs(Path(output_path).parent, exist_ok=True)
    clips = [VideoFileClip(p) for p in clip_paths]
    composite_clips = []
    current_start = 0.0

    for i, clip in enumerate(clips):
        if i == 0:
            processed = clip.crossfadeout(crossfade_duration).set_start(0)
        elif i == len(clips) - 1:
            processed = clip.crossfadein(crossfade_duration).set_start(current_start)
        else:
            processed = (
                clip.crossfadein(crossfade_duration)
                .crossfadeout(crossfade_duration)
                .set_start(current_start)
            )
        composite_clips.append(processed)
        current_start += clip.duration - crossfade_duration

    final_video = CompositeVideoClip(composite_clips)

    # Duck Veo native audio to 35%, layer narration at 100%
    narration_audio = AudioFileClip(narration_path)
    if narration_audio.duration > final_video.duration:
        narration_audio = narration_audio.subclip(0, final_video.duration)
    if final_video.audio is not None:
        veo_audio = final_video.audio.volumex(veo_audio_volume)
        mixed_audio = CompositeAudioClip([veo_audio, narration_audio])
    else:
        mixed_audio = narration_audio

    final_video = final_video.set_audio(mixed_audio)

    final_video.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        audio_bitrate="192k",
        fps=24,
        preset="slow",
        ffmpeg_params=["-crf", "18", "-tune", "film", "-pix_fmt", "yuv420p"],
    )

    for c in clips:
        c.close()

    return output_path


def assemble_narration_first(
    clip_paths: list[str],
    narration_paths: list[str],
    output_path: str,
    veo_audio_volume: float = 0.35,
) -> str:
    """
    Concatenate video clips and overlay narration audio tracks sequentially.
    Clips are fixed-duration Veo clips. Narration plays from the start over all clips.
    Returns path to the final MP4.
    """
    from moviepy.editor import (
        VideoFileClip,
        AudioFileClip,
        CompositeAudioClip,
        concatenate_videoclips,
        concatenate_audioclips,
    )

    os.makedirs(Path(output_path).parent, exist_ok=True)

    clips = [VideoFileClip(p) for p in clip_paths]
    final_video = concatenate_videoclips(clips, method="compose")

    # Concatenate narration tracks in act order
    narration_clips = [AudioFileClip(p) for p in narration_paths]
    full_narration = concatenate_audioclips(narration_clips)

    # Trim narration to video length if it somehow exceeds video
    if full_narration.duration > final_video.duration:
        full_narration = full_narration.subclip(0, final_video.duration)

    # Mix Veo ambient audio (35%) + narration (100%)
    if final_video.audio is not None:
        veo_audio = final_video.audio.volumex(veo_audio_volume)
        mixed = CompositeAudioClip([veo_audio, full_narration])
    else:
        mixed = full_narration

    final_video = final_video.set_audio(mixed)

    final_video.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        audio_bitrate="192k",
        fps=24,
        preset="slow",
        ffmpeg_params=["-crf", "18", "-tune", "film", "-pix_fmt", "yuv420p"],
    )

    for c in clips:
        c.close()
    for n in narration_clips:
        n.close()

    return output_path


def assemble_synced_documentary(
    act_data: list[dict],
    output_path: str,
    crossfade_duration: float = 0.5,
    veo_audio_volume: float = 0.35,
) -> str:
    """
    Assemble documentary with narration perfectly synced per act.
    Each video clip is looped/extended to exactly match its act's narration duration.
    Veo ambient audio (35%) + narration (100%) are mixed per clip, then acts are concatenated.

    act_data: list of {"clip_path": str, "narration_path": str}
    """
    from moviepy.editor import (
        VideoFileClip,
        AudioFileClip,
        CompositeAudioClip,
        concatenate_videoclips,
    )
    from moviepy.video.fx.all import loop as vfx_loop

    os.makedirs(Path(output_path).parent, exist_ok=True)
    synced_clips = []

    for i, act in enumerate(act_data):
        clip_path = act["clip_path"]
        narration_path = act["narration_path"]

        clip = VideoFileClip(clip_path)
        narration = AudioFileClip(narration_path)
        narration_dur = narration.duration

        logger.info(f"Act {i+1}: clip={clip.duration:.1f}s narration={narration_dur:.1f}s")
        
        # Detach original audio before any video clipping to avoid out-of-bounds readers
        orig_audio = clip.audio

        # Extend clip to match narration duration (loop if clip is shorter)
        if clip.duration < narration_dur:
            n_loops = math.ceil(narration_dur / clip.duration)
            clip = clip.fx(vfx_loop, n=n_loops).subclip(0, narration_dur)
        else:
            clip = clip.subclip(0, narration_dur)

        # Mix Veo ambient audio (35%) + narration (100%)
        if orig_audio is not None:
            from moviepy.audio.fx.all import audio_loop
            # Safely bound audio to exact narration length (loops if too short, trims if too long)
            safe_audio = audio_loop(orig_audio, duration=narration_dur)
            veo_audio = safe_audio.volumex(veo_audio_volume)
            mixed = CompositeAudioClip([veo_audio, narration])
        else:
            mixed = narration

        synced_clips.append(clip.set_audio(mixed))

    # Concatenate all synced act clips
    final = concatenate_videoclips(synced_clips, method="compose")

    final.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        audio_bitrate="192k",
        fps=24,
        preset="slow",
        ffmpeg_params=["-crf", "18", "-tune", "film", "-pix_fmt", "yuv420p"],
    )

    for c in synced_clips:
        c.close()

    return output_path
