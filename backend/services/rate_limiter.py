from __future__ import annotations

import asyncio
import time


MAX_CALLS_PER_MINUTE = 20


class GlobalRateLimiter:
    """Ensures a minimum gap between API requests across all concurrent runs."""

    def __init__(self, max_per_minute: int = MAX_CALLS_PER_MINUTE):
        self._min_gap = 60.0 / max_per_minute
        self._lock = asyncio.Lock()
        self._last_request_time: float = 0.0

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_request_time
            if elapsed < self._min_gap:
                await asyncio.sleep(self._min_gap - elapsed)
            self._last_request_time = time.monotonic()


global_rate_limiter = GlobalRateLimiter()
