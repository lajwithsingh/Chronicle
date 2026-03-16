from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings

# Resolve .env relative to this file: backend/config/settings.py → backend/.env
_ENV_FILE = Path(__file__).parent.parent / ".env"

class Settings(BaseSettings):
    APP_NAME: str = "Chronicle"
    GOOGLE_CLOUD_PROJECT: str = "your-project-id"
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None
    GOOGLE_CLOUD_LOCATION: str = "us-central1"
    GEMINI_TEXT_MODEL: str = "gemini-2.5-flash"
    GEMINI_IMAGE_MODEL: str = "gemini-2.5-flash-image"
    GEMINI_IMAGE_LOCATION: str = "global"
    VEO_MODEL: str = "veo-3.1-fast-generate-001"
    GCS_BUCKET: str = ""
    FIRESTORE_COLLECTION: str = "chronicle_sessions"
    FIRESTORE_REQUIRED: bool = True
    ADK_SESSION_SERVICE: str = "memory"
    PORT: int = 8080
    GOOGLE_API_KEY: Optional[str] = None
    KNOWLEDGE_GRAPH_API_KEY: Optional[str] = None
    GOOGLE_GENAI_USE_VERTEXAI: str = "1"
    IMAGE_GENERATION_CONCURRENCY: int = 2
    IMAGE_REQUEST_SPACING_SECONDS: float = 1.5

    class Config:
        extra = "allow"
        env_file = str(_ENV_FILE)

settings = Settings()
