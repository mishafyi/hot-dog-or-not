"""Single-image classification endpoint for external integrations (OpenClaw, etc.)."""

from __future__ import annotations

import asyncio
import tempfile
import time

from fastapi import APIRouter, File, UploadFile, Query

from services.openrouter_client import OpenRouterClient
from services.response_parser import parse_response

router = APIRouter(prefix="/api", tags=["classify"])

CLASSIFY_MODELS = [
    {
        "id": "nvidia/nemotron-nano-12b-v2-vl:free",
        "name": "NVIDIA Nemotron 12B",
    },
]


async def _classify_one(
    client: OpenRouterClient, model_id: str, image_path: str
) -> dict:
    """Classify a single image with one model."""
    try:
        raw, reasoning, latency_ms = await client.classify_image(model_id, image_path)
        parsed = parse_response(raw)
        return {
            "answer": parsed,
            "reasoning": reasoning or raw,
            "latency_ms": round(latency_ms, 1),
            "error": None,
        }
    except Exception as e:
        return {
            "answer": "error",
            "reasoning": str(e),
            "latency_ms": 0,
            "error": str(e),
        }


@router.post("/classify")
async def classify_image(
    image: UploadFile = File(...),
    api_key: str | None = Query(None, description="Optional OpenRouter API key"),
):
    """Classify a single image as hot dog or not using 2 models.

    Returns consensus verdict with per-model reasoning.
    """
    start = time.monotonic()

    # Save upload to temp file
    suffix = "." + (image.filename or "img.jpg").rsplit(".", 1)[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await image.read()
        tmp.write(content)
        tmp_path = tmp.name

    client = OpenRouterClient(api_key)

    try:
        # Fan out to all models in parallel
        tasks = [
            _classify_one(client, m["id"], tmp_path) for m in CLASSIFY_MODELS
        ]
        results = await asyncio.gather(*tasks)
    finally:
        await client.close()
        import os
        os.unlink(tmp_path)

    total_ms = (time.monotonic() - start) * 1000

    # Build per-model response
    models_out = []
    yes_count = 0
    no_count = 0
    for model_cfg, result in zip(CLASSIFY_MODELS, results):
        if result["answer"] == "yes":
            yes_count += 1
        elif result["answer"] == "no":
            no_count += 1
        models_out.append({
            "model": model_cfg["name"],
            "model_id": model_cfg["id"],
            **result,
        })

    # Consensus
    total_votes = yes_count + no_count
    if yes_count > no_count:
        consensus = "yes"
    elif no_count > yes_count:
        consensus = "no"
    else:
        consensus = "unsure"

    is_hot_dog = consensus == "yes"
    confidence = (
        f"{max(yes_count, no_count)}/{len(CLASSIFY_MODELS)} models agree"
        if total_votes > 0
        else "no valid responses"
    )

    return {
        "consensus": consensus,
        "is_hot_dog": is_hot_dog,
        "confidence": confidence,
        "total_ms": round(total_ms, 1),
        "models": models_out,
    }
