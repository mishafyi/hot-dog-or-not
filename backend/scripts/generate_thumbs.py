"""One-off script to generate missing 300px thumbnails for battle images.

Mirrors the logic in routers/battle.py::_generate_optimized_images.
Run inside the backend Docker container or directly on the VPS host.

Usage (container):
    python3 /app/scripts/generate_thumbs.py

Usage (host):
    python3 /path/to/generate_thumbs.py --images-dir /data/coolify/hotdog-results/battle_images
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image


THUMB_WIDTH = 300
JPEG_QUALITY = 80
THUMB_SUBDIR = "thumbs"


def generate_thumbnails(images_dir: Path) -> int:
    """Generate missing thumbnails and return count of newly created ones."""
    if not images_dir.is_dir():
        print(f"ERROR: images directory does not exist: {images_dir}", file=sys.stderr)
        sys.exit(1)

    thumb_dir = images_dir / THUMB_SUBDIR
    thumb_dir.mkdir(parents=True, exist_ok=True)

    jpg_files = sorted(f for f in os.listdir(images_dir) if f.lower().endswith(".jpg"))
    print(f"Found {len(jpg_files)} .jpg files in {images_dir}")

    created = 0
    skipped = 0
    errors = 0

    for filename in jpg_files:
        thumb_path = thumb_dir / filename
        if thumb_path.exists():
            skipped += 1
            continue

        src_path = images_dir / filename
        try:
            with Image.open(src_path) as img:
                # Strip EXIF by discarding info dict
                if hasattr(img, "info"):
                    img.info.pop("exif", None)
                img = img.convert("RGB")

                ratio = THUMB_WIDTH / img.width
                thumb_size = (THUMB_WIDTH, int(img.height * ratio))
                thumb = img.resize(thumb_size, Image.LANCZOS)
                thumb.save(thumb_path, "JPEG", quality=JPEG_QUALITY, optimize=True)

            created += 1
        except Exception as exc:
            print(f"  ERROR processing {filename}: {exc}", file=sys.stderr)
            errors += 1

    print(f"Generated {created} thumbnails, skipped {skipped} existing, {errors} errors")
    return created


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate missing battle image thumbnails")
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=Path("/results/battle_images"),
        help="Path to the battle_images directory (default: /results/battle_images)",
    )
    args = parser.parse_args()
    generate_thumbnails(args.images_dir)


if __name__ == "__main__":
    main()
