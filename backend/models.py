from __future__ import annotations

from pydantic import BaseModel
from enum import Enum


class RunStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    cancelled = "cancelled"
    failed = "failed"


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    params: str


class DatasetStatus(BaseModel):
    downloaded: bool
    hot_dog_count: int = 0
    not_hot_dog_count: int = 0
    total: int = 0
    splits: list[str] = []


class Prediction(BaseModel):
    image_path: str
    split: str
    category: str  # "hot_dog" or "not_hot_dog"
    filename: str
    raw_response: str
    reasoning: str = ""
    parsed: str  # "yes", "no", or "error"
    correct: bool
    latency_ms: float


class RunRequest(BaseModel):
    model_id: str
    sample_size: int | None = None  # None = full dataset
    api_key: str | None = None  # Override default key


class RunMeta(BaseModel):
    run_id: str
    batch_id: str | None = None
    model_id: str
    model_name: str
    status: RunStatus
    sample_size: int | None = None
    total_images: int = 0
    processed: int = 0
    correct: int = 0
    errors: int = 0
    started_at: str | None = None
    completed_at: str | None = None


class RunStatusResponse(BaseModel):
    run_id: str
    model_id: str
    model_name: str
    status: RunStatus
    total_images: int
    processed: int
    correct: int
    errors: int
    progress_pct: float


class Metrics(BaseModel):
    accuracy: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    true_positives: int = 0
    true_negatives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    total: int = 0
    errors: int = 0


class CategoryBreakdown(BaseModel):
    category: str
    total: int
    correct: int
    accuracy: float
    ci_lower: float
    ci_upper: float


class LatencyStats(BaseModel):
    mean_ms: float
    median_ms: float
    p95_ms: float


class LeaderboardEntry(BaseModel):
    model_id: str
    model_name: str
    provider: str
    params: str
    run_id: str
    accuracy: float
    precision: float
    recall: float
    f1: float
    total: int
    errors: int
    ci_lower: float = 0.0
    ci_upper: float = 0.0
    median_latency_ms: float = 0.0


class ModelDetail(BaseModel):
    model_id: str
    model_name: str
    provider: str
    params: str
    run_id: str
    metrics: Metrics


class ImagePrediction(BaseModel):
    model_id: str
    model_name: str
    raw_response: str
    reasoning: str = ""
    parsed: str
    correct: bool
    latency_ms: float


class BatchRunRequest(BaseModel):
    sample_size: int | None = None
    api_key: str | None = None
    model_ids: list[str] | None = None  # None = all models


class BatchRunResponse(BaseModel):
    batch_id: str
    run_ids: dict[str, str]  # model_id → run_id


class BattleRound(BaseModel):
    round_id: str
    timestamp: str  # ISO 8601
    image_filename: str
    nemotron_answer: str  # yes/no/error
    nemotron_reasoning: str
    nemotron_latency_ms: float
    claw_answer: str  # yes/no/error
    claw_reasoning: str
    consensus: str  # yes/no/disagree
    winner: str  # nemotron/openclaw/tie
    source: str | None = None  # e.g. "@HotDogNotHotDog_Bot", "skill:hotdog"
    claw_latency_ms: float | None = None  # OpenClaw inference time
