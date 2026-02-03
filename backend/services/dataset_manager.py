from __future__ import annotations

from pathlib import Path

from models import DatasetStatus
from config import settings


def get_data_dir() -> Path:
    return Path(settings.data_dir)


def get_dataset_status() -> DatasetStatus:
    data_dir = get_data_dir()
    if not data_dir.exists():
        return DatasetStatus(downloaded=False)

    hot_dog_count = 0
    not_hot_dog_count = 0
    splits: list[str] = []

    for split in ["train", "test"]:
        split_dir = data_dir / split
        if not split_dir.exists():
            continue
        splits.append(split)
        for category in ["hot_dog", "not_hot_dog"]:
            cat_dir = split_dir / category
            if not cat_dir.exists():
                continue
            count = len(_list_images(cat_dir))
            if category == "hot_dog":
                hot_dog_count += count
            else:
                not_hot_dog_count += count

    total = hot_dog_count + not_hot_dog_count
    return DatasetStatus(
        downloaded=total > 0,
        hot_dog_count=hot_dog_count,
        not_hot_dog_count=not_hot_dog_count,
        total=total,
        splits=splits,
    )


def list_all_images(sample_size: int | None = None) -> list[dict]:
    """Return list of {split, category, filename, path} for all images."""
    data_dir = get_data_dir()
    images: list[dict] = []

    split = "test"
    split_dir = data_dir / split
    if split_dir.exists():
        for category in ["hot_dog", "not_hot_dog"]:
            cat_dir = split_dir / category
            if not cat_dir.exists():
                continue
            for f in sorted(_list_images(cat_dir)):
                images.append(
                    {
                        "split": split,
                        "category": category,
                        "filename": f,
                        "path": str(cat_dir / f),
                    }
                )

    # Split by category and interleave: hot, not, hot, not, ...
    hot = [img for img in images if img["category"] == "hot_dog"]
    not_hot = [img for img in images if img["category"] == "not_hot_dog"]
    if sample_size is not None:
        hot = hot[:sample_size]
        not_hot = not_hot[:sample_size]
    interleaved = []
    for h, n in zip(hot, not_hot):
        interleaved.append(h)
        interleaved.append(n)
    # Append any remaining if one category is longer
    longer = hot[len(not_hot):] or not_hot[len(hot):]
    interleaved.extend(longer)
    images = interleaved

    return images


def get_image_path(split: str, category: str, filename: str) -> Path | None:
    path = get_data_dir() / split / category / filename
    if path.exists() and path.is_file():
        return path
    return None


def _list_images(directory: Path) -> list[str]:
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    return [f.name for f in directory.iterdir() if f.suffix.lower() in exts]
