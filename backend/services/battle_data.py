"""Shared cached data loading for battle rounds and votes.

Uses file mtime checking to avoid re-parsing JSONL files on every request.
Both battle.py and arena.py import from here instead of defining their own loaders.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

from config import settings
from models import BattleRound, BattleVote

BATTLE_FILE = Path(settings.results_dir) / "battle.jsonl"
VOTES_FILE = Path(settings.results_dir) / "votes.jsonl"

MODEL_DISPLAY_NAMES: dict[str, str] = {
    "nvidia/nemotron-nano-12b-v2-vl:free": "Nemotron 12B",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
    "google/gemini-2.5-flash-preview": "Gemini 2.5 Flash",
    "anthropic/claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "anthropic/claude-opus-4-6": "Claude Opus 4.6",
}


def model_display(model_id: str) -> str:
    """Human-friendly model name from a canonical model ID."""
    if model_id in MODEL_DISPLAY_NAMES:
        return MODEL_DISPLAY_NAMES[model_id]
    name = model_id.split("/")[-1].removesuffix(":free")
    return name.replace("-", " ").title()


# ── TTL cache using file mtime ──────────────────────────────────

_lock = threading.Lock()

_rounds_cache: list[BattleRound] | None = None
_rounds_mtime: float = 0.0

_votes_cache: list[BattleVote] | None = None
_votes_mtime: float = 0.0


def _file_mtime(path: Path) -> float:
    """Return file mtime or 0.0 if file does not exist."""
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def load_rounds() -> list[BattleRound]:
    """Load battle rounds from JSONL, returning cached data when file is unchanged."""
    global _rounds_cache, _rounds_mtime
    with _lock:
        current_mtime = _file_mtime(BATTLE_FILE)
        if _rounds_cache is not None and current_mtime == _rounds_mtime:
            return _rounds_cache

        if not BATTLE_FILE.exists():
            _rounds_cache = []
            _rounds_mtime = current_mtime
            return _rounds_cache

        rounds: list[BattleRound] = []
        for line in BATTLE_FILE.read_text().splitlines():
            line = line.strip()
            if line:
                rounds.append(BattleRound(**json.loads(line)))
        _rounds_cache = rounds
        _rounds_mtime = current_mtime
        return _rounds_cache


def load_votes() -> list[BattleVote]:
    """Load battle votes from JSONL, returning cached data when file is unchanged."""
    global _votes_cache, _votes_mtime
    with _lock:
        current_mtime = _file_mtime(VOTES_FILE)
        if _votes_cache is not None and current_mtime == _votes_mtime:
            return _votes_cache

        if not VOTES_FILE.exists():
            _votes_cache = []
            _votes_mtime = current_mtime
            return _votes_cache

        votes: list[BattleVote] = []
        for line in VOTES_FILE.read_text().splitlines():
            line = line.strip()
            if line:
                votes.append(BattleVote(**json.loads(line)))
        _votes_cache = votes
        _votes_mtime = current_mtime
        return _votes_cache


def invalidate_cache() -> None:
    """Force next load to re-read files. Call after writing to JSONL files."""
    global _rounds_cache, _rounds_mtime, _votes_cache, _votes_mtime
    with _lock:
        _rounds_cache = None
        _rounds_mtime = 0.0
        _votes_cache = None
        _votes_mtime = 0.0
