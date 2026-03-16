import datetime
import os
from pathlib import Path
from google.cloud import storage
from backend.config.settings import settings

_bucket_verified = False


def get_gcs_client() -> storage.Client:
    return storage.Client(project=settings.GOOGLE_CLOUD_PROJECT)


def upload_file(local_path: str, gcs_blob_name: str) -> str:
    """Upload a local file to GCS. Returns gs:// URI."""
    ensure_bucket_exists()
    client = get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET)
    blob = bucket.blob(gcs_blob_name)
    blob.upload_from_filename(local_path)
    return f"gs://{settings.GCS_BUCKET}/{gcs_blob_name}"


def upload_bytes(data: bytes, gcs_blob_name: str, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to GCS. Returns gs:// URI."""
    ensure_bucket_exists()
    client = get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET)
    blob = bucket.blob(gcs_blob_name)
    blob.upload_from_string(data, content_type=content_type)
    return f"gs://{settings.GCS_BUCKET}/{gcs_blob_name}"


def download_file(gcs_uri: str, local_path: str) -> str:
    """Download from gs:// URI to local path. Returns local path."""
    client = get_gcs_client()
    # Parse gs://bucket/blob
    path = gcs_uri.replace("gs://", "")
    bucket_name, blob_name = path.split("/", 1)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    os.makedirs(Path(local_path).parent, exist_ok=True)
    blob.download_to_filename(local_path)
    return local_path


def get_signed_url(gcs_uri: str, expiration_minutes: int = 60) -> str:
    """
    Generate a signed URL for a GCS object.
    Falls back to a local proxy URL when running with ADC user credentials
    (which cannot sign URLs — that requires a service account key).
    """
    client = get_gcs_client()
    path = gcs_uri.replace("gs://", "")
    bucket_name, blob_name = path.split("/", 1)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    try:
        return blob.generate_signed_url(
            expiration=datetime.timedelta(minutes=expiration_minutes),
            method="GET",
            version="v4",
        )
    except Exception:
        # ADC user credentials can't sign URLs — return a proxy path instead.
        # The FastAPI /chronicle/clip/{blob_path} endpoint will serve the file.
        return f"/chronicle/clip/{blob_name}"


def get_media_proxy_url(blob_name: str) -> str:
    return f"/chronicle/media/{blob_name}"


def get_bucket_status() -> dict:
    details = {
        "bucket": settings.GCS_BUCKET,
        "project": settings.GOOGLE_CLOUD_PROJECT,
    }
    try:
        client = get_gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET)
        details["exists"] = bucket.exists()
        details["status"] = "ok" if details["exists"] else "missing"
    except Exception as exc:
        details["status"] = "error"
        details["error"] = str(exc)
    return details


def ensure_bucket_exists():
    """Create the GCS bucket if it doesn't exist."""
    global _bucket_verified
    if _bucket_verified:
        return

    client = get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET)
    if not bucket.exists():
        client.create_bucket(
            settings.GCS_BUCKET,
            location=settings.GOOGLE_CLOUD_LOCATION,
        )
    _bucket_verified = True
