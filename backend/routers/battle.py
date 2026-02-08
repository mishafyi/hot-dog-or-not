from __future__ import annotations

import json
import os
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from config import settings
from models import BattleRound
from services.openrouter_client import OpenRouterClient
from services.rate_limiter import global_rate_limiter
from services.response_parser import parse_response

router = APIRouter(prefix="/api/battle", tags=["battle"])

NEMOTRON_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free"
BATTLE_FILE = Path(settings.results_dir) / "battle.jsonl"
BATTLE_IMAGES_DIR = Path(settings.results_dir) / "battle_images"

BATTLE_RATE_LIMIT = 5  # requests per minute per token
_token_requests: dict[str, list[float]] = defaultdict(list)


def _verify_token(authorization: str | None) -> str:
    if not settings.battle_token:
        raise HTTPException(500, "BATTLE_TOKEN not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if token != settings.battle_token:
        raise HTTPException(403, "Invalid token")
    return token


def _check_rate_limit(token: str) -> None:
    now = time.monotonic()
    window = _token_requests[token]
    # Remove entries older than 60s
    _token_requests[token] = [t for t in window if now - t < 60.0]
    if len(_token_requests[token]) >= BATTLE_RATE_LIMIT:
        raise HTTPException(429, "Rate limit exceeded — max 5 requests per minute")
    _token_requests[token].append(now)


def _load_rounds() -> list[BattleRound]:
    if not BATTLE_FILE.exists():
        return []
    rounds: list[BattleRound] = []
    for line in BATTLE_FILE.read_text().splitlines():
        line = line.strip()
        if line:
            rounds.append(BattleRound(**json.loads(line)))
    return rounds


def _determine_winner(
    nem_answer: str, claw_answer: str
) -> tuple[str, str]:
    """Return (consensus, winner).

    If both agree, consensus is that answer and it's a tie.
    If they disagree, consensus is 'disagree' and there's no clear winner
    until ground truth is known — we mark it 'disagree' for now.
    """
    if nem_answer == claw_answer:
        return nem_answer, "tie"
    return "disagree", "disagree"


@router.post("/round")
async def submit_round(
    image: UploadFile = File(...),
    claw_answer: str = Form(...),
    claw_reasoning: str = Form(""),
    source: str = Form(""),
    claw_latency_ms: float = Form(0.0),
    authorization: str | None = Header(None),
):
    token = _verify_token(authorization)
    _check_rate_limit(token)

    if claw_answer not in ("yes", "no", "error"):
        raise HTTPException(400, "claw_answer must be yes, no, or error")

    # Validate image content type
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    # Validate file extension
    ext = Path(image.filename or "img.jpg").suffix.lower() or ".jpg"
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    if ext not in allowed_extensions:
        raise HTTPException(400, f"Unsupported format. Allowed: {', '.join(sorted(allowed_extensions))}")

    # Read and validate file size (max 10MB)
    content = await image.read()
    max_size = 10 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(413, "Image too large — max 10MB")

    round_id = uuid.uuid4().hex[:8]

    # Save uploaded image
    BATTLE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    image_filename = f"{round_id}{ext}"
    image_path = BATTLE_IMAGES_DIR / image_filename
    image_path.write_bytes(content)

    # Classify with Nemotron
    client = OpenRouterClient()
    try:
        await global_rate_limiter.acquire()
        raw_response, reasoning, latency_ms = await client.classify_image(
            NEMOTRON_MODEL, str(image_path)
        )
        nemotron_answer = parse_response(raw_response)
        nemotron_reasoning = reasoning or raw_response
    except Exception as exc:
        nemotron_answer = "error"
        nemotron_reasoning = str(exc)
        latency_ms = 0.0
    finally:
        await client.close()

    consensus, winner = _determine_winner(nemotron_answer, claw_answer)

    battle_round = BattleRound(
        round_id=round_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        image_filename=image_filename,
        nemotron_answer=nemotron_answer,
        nemotron_reasoning=nemotron_reasoning,
        nemotron_latency_ms=latency_ms,
        claw_answer=claw_answer,
        claw_reasoning=claw_reasoning,
        consensus=consensus,
        winner=winner,
        source=source or None,
        claw_latency_ms=claw_latency_ms if claw_latency_ms > 0 else None,
    )

    # Append to JSONL
    BATTLE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BATTLE_FILE, "a") as f:
        f.write(battle_round.model_dump_json() + "\n")

    return {
        "round_id": round_id,
        "nemotron": {
            "answer": nemotron_answer,
            "reasoning": nemotron_reasoning,
            "latency_ms": latency_ms,
        },
        "openclaw": {
            "answer": claw_answer,
            "reasoning": claw_reasoning,
            "latency_ms": battle_round.claw_latency_ms,
        },
        "consensus": consensus,
        "source": battle_round.source,
        "winner": winner,
        "image_url": f"/api/battle/images/{image_filename}",
    }


@router.get("/feed")
async def get_feed(last: int = 0):
    rounds = _load_rounds()
    return rounds[last:]


@router.get("/stats")
async def get_stats():
    rounds = _load_rounds()
    total = len(rounds)
    nemotron_wins = 0
    openclaw_wins = 0
    ties = 0
    nemotron_agree = 0
    openclaw_agree = 0

    for r in rounds:
        if r.winner == "tie":
            ties += 1
            nemotron_agree += 1
            openclaw_agree += 1
        elif r.winner == "nemotron":
            nemotron_wins += 1
            nemotron_agree += 1
        elif r.winner == "openclaw":
            openclaw_wins += 1
            openclaw_agree += 1
        # 'disagree' — neither gets a point

    return {
        "nemotron_wins": nemotron_wins,
        "openclaw_wins": openclaw_wins,
        "ties": ties,
        "total_rounds": total,
        "nemotron_accuracy": nemotron_agree / total if total else 0,
        "openclaw_accuracy": openclaw_agree / total if total else 0,
    }


@router.get("/images/{filename}")
async def get_image(filename: str):
    # Prevent path traversal
    safe = Path(filename).name
    path = BATTLE_IMAGES_DIR / safe
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(path)
