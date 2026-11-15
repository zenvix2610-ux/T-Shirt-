import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, UploadFile

from ..config import UPLOAD_DIR, get_settings
from ..models import new_id

ALLOWED = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_BYTES = 8 * 1024 * 1024


def save_image(upload: UploadFile, folder: str) -> str:
    content_type = (upload.content_type or "").lower()
    if content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, or WEBP image")
    data = upload.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 8 MB")
    if not data:
        raise HTTPException(status_code=400, detail="The image file is empty")
    name = new_id() + ALLOWED[content_type]
    settings = get_settings()
    if settings.cloudinary_url:
        url = upload_cloudinary(data, name, folder, content_type, settings.cloudinary_url)
        if url:
            return url
    target_dir = UPLOAD_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / name).write_bytes(data)
    return f"/uploads/{folder}/{name}"


def upload_cloudinary(data: bytes, filename: str, folder: str, content_type: str, cloudinary_url: str) -> str | None:
    parsed = urlparse(cloudinary_url)
    if parsed.scheme != "cloudinary" or not parsed.hostname or not parsed.username:
        return None
    cloud = parsed.hostname
    endpoint = f"https://api.cloudinary.com/v1_1/{cloud}/image/upload"
    try:
        response = httpx.post(
            endpoint,
            data={"folder": f"thigazh-drifts/{folder}"},
            files={"file": (filename, data, content_type)},
            auth=(parsed.username, parsed.password or ""),
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("secure_url")
    except httpx.HTTPError:
        return None


def safe_folder(folder: str) -> Path:
    if not re.fullmatch(r"[a-z]+", folder):
        raise HTTPException(status_code=404, detail="Not found")
    return UPLOAD_DIR / folder
