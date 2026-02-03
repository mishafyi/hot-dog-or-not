#!/usr/bin/env python3
"""
Download "not hot dog" images from Pexels designed to maximize false positives.

Strategy: Find images sharing hot dog's visual signature — elongated food in
bread, golden fried items, similar shapes and context.

Usage:
  PEXELS_API_KEY=your_key python scripts/download_not_hotdogs.py

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

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "backend" / "data" / "test" / "not_hot_dog"

# Queries designed to maximize false positives.
# Each tuple: (query, max_photos_from_this_query)
#
# TIER 1: HIGHEST confusion — sausage/meat in bread (not hot dog)
# TIER 2: HIGH confusion — elongated food, similar shape+color
# TIER 3: MEDIUM confusion — similar context/presentation
# TIER 4: Visual shape matches (non-food)
QUERIES = [
    # TIER 1: Sausage in bread but NOT a hot dog
    ("bratwurst in bun", 8),
    ("bratwurst bread roll", 6),
    ("sausage in bread", 8),
    ("sausage sandwich", 6),
    ("kielbasa on roll", 4),
    ("currywurst german street food", 6),
    ("italian sausage sandwich peppers", 6),
    ("chorizo sandwich bread", 5),
    ("baguette sandwich meat", 6),
    ("sub sandwich long", 5),
    ("hoagie sandwich", 4),

    # TIER 2: Elongated golden/brown food (corn dog family)
    ("corn dog fried", 8),
    ("corn dog stick", 5),
    ("corn dog mustard", 4),
    ("churro close up", 5),
    ("churro chocolate dip", 4),
    ("eclair pastry close up", 5),
    ("eclair chocolate", 4),
    ("sausage roll pastry", 6),
    ("sausage roll close up", 4),
    ("spring roll fried golden", 5),
    ("spring roll close up", 4),
    ("egg roll fried", 4),
    ("taquito crispy fried", 4),
    ("lumpia fried", 4),
    ("flauta mexican fried", 3),
    ("croquette elongated fried", 4),
    ("fish stick breaded", 4),
    ("mozzarella stick fried", 4),
    ("breadstick golden baked", 3),

    # TIER 3: Similar shape + context
    ("cannoli pastry cream", 3),
    ("wrap tortilla rolled", 3),
    ("burrito foil wrapped", 3),
    ("crepe rolled filled", 3),
    ("pretzel stick baked", 3),
    ("corn on cob grilled butter", 3),
    ("grilled sausage plate", 4),
    ("kebab skewer grilled", 3),
    ("yakitori chicken skewer", 3),
    ("pigs in blanket pastry", 3),

    # TIER 4: Visual shape matches (non-food)
    ("dachshund dog side profile", 4),
    ("dachshund lying down", 3),
    ("banana single yellow", 2),
    ("cucumber whole single", 2),
    ("zucchini whole grilled", 2),
    ("carrot whole orange", 2),
]

EXTRA_QUERIES = [
    "fried food elongated",
    "breaded food stick",
    "sausage bread mustard",
    "street food handheld",
    "golden fried food close up",
    "pastry roll baked",
    "meat in bread",
    "grilled food on plate",
    "sandwich long roll",
    "fried appetizer",
]


def search_pexels(query, per_page=15, page=1):
    params = urllib.parse.urlencode({
        "query": query, "per_page": per_page, "page": page
    })
    url = f"{BASE_URL}?{params}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", API_KEY)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode()).get("photos", [])


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

    # Collect photos from all queries
    seen_ids = set()
    all_photos = []

    for query, max_count in QUERIES:
        print(f"  [{len(all_photos):3d} total] Searching: '{query}' (max {max_count})...")
        try:
            photos = search_pexels(query, per_page=max_count + 5)
        except Exception as e:
            print(f"    Error: {e}")
            time.sleep(1)
            continue

        added = 0
        for p in photos:
            if added >= max_count:
                break
            if p["id"] not in seen_ids:
                seen_ids.add(p["id"])
                all_photos.append(p)
                added += 1

        time.sleep(0.25)

    print(f"\nCollected {len(all_photos)} unique photos from targeted queries")

    if len(all_photos) < 200:
        print(f"\nNeed {200 - len(all_photos)} more, fetching additional...")
        for q in EXTRA_QUERIES:
            if len(all_photos) >= 220:
                break
            try:
                photos = search_pexels(q, per_page=15)
                for p in photos:
                    if p["id"] not in seen_ids:
                        seen_ids.add(p["id"])
                        all_photos.append(p)
            except Exception as e:
                print(f"    Error: {e}")
            time.sleep(0.25)
        print(f"  Now have {len(all_photos)} photos")

    # Shuffle
    random.shuffle(all_photos)

    # Download first 200
    downloaded = 0
    attribution = []
    idx = 0

    print(f"\nDownloading 200 images...")
    while downloaded < 200 and idx < len(all_photos):
        photo = all_photos[idx]
        idx += 1
        num = downloaded + 1
        filename = f"{num:03d}.jpg"
        filepath = OUTPUT_DIR / filename

        print(f"  [{num:03d}/200] {photo['photographer']}")
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

    print(f"\nDone! Downloaded {downloaded} false-positive images to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
