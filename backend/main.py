
import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env before anything else so all os.environ reads pick up the values
load_dotenv(Path(__file__).parent / ".env", override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.config.settings import settings

# Propagate key settings into os.environ
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = settings.GOOGLE_GENAI_USE_VERTEXAI
if settings.GOOGLE_API_KEY:
    os.environ["GOOGLE_API_KEY"] = settings.GOOGLE_API_KEY
if settings.GOOGLE_APPLICATION_CREDENTIALS:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
if settings.GOOGLE_CLOUD_PROJECT:
    os.environ["GOOGLE_CLOUD_PROJECT"] = settings.GOOGLE_CLOUD_PROJECT
if settings.GOOGLE_CLOUD_LOCATION:
    os.environ["GOOGLE_CLOUD_LOCATION"] = settings.GOOGLE_CLOUD_LOCATION

from backend.api.routes import router
from backend.services.persistence import get_persistence_service
from backend.tools.gcs_tool import get_bucket_status

# Patch google-genai library bug: BaseApiClient.aclose() attribute guard
try:
    from google.genai._api_client import BaseApiClient as _BaseApiClient
    _original_aclose = _BaseApiClient.aclose
    async def _safe_aclose(self):
        try:
            await _original_aclose(self)
        except AttributeError:
            pass
    _BaseApiClient.aclose = _safe_aclose
except Exception:
    pass

app = FastAPI(
    title="Chronicle API",
    description="Cinematic factual storytelling engine powered by Google ADK, Gemini, and Veo 3.1",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production via env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    firestore_status = get_persistence_service().health_status()
    gcs_status = get_bucket_status()
    app_status = "ok"
    status_code = 200

    if settings.FIRESTORE_REQUIRED and firestore_status["status"] != "ok":
        app_status = "degraded"
        status_code = 503

    if gcs_status["status"] != "ok":
        app_status = "degraded"
        status_code = 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": app_status,
            "version": "2.0.0",
            "services": {
                "firestore": firestore_status,
                "gcs": gcs_status,
            },
        },
    )
