from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from models import DatasetStatus
from services.dataset_manager import get_dataset_status, get_image_path, list_all_images

router = APIRouter(prefix="/api/dataset", tags=["dataset"])


@router.get("/status", response_model=DatasetStatus)
def dataset_status():
    return get_dataset_status()


@router.get("/images", response_model=list[dict])
def list_images(
    category: str | None = Query(None),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
):
    """List all images in the dataset with optional category filter."""
    images = list_all_images()
    if category:
        images = [img for img in images if img["category"] == category]
    return images[offset : offset + limit]


@router.get("/images/{split}/{category}/{filename}")
def serve_image(split: str, category: str, filename: str):
    path = get_image_path(split, category, filename)
    if path is None:
        raise HTTPException(404, "Image not found")
    return FileResponse(path)
