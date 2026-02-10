from __future__ import annotations

import json
import logging
import os
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import hashlib
import hmac
import secrets

import httpx
from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

from config import settings

# Security audit logger — flags unauthorized access attempts
audit_log = logging.getLogger("battle.audit")
audit_log.setLevel(logging.INFO)
_audit_handler = logging.StreamHandler()
_audit_handler.setFormatter(logging.Formatter("%(asctime)s AUDIT %(message)s"))
audit_log.addHandler(_audit_handler)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
VOTE_SIGNING_KEY = os.getenv("VOTE_SIGNING_KEY", secrets.token_hex(32))
from models import BattleRound, BattleVote
from services.openrouter_client import OpenRouterClient
from services.rate_limiter import global_rate_limiter
from services.response_parser import parse_response

router = APIRouter(prefix="/api/battle", tags=["battle"])

NEMOTRON_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free"
BATTLE_FILE = Path(settings.results_dir) / "battle.jsonl"
BATTLE_IMAGES_DIR = Path(settings.results_dir) / "battle_images"

VOTES_FILE = Path(settings.results_dir) / "votes.jsonl"

OPENCLAW_WEBHOOK_URL = os.getenv("OPENCLAW_WEBHOOK_URL", "http://localhost:18811/telegram-webhook")
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")

BATTLE_RATE_LIMIT = 5  # requests per minute per token
_token_requests: dict[str, list[float]] = defaultdict(list)

# Store recent Telegram context from webhook updates so the battle API
# can auto-fill chat_id/sender without the skill needing to extract them.
# Keyed by Telegram user_id, expires after 120s.
_recent_tg_context: dict[int, dict] = {}  # {user_id: {chat_id, sender, ts}}

# Model display names
MODEL_DISPLAY_NAMES: dict[str, str] = {
    "nvidia/nemotron-nano-12b-v2-vl:free": "Nemotron 12B",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
    "google/gemini-2.5-flash-preview": "Gemini 2.5 Flash",
    "anthropic/claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "anthropic/claude-opus-4-6": "Claude Opus 4.6",
}


async def _tg_api(method: str, data: dict) -> dict | None:
    """Call a Telegram Bot API method."""
    if not TELEGRAM_BOT_TOKEN:
        return None
    try:
        async with httpx.AsyncClient() as http:
            r = await http.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}",
                json=data,
                timeout=10,
            )
            return r.json()
    except Exception:
        return None


def _model_display(model_id: str) -> str:
    if model_id in MODEL_DISPLAY_NAMES:
        return MODEL_DISPLAY_NAMES[model_id]
    # Strip provider prefix and :free suffix
    name = model_id.split("/")[-1].removesuffix(":free")
    return name.replace("-", " ").title()


def _sign_vote(round_id: str, voter_id: str, voted_for: str, first_side: str) -> str:
    msg = f"{round_id}:{voter_id}:{voted_for}:{first_side}"
    return hmac.new(VOTE_SIGNING_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()[:16]


def _load_votes() -> list[BattleVote]:
    if not VOTES_FILE.exists():
        return []
    votes: list[BattleVote] = []
    for line in VOTES_FILE.read_text().splitlines():
        line = line.strip()
        if line:
            votes.append(BattleVote(**json.loads(line)))
    return votes


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
    # Remove entries older than 60s
    _token_requests[token] = [t for t in window if now - t < 60.0]
    if len(_token_requests[token]) >= BATTLE_RATE_LIMIT:
        audit_log.warning("RATE_LIMIT token=%s count=%d", token[:8] + "...", len(_token_requests[token]))
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
    claw_model: str = Form("openclaw"),
    telegram_chat_id: str = Form(""),
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
        claw_model=claw_model or None,
    )

    # Append to JSONL
    BATTLE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BATTLE_FILE, "a") as f:
        f.write(battle_round.model_dump_json() + "\n")

    # Randomly assign sides for blind voting
    import random
    first_side = random.choice(["nemotron", "openclaw"])

    # Build formatted blind battle text server-side
    def _label(answer: str) -> str:
        return "🌭 Hot Dog" if answer == "yes" else "🚫 Not Hot Dog"

    if first_side == "nemotron":
        r1_answer, r1_reasoning = nemotron_answer, nemotron_reasoning
        r2_answer, r2_reasoning = claw_answer, claw_reasoning
    else:
        r1_answer, r1_reasoning = claw_answer, claw_reasoning
        r2_answer, r2_reasoning = nemotron_answer, nemotron_reasoning

    if nemotron_answer == claw_answer:
        verdict = _label(nemotron_answer)
    else:
        verdict = "⚔️ Models disagree"

    formatted_text = (
        f"🌭 Cook-Off — Round #{round_id}\n\n"
        f"Verdict: {verdict}\n\n"
        f"🅰️ Model A: {_label(r1_answer)}\n"
        f'"{r1_reasoning}"\n\n'
        f"🅱️ Model B: {_label(r2_answer)}\n"
        f'"{r2_reasoning}"'
    )

    # Auto-fill telegram_chat_id from recent webhook context if not provided
    if not telegram_chat_id:
        now = time.time()
        # Find the most recent context within 300 seconds (must survive OpenRouter retries)
        best = None
        for uid, ctx in list(_recent_tg_context.items()):
            if now - ctx["ts"] > 300:
                del _recent_tg_context[uid]
                continue
            if best is None or ctx["ts"] > best["ts"]:
                best = ctx
        if best:
            telegram_chat_id = str(best["chat_id"])

    # Send results + vote buttons in one Telegram message (no delay needed)
    if telegram_chat_id and TELEGRAM_BOT_TOKEN:
        buttons = [
            {"text": "Model A", "callback_data": f"hdv:{round_id}:first:{first_side}"},
            {"text": "Model B", "callback_data": f"hdv:{round_id}:second:{first_side}"},
        ]
        await _tg_api("sendMessage", {
            "chat_id": int(telegram_chat_id),
            "text": formatted_text,
            "reply_markup": {"inline_keyboard": [buttons]},
        })

    audit_log.info(
        "BATTLE round=%s model=%s source=%s winner=%s",
        round_id[:8], claw_model or "?", battle_round.source or "?", winner,
    )

    return {}


@router.get("/feed")
async def get_feed(last: int = 0):
    rounds = _load_rounds()
    votes = _load_votes()

    # Index votes by round_id
    round_votes: dict[str, list[BattleVote]] = defaultdict(list)
    for v in votes:
        round_votes[v.round_id].append(v)

    # Only return rounds that have at least one vote
    voted_rounds = []
    for r in rounds:
        rv = round_votes.get(r.round_id)
        if not rv:
            continue

        # Tally: which model did voters prefer?
        nem_votes = 0
        claw_votes = 0
        tie_votes = 0
        for v in rv:
            # Map canonical vote back to nemotron/openclaw
            if v.voted_for == "tie":
                tie_votes += 1
            elif v.voted_for == "model_a":
                if v.model_a_side == "nemotron":
                    nem_votes += 1
                else:
                    claw_votes += 1
            elif v.voted_for == "model_b":
                if v.model_a_side == "nemotron":
                    claw_votes += 1
                else:
                    nem_votes += 1

        if nem_votes > claw_votes:
            vote_winner = "nemotron"
        elif claw_votes > nem_votes:
            vote_winner = "openclaw"
        else:
            vote_winner = "tie"

        d = r.model_dump()
        d["vote_winner"] = vote_winner
        d["vote_count"] = len(rv)
        voted_rounds.append(d)

    return voted_rounds[last:]


@router.get("/stats")
async def get_stats():
    rounds = _load_rounds()
    votes = _load_votes()

    # Index votes by round_id
    round_votes: dict[str, list[BattleVote]] = defaultdict(list)
    for v in votes:
        round_votes[v.round_id].append(v)

    nemotron_preferred = 0
    openclaw_preferred = 0
    ties = 0
    total_voted = 0

    for r in rounds:
        rv = round_votes.get(r.round_id)
        if not rv:
            continue
        total_voted += 1

        nem_votes = 0
        claw_votes = 0
        for v in rv:
            if v.voted_for == "tie":
                pass
            elif v.voted_for == "model_a":
                if v.model_a_side == "nemotron":
                    nem_votes += 1
                else:
                    claw_votes += 1
            elif v.voted_for == "model_b":
                if v.model_a_side == "nemotron":
                    claw_votes += 1
                else:
                    nem_votes += 1

        if nem_votes > claw_votes:
            nemotron_preferred += 1
        elif claw_votes > nem_votes:
            openclaw_preferred += 1
        else:
            ties += 1

    return {
        "nemotron_preferred": nemotron_preferred,
        "openclaw_preferred": openclaw_preferred,
        "ties": ties,
        "total_voted_rounds": total_voted,
    }


@router.get("/images/{filename}")
async def get_image(filename: str):
    # Prevent path traversal
    safe = Path(filename).name
    path = BATTLE_IMAGES_DIR / safe
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(path)


# ── Voting endpoints ──────────────────────────────────────────


from pydantic import BaseModel as _BaseModel

class VoteRequest(_BaseModel):
    round_id: str
    voter_id: str
    voted_for: str  # "first", "second", or "tie"
    first_side: str  # "nemotron" or "openclaw" — which side was shown first

@router.post("/vote/submit")
async def submit_vote(
    body: VoteRequest,
    authorization: str | None = Header(None),
):
    """Vote endpoint for callback handler plugin. Accepts JSON body."""
    round_id = body.round_id
    voter_id = body.voter_id
    voted_for = body.voted_for
    first_side = body.first_side

    if voted_for not in ("first", "second", "tie"):
        raise HTTPException(400, "voted_for must be first, second, or tie")
    if first_side not in ("nemotron", "openclaw"):
        raise HTTPException(400, "first_side must be nemotron or openclaw")

    # Look up the round to get actual model names
    rounds = _load_rounds()
    round_ = next((r for r in rounds if r.round_id == round_id), None)
    if not round_:
        raise HTTPException(404, "Round not found")

    # Check for duplicate vote
    votes = _load_votes()
    already_voted = any(v.round_id == round_id and v.voter_id == voter_id for v in votes)
    if already_voted:
        raise HTTPException(409, "Already voted on this round")

    nemotron_model = NEMOTRON_MODEL
    claw_model = round_.claw_model or "unknown"

    # Map first/second to model_a/model_b based on first_side
    if first_side == "nemotron":
        model_a, model_b = nemotron_model, claw_model
        model_a_side = "nemotron"
    else:
        model_a, model_b = claw_model, nemotron_model
        model_a_side = "openclaw"

    # Map voted_for from first/second to model_a/model_b
    if voted_for == "first":
        canonical_vote = "model_a"
    elif voted_for == "second":
        canonical_vote = "model_b"
    else:
        canonical_vote = "tie"

    vote = BattleVote(
        vote_id=uuid.uuid4().hex[:8],
        round_id=round_id,
        voter_id=voter_id,
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


@router.get("/vote/telegram")
async def vote_telegram(
    round_id: str = Query(...),
    voter_id: str = Query(...),
    voted_for: str = Query(...),
    first_side: str = Query(...),
    sig: str = Query(...),
):
    """Handle vote from Telegram inline button. Records vote and shows confirmation."""
    expected_sig = _sign_vote(round_id, voter_id, voted_for, first_side)
    if not hmac.compare_digest(sig, expected_sig):
        return HTMLResponse("<h1>Invalid vote link</h1>", status_code=403)

    if voted_for not in ("first", "second", "tie"):
        return HTMLResponse("<h1>Invalid vote</h1>", status_code=400)
    if first_side not in ("nemotron", "openclaw"):
        return HTMLResponse("<h1>Invalid vote</h1>", status_code=400)

    rounds = _load_rounds()
    round_ = next((r for r in rounds if r.round_id == round_id), None)
    if not round_:
        return HTMLResponse("<h1>Round not found</h1>", status_code=404)

    # Check for duplicate vote
    votes = _load_votes()
    already_voted = any(v.round_id == round_id and v.voter_id == voter_id for v in votes)
    if already_voted:
        return HTMLResponse(
            "<html><body style='font-family:system-ui;text-align:center;padding:60px'>"
            "<h1>Already voted!</h1>"
            "<p>You already voted on this round.</p>"
            "<a href='https://hotdogornot.xyz/battle'>View rankings</a>"
            "</body></html>"
        )

    nemotron_model = NEMOTRON_MODEL
    claw_model = round_.claw_model or "unknown"

    if first_side == "nemotron":
        model_a, model_b = nemotron_model, claw_model
        model_a_side = "nemotron"
    else:
        model_a, model_b = claw_model, nemotron_model
        model_a_side = "openclaw"

    if voted_for == "first":
        canonical_vote = "model_a"
    elif voted_for == "second":
        canonical_vote = "model_b"
    else:
        canonical_vote = "tie"

    vote = BattleVote(
        vote_id=uuid.uuid4().hex[:8],
        round_id=round_id,
        voter_id=voter_id,
        voted_for=canonical_vote,
        model_a=model_a,
        model_b=model_b,
        model_a_side=model_a_side,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    VOTES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(VOTES_FILE, "a") as f:
        f.write(vote.model_dump_json() + "\n")

    # Send reveal message to Telegram
    if TELEGRAM_BOT_TOKEN:
        try:
            reveal = (
                f"🎭 Reveal:\n"
                f"• Model A was {_model_display(model_a)}\n"
                f"• Model B was {_model_display(model_b)}\n\n"
                f"🏆 Scoreboard: https://hotdogornot.xyz/battle"
            )
            async with httpx.AsyncClient() as http:
                await http.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": int(voter_id), "text": reveal},
                )
        except Exception:
            pass

    return HTMLResponse(
        "<html><body style='font-family:system-ui;text-align:center;padding:60px'>"
        f"<h1>Vote recorded!</h1>"
        f"<p>Model A was <b>{_model_display(model_a)}</b></p>"
        f"<p>Model B was <b>{_model_display(model_b)}</b></p>"
        f"<a href='https://hotdogornot.xyz/battle'>View rankings</a>"
        "</body></html>"
    )


EXCLUDED_MODELS = {"openclaw", "unknown"}


@router.get("/leaderboard")
async def get_leaderboard():
    votes = [v for v in _load_votes() if v.model_a not in EXCLUDED_MODELS and v.model_b not in EXCLUDED_MODELS]
    total = len(votes)
    min_votes = 2

    if total < min_votes:
        return {
            "models": [],
            "total_votes": total,
            "min_votes_needed": min_votes,
        }

    # Build matchup data for Bradley-Terry
    # The winner column uses "model_a"/"model_b"/"tie" convention expected by arena-rank
    rows = []
    for v in votes:
        rows.append({
            "model_a": v.model_a,
            "model_b": v.model_b,
            "winner": v.voted_for,  # already "model_a", "model_b", or "tie"
        })

    vote_counts: dict[str, int] = defaultdict(int)
    for v in votes:
        vote_counts[v.model_a] += 1
        vote_counts[v.model_b] += 1

    try:
        import pandas as pd
        from arena_rank.models.bradley_terry import BradleyTerry
        from arena_rank.utils.data_utils import PairDataset

        df = pd.DataFrame(rows)
        dataset = PairDataset.from_pandas(df)
        n = dataset.n_competitors

        bt = BradleyTerry(n_competitors=n)
        result = bt.compute_ratings_and_cis(dataset)

        models = []
        for i, comp in enumerate(result["competitors"]):
            rating = float(result["ratings"][i])
            ci_lo = float(result["rating_lower"][i])
            ci_hi = float(result["rating_upper"][i])
            models.append({
                "model": comp,
                "display": _model_display(comp),
                "rating": round(rating),
                "ci": [round(ci_lo), round(ci_hi)],
                "votes": vote_counts.get(comp, 0),
            })

        models.sort(key=lambda m: m["rating"], reverse=True)

        return {
            "models": models,
            "total_votes": total,
            "min_votes_needed": min_votes,
        }
    except Exception:
        # Fallback: basic win-rate ranking if arena-rank fails
        model_wins: dict[str, int] = defaultdict(int)
        model_total: dict[str, int] = defaultdict(int)

        for v in votes:
            model_total[v.model_a] += 1
            model_total[v.model_b] += 1
            if v.voted_for == "model_a":
                model_wins[v.model_a] += 1
            elif v.voted_for == "model_b":
                model_wins[v.model_b] += 1

        models = []
        for model_id in model_total:
            wins = model_wins.get(model_id, 0)
            total_m = model_total[model_id]
            win_rate = wins / total_m if total_m > 0 else 0.5
            rating = round(1500 + (win_rate - 0.5) * 400)
            models.append({
                "model": model_id,
                "display": _model_display(model_id),
                "rating": rating,
                "ci": [rating - 50, rating + 50],
                "votes": total_m,
            })

        models.sort(key=lambda m: m["rating"], reverse=True)

        return {
            "models": models,
            "total_votes": total,
            "min_votes_needed": min_votes,
        }


# ── Telegram webhook ──────────────────────────────────────────


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Receive Telegram updates. Handle vote callbacks instantly,
    forward everything else to OpenClaw."""
    # Verify Telegram webhook secret if configured
    if TELEGRAM_WEBHOOK_SECRET:
        secret_header = request.headers.get("x-telegram-bot-api-secret-token", "")
        if not hmac.compare_digest(secret_header, TELEGRAM_WEBHOOK_SECRET):
            audit_log.warning("WEBHOOK_FAIL invalid_secret from=%s", request.client.host if request.client else "?")
            raise HTTPException(403, "Invalid webhook secret")

    update = await request.json()

    # Handle vote callback queries
    if "callback_query" in update:
        cb = update["callback_query"]
        data = cb.get("data", "")
        if data.startswith("hdv:"):
            await _handle_vote_callback(cb)
            return {"ok": True}

    # Log inbound messages for audit trail
    msg = update.get("message", {})
    from_user = msg.get("from", {})
    user_id = from_user.get("id")
    username = from_user.get("username", "")
    has_photo = bool(msg.get("photo"))
    text = msg.get("text", "")
    if msg:
        audit_log.info(
            "TG_MSG user=%s (@%s) photo=%s text=%s",
            user_id, username, has_photo,
            repr(text[:80]) if text else "none",
        )

    # Store context from photo messages for the battle API to use
    if has_photo and user_id:
        name = from_user.get("first_name", "unknown")
        sender = f"@{username}" if username else name
        chat_id = msg.get("chat", {}).get("id", user_id)
        _recent_tg_context[user_id] = {
            "chat_id": chat_id,
            "sender": sender,
            "ts": time.time(),
        }

        # Send instant "processing" message from backend
        if TELEGRAM_BOT_TOKEN:
            await _tg_api("sendMessage", {
                "chat_id": chat_id,
                "text": "\U0001f32d Two AI models are looking at your photo... get ready to judge!",
            })

    # Forward everything else to OpenClaw
    try:
        headers = {}
        if TELEGRAM_WEBHOOK_SECRET:
            headers["X-Telegram-Bot-Api-Secret-Token"] = TELEGRAM_WEBHOOK_SECRET
        async with httpx.AsyncClient() as http:
            await http.post(OPENCLAW_WEBHOOK_URL, json=update, headers=headers, timeout=10)
    except Exception:
        pass  # best-effort forward

    return {"ok": True}


async def _handle_vote_callback(cb: dict):
    """Process an hdv: vote callback inline — no LLM needed."""
    query_id = cb["id"]
    data = cb.get("data", "")
    chat_id = cb.get("message", {}).get("chat", {}).get("id")
    message_id = cb.get("message", {}).get("message_id")
    sender_id = str(cb.get("from", {}).get("id", ""))

    # Parse hdv:{round_id}:{vote}:{first_side}
    parts = data.split(":")
    if len(parts) != 4:
        await _tg_api("answerCallbackQuery", {
            "callback_query_id": query_id,
            "text": "Invalid vote data",
        })
        return

    _, round_id, voted_for, first_side = parts

    try:
        rounds = _load_rounds()
        round_ = next((r for r in rounds if r.round_id == round_id), None)
        if not round_:
            await _tg_api("answerCallbackQuery", {
                "callback_query_id": query_id, "text": "Round not found",
            })
            return

        # Check duplicate
        votes = _load_votes()
        if any(v.round_id == round_id and v.voter_id == sender_id for v in votes):
            await _tg_api("answerCallbackQuery", {
                "callback_query_id": query_id,
                "text": "You already voted on this round!",
                "show_alert": True,
            })
            return

        if voted_for not in ("first", "second", "tie"):
            await _tg_api("answerCallbackQuery", {
                "callback_query_id": query_id, "text": "Invalid vote",
            })
            return
        if first_side not in ("nemotron", "openclaw"):
            await _tg_api("answerCallbackQuery", {
                "callback_query_id": query_id, "text": "Invalid vote",
            })
            return

        nemotron_model = NEMOTRON_MODEL
        claw_model = round_.claw_model or "unknown"

        if first_side == "nemotron":
            model_a, model_b = nemotron_model, claw_model
            model_a_side = "nemotron"
        else:
            model_a, model_b = claw_model, nemotron_model
            model_a_side = "openclaw"

        canonical_vote = {"first": "model_a", "second": "model_b"}.get(voted_for, "tie")

        vote = BattleVote(
            vote_id=uuid.uuid4().hex[:8],
            round_id=round_id,
            voter_id=sender_id,
            voted_for=canonical_vote,
            model_a=model_a,
            model_b=model_b,
            model_a_side=model_a_side,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        VOTES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(VOTES_FILE, "a") as f:
            f.write(vote.model_dump_json() + "\n")

        # Answer callback (dismiss spinner)
        await _tg_api("answerCallbackQuery", {"callback_query_id": query_id})

        # Edit the original vote message to show the reveal
        reveal = (
            f"🗳️ Verdict recorded!\n\n"
            f"🎭 Reveal:\n"
            f"• Model A was *{_model_display(model_a)}*\n"
            f"• Model B was *{_model_display(model_b)}*\n\n"
            f"🏆 [Scoreboard](https://hotdogornot.xyz/battle)"
        )
        if chat_id and message_id:
            await _tg_api("editMessageText", {
                "chat_id": chat_id,
                "message_id": message_id,
                "text": reveal,
                "parse_mode": "Markdown",
            })

    except Exception:
        await _tg_api("answerCallbackQuery", {
            "callback_query_id": query_id,
            "text": "Something went wrong",
        })
