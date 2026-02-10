"""Universal arena API — platform-agnostic battle endpoint for any agent.

Returns battle results in the response (unlike battle.py which sends to Telegram).
Writes to the same data files so rounds appear on the website.
"""
from __future__ import annotations

import json
import logging
import random
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel as _BaseModel

from config import settings
from models import BattleRound, BattleVote
from services.openrouter_client import OpenRouterClient
from services.rate_limiter import global_rate_limiter
from services.response_parser import parse_response

audit_log = logging.getLogger("arena.audit")

router = APIRouter(prefix="/api/arena", tags=["arena"])

NEMOTRON_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free"
BATTLE_FILE = Path(settings.results_dir) / "battle.jsonl"
BATTLE_IMAGES_DIR = Path(settings.results_dir) / "battle_images"
VOTES_FILE = Path(settings.results_dir) / "votes.jsonl"

RATE_LIMIT = 5  # requests per minute per token
_token_requests: dict[str, list[float]] = defaultdict(list)

MODEL_DISPLAY_NAMES: dict[str, str] = {
    "nvidia/nemotron-nano-12b-v2-vl:free": "Nemotron 12B",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
    "google/gemini-2.5-flash-preview": "Gemini 2.5 Flash",
    "anthropic/claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "anthropic/claude-opus-4-6": "Claude Opus 4.6",
}


def _model_display(model_id: str) -> str:
    if model_id in MODEL_DISPLAY_NAMES:
        return MODEL_DISPLAY_NAMES[model_id]
    name = model_id.split("/")[-1].removesuffix(":free")
    return name.replace("-", " ").title()


def _verify_token(authorization: str | None) -> str:
    if not settings.battle_token:
        raise HTTPException(500, "BATTLE_TOKEN not configured")
    if not authorization or not authorization.startswith("Bearer "):
        audit_log.warning("AUTH_FAIL missing_token")
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if token != settings.battle_token:
        audit_log.warning("AUTH_FAIL invalid_token=%s", token[:8] + "...")
        raise HTTPException(403, "Invalid token")
    return token


def _check_rate_limit(token: str) -> None:
    now = time.monotonic()
    window = _token_requests[token]
    _token_requests[token] = [t for t in window if now - t < 60.0]
    if len(_token_requests[token]) >= RATE_LIMIT:
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


def _load_votes() -> list[BattleVote]:
    if not VOTES_FILE.exists():
        return []
    votes: list[BattleVote] = []
    for line in VOTES_FILE.read_text().splitlines():
        line = line.strip()
        if line:
            votes.append(BattleVote(**json.loads(line)))
    return votes


@router.post("/round")
async def submit_round(
    image: UploadFile = File(...),
    claw_answer: str = Form(...),
    claw_reasoning: str = Form(""),
    source: str = Form(""),
    claw_model: str = Form("openclaw"),
    authorization: str | None = Header(None),
):
    token = _verify_token(authorization)
    _check_rate_limit(token)

    if claw_answer not in ("yes", "no", "error"):
        raise HTTPException(400, "claw_answer must be yes, no, or error")

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    ext = Path(image.filename or "img.jpg").suffix.lower() or ".jpg"
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    if ext not in allowed_extensions:
        raise HTTPException(400, f"Unsupported format. Allowed: {', '.join(sorted(allowed_extensions))}")

    content = await image.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image too large — max 10MB")

    round_id = uuid.uuid4().hex[:8]

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

    # Determine consensus
    if nemotron_answer == claw_answer:
        consensus, winner = claw_answer, "tie"
    else:
        consensus, winner = "disagree", "disagree"

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
        claw_model=claw_model or None,
    )

    BATTLE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BATTLE_FILE, "a") as f:
        f.write(battle_round.model_dump_json() + "\n")

    # Randomly assign sides for blind voting
    first_side = random.choice(["nemotron", "openclaw"])

    def _label(answer: str) -> str:
        return "🌭 Hot Dog" if answer == "yes" else "🚫 Not Hot Dog"

    if first_side == "nemotron":
        r1_answer, r1_reasoning = nemotron_answer, nemotron_reasoning
        r2_answer, r2_reasoning = claw_answer, claw_reasoning
    else:
        r1_answer, r1_reasoning = claw_answer, claw_reasoning
        r2_answer, r2_reasoning = nemotron_answer, nemotron_reasoning

    verdict = _label(nemotron_answer) if nemotron_answer == claw_answer else "⚔️ Split Decision"

    formatted_text = (
        f"🌭 Hot Dog Battle — Round #{round_id}\n\n"
        f"Verdict: {verdict}\n\n"
        f"📋 Response 1: {_label(r1_answer)}\n"
        f'"{r1_reasoning}"\n\n'
        f"📋 Response 2: {_label(r2_answer)}\n"
        f'"{r2_reasoning}"'
    )

    audit_log.info(
        "ARENA round=%s model=%s source=%s winner=%s",
        round_id, claw_model or "?", source or "?", winner,
    )

    return {
        "formatted_text": formatted_text,
        "round_id": round_id,
        "first_side": first_side,
    }


class VoteRequest(_BaseModel):
    round_id: str
    voter_id: str
    voted_for: str  # "first", "second", or "tie"
    first_side: str  # "nemotron" or "openclaw"


@router.post("/vote/submit")
async def submit_vote(body: VoteRequest):
    if body.voted_for not in ("first", "second", "tie"):
        raise HTTPException(400, "voted_for must be first, second, or tie")
    if body.first_side not in ("nemotron", "openclaw"):
        raise HTTPException(400, "first_side must be nemotron or openclaw")

    rounds = _load_rounds()
    round_ = next((r for r in rounds if r.round_id == body.round_id), None)
    if not round_:
        raise HTTPException(404, "Round not found")

    votes = _load_votes()
    if any(v.round_id == body.round_id and v.voter_id == body.voter_id for v in votes):
        raise HTTPException(409, "Already voted on this round")

    claw_model = round_.claw_model or "unknown"

    if body.first_side == "nemotron":
        model_a, model_b = NEMOTRON_MODEL, claw_model
        model_a_side = "nemotron"
    else:
        model_a, model_b = claw_model, NEMOTRON_MODEL
        model_a_side = "openclaw"

    canonical_vote = {"first": "model_a", "second": "model_b"}.get(body.voted_for, "tie")

    vote = BattleVote(
        vote_id=uuid.uuid4().hex[:8],
        round_id=body.round_id,
        voter_id=body.voter_id,
        voted_for=canonical_vote,
        model_a=model_a,
        model_b=model_b,
        model_a_side=model_a_side,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    VOTES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(VOTES_FILE, "a") as f:
        f.write(vote.model_dump_json() + "\n")

    return {
        "status": "ok",
        "reveal": True,
        "first_model": _model_display(model_a),
        "second_model": _model_display(model_b),
    }
