import os
import time

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dataset, benchmark, results, classify, battle

app = FastAPI(title="Hot Dog or Not - LLM Vision Benchmark")

_default_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3005",
    "http://hotdog.local",
]
_extra = os.environ.get("CORS_ORIGINS", "")
_origins = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dataset.router)
app.include_router(benchmark.router)
app.include_router(results.router)
app.include_router(classify.router)
app.include_router(battle.router)


@app.get("/api/models")
def get_models():
    from config import MODELS
    from models import ModelInfo

    return [ModelInfo(**m) for m in MODELS]


_cached_or_models: list[dict] | None = None
_cache_time: float = 0
_CACHE_TTL = 300  # 5 minutes


@app.get("/api/available-models")
async def get_available_models():
    """Fetch free vision-capable models from OpenRouter (cached 5 min)."""
    global _cached_or_models, _cache_time

    if _cached_or_models is not None and time.time() - _cache_time < _CACHE_TTL:
        return _cached_or_models

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get("https://openrouter.ai/api/v1/models")
        resp.raise_for_status()
        data = resp.json()

    models = []
    for m in data.get("data", []):
        pricing = m.get("pricing") or {}
        arch = m.get("architecture") or {}

        # Free models only
        if str(pricing.get("prompt", "1")) != "0":
            continue
        if str(pricing.get("completion", "1")) != "0":
            continue

        # Must support image input
        input_mods = arch.get("input_modalities") or []
        if "image" not in input_mods:
            continue

        # Must produce text output
        output_mods = arch.get("output_modalities") or []
        if "text" not in output_mods:
            continue

        model_id = m["id"]
        if not model_id.endswith(":free"):
            model_id = model_id + ":free"

        name = m.get("name", model_id)
        provider = model_id.split("/")[0]
        context_length = m.get("context_length", 0)

        models.append({
            "id": model_id,
            "name": name,
            "provider": provider,
            "context_length": context_length,
        })

    # Sort by name
    models.sort(key=lambda x: x["name"].lower())

    _cached_or_models = models
    _cache_time = time.time()
    return models


@app.get("/")
def root():
    return {"message": "Hot Dog or Not API", "docs": "/docs"}
