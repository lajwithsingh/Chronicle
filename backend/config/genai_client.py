"""
Two singleton google-genai clients:
- get_client()        → AI Studio (GOOGLE_API_KEY) for Gemini text + image
                        Falls back to Vertex AI if no API key is set.
- get_vertex_client() → Vertex AI always, used exclusively for Veo video generation.
"""
from google import genai
from backend.config.settings import settings

_client: genai.Client | None = None
_vertex_client: genai.Client | None = None
_image_client: genai.Client | None = None


def get_client() -> genai.Client:
    """Return the AI Studio client (or Vertex AI fallback) for Gemini text/image."""
    global _client
    if _client is None:
        if settings.GOOGLE_API_KEY:
            _client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        else:
            _client = genai.Client(
                vertexai=True,
                project=settings.GOOGLE_CLOUD_PROJECT,
                location=settings.GOOGLE_CLOUD_LOCATION,
            )
    return _client


def get_vertex_client() -> genai.Client:
    """Return the Vertex AI client — required for Veo video generation."""
    global _vertex_client
    if _vertex_client is None:
        _vertex_client = genai.Client(
            vertexai=True,
            project=settings.GOOGLE_CLOUD_PROJECT,
            location=settings.GOOGLE_CLOUD_LOCATION,
        )
    return _vertex_client


def get_image_client() -> genai.Client:
    """Return the Gemini image client, using a dedicated location when on Vertex AI."""
    global _image_client
    if _image_client is None:
        if settings.GOOGLE_API_KEY:
            _image_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        else:
            _image_client = genai.Client(
                vertexai=True,
                project=settings.GOOGLE_CLOUD_PROJECT,
                location=settings.GEMINI_IMAGE_LOCATION,
            )
    return _image_client
