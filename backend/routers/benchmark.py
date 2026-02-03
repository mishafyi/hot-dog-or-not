from fastapi import APIRouter, HTTPException, Query

from models import (
    RunRequest,
    RunStatusResponse,
    RunMeta,
    RunStatus,
    Prediction,
    BatchRunRequest,
    BatchRunResponse,
)
from services.test_runner import (
    start_run,
    start_batch_run,
    get_run,
    list_runs,
    cancel_run,
    cancel_batch,
    clear_history,
    load_predictions,
    load_image_queue,
)

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


@router.post("/run", response_model=dict)
async def create_run(req: RunRequest):
    try:
        run_id = await start_run(req.model_id, req.sample_size, req.api_key)
        return {"run_id": run_id}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/batch-run", response_model=BatchRunResponse)
async def create_batch_run(req: BatchRunRequest):
    try:
        batch_id, run_ids = await start_batch_run(
            req.sample_size, req.api_key, req.model_ids
        )
        return BatchRunResponse(batch_id=batch_id, run_ids=run_ids)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/batch-run/{batch_id}/cancel")
def cancel_batch_run(batch_id: str):
    if cancel_batch(batch_id):
        return {"status": "cancelling"}
    raise HTTPException(404, "Batch not found or not active")


@router.get("/run/{run_id}/status", response_model=RunStatusResponse)
def run_status(run_id: str):
    meta = get_run(run_id)
    if meta is None:
        raise HTTPException(404, "Run not found")
    progress = (
        (meta.processed / meta.total_images * 100)
        if meta.total_images > 0
        else 0
    )
    return RunStatusResponse(
        run_id=meta.run_id,
        model_id=meta.model_id,
        model_name=meta.model_name,
        status=meta.status,
        total_images=meta.total_images,
        processed=meta.processed,
        correct=meta.correct,
        errors=meta.errors,
        progress_pct=round(progress, 1),
    )


@router.post("/run/{run_id}/cancel")
def cancel(run_id: str):
    if cancel_run(run_id):
        return {"status": "cancelling"}
    raise HTTPException(404, "Run not found or not active")


@router.get("/run/{run_id}/predictions", response_model=list[Prediction])
def run_predictions(
    run_id: str,
    last: int = Query(0, ge=0, description="Return predictions after this index"),
):
    """Get predictions for a run (including active runs). Use 'last' to get only new ones."""
    meta = get_run(run_id)
    if meta is None:
        raise HTTPException(404, "Run not found")
    predictions = load_predictions(run_id)
    return predictions[last:]


@router.get("/run/{run_id}/queue")
def run_image_queue(run_id: str):
    """Get the ordered list of images queued for a run (for carousel preloading)."""
    queue = load_image_queue(run_id)
    if queue is None:
        raise HTTPException(404, "Queue not found for this run")
    return queue


@router.get("/runs", response_model=list[RunMeta])
def all_runs():
    return list_runs()


@router.delete("/runs")
def delete_all_runs():
    removed = clear_history()
    return {"removed": removed}
