from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from config import settings, MODELS
from models import Prediction, RunMeta, RunStatus
from services.dataset_manager import list_all_images
from services.openrouter_client import OpenRouterClient
from services.response_parser import parse_response
from services.rate_limiter import global_rate_limiter


# In-memory run tracking
_active_runs: dict[str, RunMeta] = {}
_cancel_flags: dict[str, bool] = {}

# Batch tracking: batch_id → {model_id: run_id}
_active_batches: dict[str, dict[str, str]] = {}


def get_model_info(model_id: str) -> dict | None:
    for m in MODELS:
        if m["id"] == model_id:
            return m
    # Accept any model ID — infer name/provider from ID
    base = model_id.removesuffix(":free")
    parts = base.split("/", 1)
    provider = parts[0].replace("ai", "AI").title() if parts[0] else "Unknown"
    name = parts[1].replace("-", " ").title() if len(parts) > 1 else model_id
    return {"id": model_id, "name": name, "provider": provider, "params": ""}


def get_run(run_id: str) -> RunMeta | None:
    # Check in-memory first
    if run_id in _active_runs:
        return _active_runs[run_id]
    # Check on disk
    meta_path = Path(settings.results_dir) / f"{run_id}_meta.json"
    if meta_path.exists():
        return RunMeta.model_validate_json(meta_path.read_text())
    return None


def list_runs() -> list[RunMeta]:
    runs: dict[str, RunMeta] = {}
    # From disk
    results_dir = Path(settings.results_dir)
    if results_dir.exists():
        for f in results_dir.glob("*_meta.json"):
            try:
                meta = RunMeta.model_validate_json(f.read_text())
                runs[meta.run_id] = meta
            except Exception:
                continue
    # Override with in-memory (more up-to-date)
    for run_id, meta in _active_runs.items():
        runs[run_id] = meta
    return sorted(runs.values(), key=lambda r: r.started_at or "", reverse=True)


def clear_history() -> int:
    """Delete all completed/failed/cancelled run files from disk. Returns count removed."""
    results_dir = Path(settings.results_dir)
    if not results_dir.exists():
        return 0
    removed = 0
    for meta_file in list(results_dir.glob("*_meta.json")):
        try:
            meta = RunMeta.model_validate_json(meta_file.read_text())
        except Exception:
            continue
        if meta.run_id in _active_runs:
            continue
        run_id = meta.run_id
        for suffix in ["_meta.json", ".jsonl", "_queue.json"]:
            p = results_dir / f"{run_id}{suffix}"
            if p.exists():
                p.unlink()
        removed += 1
    return removed


def cancel_run(run_id: str) -> bool:
    if run_id in _active_runs:
        _cancel_flags[run_id] = True
        return True
    return False


def cancel_batch(batch_id: str) -> bool:
    if batch_id not in _active_batches:
        return False
    for run_id in _active_batches[batch_id].values():
        cancel_run(run_id)
    return True


def load_image_queue(run_id: str) -> list[dict] | None:
    queue_path = Path(settings.results_dir) / f"{run_id}_queue.json"
    if not queue_path.exists():
        return None
    return json.loads(queue_path.read_text())


def load_predictions(run_id: str) -> list[Prediction]:
    jsonl_path = Path(settings.results_dir) / f"{run_id}.jsonl"
    if not jsonl_path.exists():
        return []
    predictions = []
    for line in jsonl_path.read_text().strip().split("\n"):
        if line:
            predictions.append(Prediction.model_validate_json(line))
    return predictions


async def start_run(
    model_id: str,
    sample_size: int | None = None,
    api_key: str | None = None,
    images: list[dict] | None = None,
    batch_id: str | None = None,
) -> str:
    model = get_model_info(model_id)
    if model is None:
        raise ValueError(f"Unknown model: {model_id}")

    run_id = str(uuid.uuid4())[:8]

    if images is None:
        images = list_all_images(sample_size)

    meta = RunMeta(
        run_id=run_id,
        batch_id=batch_id,
        model_id=model_id,
        model_name=model["name"],
        status=RunStatus.pending,
        sample_size=sample_size,
        total_images=len(images),
        started_at=datetime.now(timezone.utc).isoformat(),
    )

    _active_runs[run_id] = meta
    _cancel_flags[run_id] = False

    # Ensure results dir exists
    Path(settings.results_dir).mkdir(parents=True, exist_ok=True)

    # Save initial meta
    _save_meta(meta)

    # Save image queue so frontend can preload
    queue_path = Path(settings.results_dir) / f"{run_id}_queue.json"
    queue_data = [
        {"split": img["split"], "category": img["category"], "filename": img["filename"]}
        for img in images
    ]
    queue_path.write_text(json.dumps(queue_data))

    # Launch background task
    asyncio.create_task(_run_benchmark(run_id, model_id, images, api_key))

    return run_id


async def start_batch_run(
    sample_size: int | None = None,
    api_key: str | None = None,
    model_ids: list[str] | None = None,
) -> tuple[str, dict[str, str]]:
    """Start selected models on the same images simultaneously.

    Returns (batch_id, {model_id: run_id}).
    """
    batch_id = str(uuid.uuid4())[:8]

    # Generate images ONCE for all models
    images = list_all_images(sample_size)

    # Resolve models: use provided IDs or fall back to defaults
    if model_ids:
        selected = []
        for mid in model_ids:
            info = get_model_info(mid)
            if info:
                selected.append(info)
        if not selected:
            raise ValueError("No valid models selected")
    else:
        selected = MODELS

    run_ids: dict[str, str] = {}
    for model in selected:
        run_id = await start_run(
            model_id=model["id"],
            sample_size=sample_size,
            api_key=api_key,
            images=images,
            batch_id=batch_id,
        )
        run_ids[model["id"]] = run_id

    _active_batches[batch_id] = run_ids
    return batch_id, run_ids


async def _run_benchmark(
    run_id: str,
    model_id: str,
    images: list[dict],
    api_key: str | None,
):
    meta = _active_runs[run_id]
    meta.status = RunStatus.running
    _save_meta(meta)

    client = OpenRouterClient(api_key)
    jsonl_path = Path(settings.results_dir) / f"{run_id}.jsonl"

    # Check for already-processed images (resumability)
    processed_keys: set[str] = set()
    if jsonl_path.exists():
        for line in jsonl_path.read_text().strip().split("\n"):
            if line:
                p = Prediction.model_validate_json(line)
                processed_keys.add(p.image_path)

    try:
        for img in images:
            if _cancel_flags.get(run_id, False):
                meta.status = RunStatus.cancelled
                break

            key = f"{img['split']}/{img['category']}/{img['filename']}"
            if key in processed_keys:
                meta.processed += 1
                continue

            # Global rate limiter: max 20 requests/min across all runs
            await global_rate_limiter.acquire()

            try:
                raw_response, reasoning, latency_ms = await client.classify_image(
                    model_id, img["path"]
                )
                parsed = parse_response(raw_response)

                # If no separate reasoning tokens, extract explanation
                # from multi-line content (everything before the final yes/no)
                if not reasoning and raw_response:
                    lines = raw_response.strip().split("\n")
                    if len(lines) > 1:
                        last = lines[-1].strip().lower()
                        if last in ("yes", "no", "yes.", "no."):
                            reasoning = "\n".join(lines[:-1]).strip()
                        else:
                            reasoning = raw_response.strip()
                is_correct = (
                    parsed == "yes" and img["category"] == "hot_dog"
                ) or (parsed == "no" and img["category"] == "not_hot_dog")

                prediction = Prediction(
                    image_path=key,
                    split=img["split"],
                    category=img["category"],
                    filename=img["filename"],
                    raw_response=raw_response,
                    reasoning=reasoning,
                    parsed=parsed,
                    correct=is_correct,
                    latency_ms=round(latency_ms, 1),
                )

                # Append to JSONL (crash-safe)
                with open(jsonl_path, "a") as f:
                    f.write(prediction.model_dump_json() + "\n")

                meta.processed += 1
                if is_correct:
                    meta.correct += 1
                if parsed == "error":
                    meta.errors += 1

            except Exception as e:
                prediction = Prediction(
                    image_path=key,
                    split=img["split"],
                    category=img["category"],
                    filename=img["filename"],
                    raw_response=str(e),
                    parsed="error",
                    correct=False,
                    latency_ms=0,
                )
                with open(jsonl_path, "a") as f:
                    f.write(prediction.model_dump_json() + "\n")
                meta.processed += 1
                meta.errors += 1

            _save_meta(meta)

        if meta.status == RunStatus.running:
            meta.status = RunStatus.completed
            meta.completed_at = datetime.now(timezone.utc).isoformat()

    except Exception:
        meta.status = RunStatus.failed

    finally:
        _save_meta(meta)
        await client.close()
        # Keep in active runs for a while so status can be polled
        # but also persisted to disk


def _save_meta(meta: RunMeta):
    meta_path = Path(settings.results_dir) / f"{meta.run_id}_meta.json"
    meta_path.write_text(meta.model_dump_json(indent=2))
