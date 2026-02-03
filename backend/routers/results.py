from fastapi import APIRouter, HTTPException, Query

from models import (
    LeaderboardEntry,
    ModelDetail,
    Prediction,
    ImagePrediction,
)
from services.test_runner import list_runs, load_predictions, get_model_info
from services.metrics import compute_enhanced_metrics

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard():
    entries: list[LeaderboardEntry] = []
    # Get the latest completed run per model
    runs = list_runs()
    best_by_model: dict[str, tuple] = {}

    for run in runs:
        if run.status.value != "completed":
            continue
        if run.model_id not in best_by_model:
            best_by_model[run.model_id] = (run.run_id, run)

    for model_id, (run_id, run) in best_by_model.items():
        predictions = load_predictions(run_id)
        if not predictions:
            continue
        enhanced = compute_enhanced_metrics(predictions)
        metrics = enhanced["metrics"]
        model = get_model_info(model_id)
        if model is None:
            continue
        entries.append(
            LeaderboardEntry(
                model_id=model_id,
                model_name=model["name"],
                provider=model["provider"],
                params=model["params"],
                run_id=run_id,
                accuracy=metrics.accuracy,
                precision=metrics.precision,
                recall=metrics.recall,
                f1=metrics.f1,
                total=metrics.total,
                errors=metrics.errors,
                ci_lower=enhanced["ci_lower"],
                ci_upper=enhanced["ci_upper"],
                median_latency_ms=enhanced["latency"]["median_ms"],
            )
        )

    entries.sort(key=lambda e: e.accuracy, reverse=True)
    return entries


@router.get("/model/{model_id:path}")
def model_detail(model_id: str):
    runs = list_runs()
    # Find latest completed run for this model
    for run in runs:
        if run.model_id == model_id and run.status.value == "completed":
            predictions = load_predictions(run.run_id)
            enhanced = compute_enhanced_metrics(predictions)
            model = get_model_info(model_id)
            if model is None:
                raise HTTPException(404, "Model not found")
            detail = ModelDetail(
                model_id=model_id,
                model_name=model["name"],
                provider=model["provider"],
                params=model["params"],
                run_id=run.run_id,
                metrics=enhanced["metrics"],
            )
            return {
                **detail.model_dump(),
                "ci_lower": enhanced["ci_lower"],
                "ci_upper": enhanced["ci_upper"],
                "category_breakdown": enhanced["category_breakdown"],
                "latency": enhanced["latency"],
            }
    raise HTTPException(404, "No completed runs for this model")


@router.get("/model/{model_id:path}/predictions", response_model=list[Prediction])
def model_predictions(
    model_id: str,
    filter: str | None = Query(None, description="correct, incorrect, or error"),
):
    runs = list_runs()
    for run in runs:
        if run.model_id == model_id and run.status.value == "completed":
            predictions = load_predictions(run.run_id)
            if filter == "correct":
                predictions = [p for p in predictions if p.correct]
            elif filter == "incorrect":
                predictions = [
                    p for p in predictions if not p.correct and p.parsed != "error"
                ]
            elif filter == "error":
                predictions = [p for p in predictions if p.parsed == "error"]
            return predictions
    raise HTTPException(404, "No completed runs for this model")


@router.get("/batch-summary")
def batch_summary(run_ids: str = Query(..., description="Comma-separated run IDs")):
    """Enhanced metrics for a set of runs (used by results dashboard)."""
    ids = [rid.strip() for rid in run_ids.split(",") if rid.strip()]
    if not ids:
        raise HTTPException(400, "No run IDs provided")

    results = []
    runs = list_runs()
    run_map = {r.run_id: r for r in runs}

    for run_id in ids:
        run = run_map.get(run_id)
        if not run or run.status.value != "completed":
            continue
        predictions = load_predictions(run_id)
        if not predictions:
            continue
        enhanced = compute_enhanced_metrics(predictions)
        model = get_model_info(run.model_id)
        results.append({
            "run_id": run_id,
            "model_id": run.model_id,
            "model_name": model["name"] if model else run.model_id,
            **enhanced,
        })

    return results


@router.get("/compare")
def compare_runs(run_ids: str = Query(..., description="Comma-separated run IDs")):
    """Per-image head-to-head comparison across runs."""
    ids = [rid.strip() for rid in run_ids.split(",") if rid.strip()]
    if not ids:
        raise HTTPException(400, "No run IDs provided")

    runs = list_runs()
    run_map = {r.run_id: r for r in runs}

    # model_id → {image_path → prediction}
    model_preds: dict[str, dict[str, dict]] = {}
    model_names: dict[str, str] = {}

    for run_id in ids:
        run = run_map.get(run_id)
        if not run or run.status.value != "completed":
            continue
        predictions = load_predictions(run_id)
        model = get_model_info(run.model_id)
        model_name = model["name"] if model else run.model_id
        model_names[run.model_id] = model_name
        preds_by_image: dict[str, dict] = {}
        for p in predictions:
            preds_by_image[p.image_path] = {
                "parsed": p.parsed,
                "correct": p.correct,
                "latency_ms": p.latency_ms,
                "raw_response": p.raw_response,
                "reasoning": p.reasoning,
            }
        model_preds[run.model_id] = preds_by_image

    # Find disagreements: images where models differ
    all_images: set[str] = set()
    for preds in model_preds.values():
        all_images.update(preds.keys())

    disagreements = []
    for img_path in sorted(all_images):
        answers = {}
        for mid, preds in model_preds.items():
            if img_path in preds:
                answers[mid] = preds[img_path]
        # Check if models disagree
        parsed_values = {a["parsed"] for a in answers.values()}
        if len(parsed_values) > 1:
            parts = img_path.split("/")
            disagreements.append({
                "image_path": img_path,
                "split": parts[0] if len(parts) >= 3 else "",
                "category": parts[1] if len(parts) >= 3 else "",
                "filename": parts[2] if len(parts) >= 3 else img_path,
                "predictions": {
                    mid: {**pred, "model_name": model_names.get(mid, mid)}
                    for mid, pred in answers.items()
                },
            })

    return {
        "model_names": model_names,
        "total_images": len(all_images),
        "disagreements": disagreements,
    }


@router.get("/image/{split}/{category}/{filename}")
def image_predictions(split: str, category: str, filename: str):
    """Get all model predictions for a single image."""
    image_path = f"{split}/{category}/{filename}"
    results: list[ImagePrediction] = []

    runs = list_runs()
    seen_models: set[str] = set()

    for run in runs:
        if run.status.value != "completed" or run.model_id in seen_models:
            continue
        seen_models.add(run.model_id)
        predictions = load_predictions(run.run_id)
        for p in predictions:
            if p.image_path == image_path:
                model = get_model_info(run.model_id)
                results.append(
                    ImagePrediction(
                        model_id=run.model_id,
                        model_name=model["name"] if model else run.model_id,
                        raw_response=p.raw_response,
                        reasoning=p.reasoning,
                        parsed=p.parsed,
                        correct=p.correct,
                        latency_ms=p.latency_ms,
                    )
                )
                break

    return results
