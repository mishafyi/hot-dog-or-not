#!/usr/bin/env python3
"""
Download hot dog images from Pexels for the benchmark dataset.
Shuffles and numbers them 001-200.

Usage:
  PEXELS_API_KEY=your_key python scripts/download_hotdogs.py

Get a free API key at https://www.pexels.com/api/
"""

import urllib.request
import urllib.parse
import json
import os
import time
import random
from pathlib import Path

API_KEY = os.environ.get("PEXELS_API_KEY", "")
BASE_URL = "https://api.pexels.com/v1/search"

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "test" / "hot_dog"


def search_pexels(query, per_page=80, page=1):
    params = urllib.parse.urlencode({
        "query": query, "per_page": per_page, "page": page
    })
    url = f"{BASE_URL}?{params}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", API_KEY)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def download_image(url, filepath):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        with open(filepath, "wb") as f:
            f.write(resp.read())


def main():
    if not API_KEY:
        print("Error: Set PEXELS_API_KEY environment variable")
        print("  Get a free key at https://www.pexels.com/api/")
        raise SystemExit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Collect all unique photos
    seen_ids = set()
    all_photos = []
    target = 210  # buffer for failures

    page = 1
    while len(all_photos) < target and page <= 10:
        print(f"Fetching page {page}... (have {len(all_photos)} photos)")
        try:
            data = search_pexels("hot dog", per_page=80, page=page)
            photos = data.get("photos", [])
            if not photos:
                print("  No more results")
                break
            for p in photos:
                if p["id"] not in seen_ids:
                    seen_ids.add(p["id"])
                    all_photos.append(p)
            print(f"  Got {len(photos)} results, {len(all_photos)} unique total")
        except Exception as e:
            print(f"  Error: {e}")
        page += 1
        time.sleep(0.3)

    print(f"\nCollected {len(all_photos)} unique photos")

    # Shuffle
    random.shuffle(all_photos)

    # Download first 200
    downloaded = 0
    attribution = []
    idx = 0

    while downloaded < 200 and idx < len(all_photos):
        photo = all_photos[idx]
        idx += 1
        num = downloaded + 1
        filename = f"{num:03d}.jpg"
        filepath = OUTPUT_DIR / filename

        print(f"  [{num:03d}/200] Downloading... (by {photo['photographer']})")
        try:
            download_image(photo["src"]["large"], str(filepath))
            attribution.append(
                f"{filename} | {photo['photographer']} | {photo['url']}"
            )
            downloaded += 1
        except Exception as e:
            print(f"    Failed: {e}")
        time.sleep(0.15)

    # Save attribution
    with open(OUTPUT_DIR / "attribution.txt", "w") as f:
        f.write("File | Photographer | URL\n")
        f.write("-" * 80 + "\n")
        for line in attribution:
            f.write(line + "\n")

    print(f"\nDone! Downloaded {downloaded} hot dog images to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
