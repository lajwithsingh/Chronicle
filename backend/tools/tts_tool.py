"""
TTS narration using Gemini TTS (primary) with Google Cloud TTS as fallback.

Primary: Gemini 2.5 Flash TTS — uses same credentials as the rest of the app.
Fallback: Google Cloud TTS Studio voices (requires Studio voices enabled in GCP).
"""
import logging
import os
import wave
import asyncio
import random
import httpx
from httpx import RequestError
from pathlib import Path

from google.genai import types
from google.genai.errors import ClientError
from backend.config.genai_client import get_client

logger = logging.getLogger("chronicle.tts")


async def generate_narration_audio(narration_text: str, output_path: str, voice_preference: str = "male") -> str:
    """
    Generate TTS audio for documentary narration.
    Primary: Gemini TTS (Charon voice — deep, informative male).
    Fallback: Google Cloud TTS Studio voices.
    Returns path to the saved WAV file.
    """
    os.makedirs(Path(output_path).parent, exist_ok=True)

    # Primary: Google Cloud TTS
    try:
        return _gcloud_tts(narration_text, output_path, voice_preference)
    except Exception as e:
        logger.warning(f"Cloud TTS failed ({e}), falling back to Gemini TTS")

    # Fallback: Gemini TTS
    return await _gemini_tts(narration_text, output_path, voice_preference)

async def _gemini_tts(text: str, output_path: str, voice_preference: str = "male") -> str:
    """
    Gemini 2.5 Flash TTS.
    Voice: Charon — deep, informative male. Best available for documentary narration.
    """
    client = get_client()

    # SSML-style instruction prefix — guides delivery without SSML tags
    styled_text = (
        "You are a National Geographic documentary narrator. "
        "Read the following narration with a deep, authoritative, measured voice. "
        "Slow, deliberate pacing with natural pauses between sentences. "
        "Gravitas and weight on key historical facts. "
        "Calm authority — never theatrical or dramatic. "
        "The tone of David Attenborough narrating history:\n\n"
        + text
    )

    last_exc = None
    max_retries = 5
    for attempt in range(max_retries):
        try:
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=[
                    types.Content(
                        role="user",
                        parts=[types.Part(text=styled_text)],
                    )
                ],
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name="Aoede" if voice_preference.lower() == "female" else "Charon"
                            )
                        )
                    ),
                ),
            )

            audio_data = response.candidates[0].content.parts[0].inline_data.data
            _save_pcm_as_wav(audio_data, output_path)
            logger.info(f"Gemini TTS [Charon]: {output_path} ({len(audio_data)} bytes)")
            return output_path

        except (ClientError, RequestError) as e:
            is_rate_limit = isinstance(e, ClientError) and e.code == 429
            is_request_error = isinstance(e, RequestError)

            if (is_rate_limit or is_request_error) and attempt < max_retries - 1:
                delay = min(3 * (2 ** attempt) + random.uniform(0, 2), 30)
                reason = "rate limited" if is_rate_limit else "connectivity issue"
                logger.warning(f"Gemini TTS {reason} ({type(e).__name__}), retrying in {delay:.1f}s (attempt {attempt+1})")
                await asyncio.sleep(delay)
                last_exc = e
            else:
                logger.error(f"Gemini TTS {type(e).__name__}: {e}")
                raise
        except Exception as e:
            logger.error(f"Gemini TTS unexpected error: {e}", exc_info=True)
            last_exc = e
            if attempt < max_retries - 1:
                await asyncio.sleep(2 + random.uniform(0, 1))
                continue
            raise

    raise last_exc


def _gcloud_tts(text: str, output_path: str, voice_preference: str = "male") -> str:
    """
    Google Cloud TTS fallback.
    Voice priority for male: Studio-Q -> Wavenet-D
    Voice priority for female: Studio-O -> Wavenet-F
    """
    from google.cloud import texttospeech

    client = texttospeech.TextToSpeechClient()

    text = text[:4800] if len(text.encode()) > 4800 else text
    synthesis_input = texttospeech.SynthesisInput(text=text)

    pitch = 0.0 if voice_preference.lower() == "female" else -3.0

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.LINEAR16,
        sample_rate_hertz=24000,
        speaking_rate=0.85,
        pitch=pitch,
        effects_profile_id=["large-home-entertainment-class-device"],
    )

    if voice_preference.lower() == "female":
        voice_names = ["en-US-Studio-O", "en-US-Wavenet-F"]
    else:
        voice_names = ["en-US-Studio-Q", "en-US-Wavenet-D"]
    last_exc: Exception | None = None
    for voice_name in voice_names:
        try:
            voice = texttospeech.VoiceSelectionParams(
                language_code="en-US",
                name=voice_name,
            )
            response = client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            )
            with open(output_path, "wb") as f:
                f.write(response.audio_content)
            logger.info(f"Cloud TTS [{voice_name}]: {output_path} ({len(response.audio_content)} bytes)")
            return output_path
        except Exception as e:
            logger.warning(f"Cloud TTS voice {voice_name!r} unavailable: {e}")
            last_exc = e

    raise last_exc  # type: ignore[misc]


def _save_pcm_as_wav(pcm_data: bytes, output_path: str, sample_rate: int = 24000, channels: int = 1):
    """Save raw PCM audio data as a WAV file."""
    with wave.open(output_path, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(2)  # 16-bit PCM
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_data)


async def generate_full_narration(acts: list[dict], session_id: str, output_dir: str) -> str:
    """Generate a single concatenated narration audio file for all acts."""
    os.makedirs(output_dir, exist_ok=True)

    full_text = ""
    for act in acts:
        narration = act.get("narration", "")
        full_text += narration + "  "

    output_path = os.path.join(output_dir, f"{session_id}_narration.wav")
    return await generate_narration_audio(full_text, output_path, "male")
