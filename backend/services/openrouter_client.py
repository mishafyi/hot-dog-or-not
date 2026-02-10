from __future__ import annotations

import asyncio
import base64
import logging
import mimetypes
import time

import httpx

logger = logging.getLogger("openrouter")

from config import settings, PROMPT


class OpenRouterClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = (api_key or settings.openrouter_api_key).strip()
        self.base_url = settings.openrouter_base_url
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=15.0)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def classify_image(
        self, model_id: str, image_path: str
    ) -> tuple[str, str, float]:
        """Send image to model, return (raw_response, reasoning, latency_ms).

        Rate limiting is handled by the global_rate_limiter in test_runner,
        so no per-client rate limiting is needed here.
        """

        image_b64 = self._encode_image(image_path)
        mime = mimetypes.guess_type(image_path)[0] or "image/jpeg"
        data_url = f"data:{mime};base64,{image_b64}"

        payload = {
            "model": model_id,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                    ],
                }
            ],
            "temperature": settings.temperature,
        }

        if settings.max_tokens is not None:
            payload["max_tokens"] = settings.max_tokens

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/hot-dog-or-not",
            "X-Title": "Hot Dog or Not Benchmark",
        }

        client = await self._get_client()
        retries = [2, 5, 10]
        last_error = None

        for attempt in range(len(retries) + 1):
            start = time.monotonic()
            try:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )
            except httpx.TimeoutException:
                latency_ms = (time.monotonic() - start) * 1000
                last_error = f"Timeout after {latency_ms:.0f}ms (attempt {attempt + 1})"
                logger.warning("%s model=%s", last_error, model_id)
                if attempt < len(retries):
                    await asyncio.sleep(retries[attempt])
                    continue
                raise RuntimeError(last_error)

            latency_ms = (time.monotonic() - start) * 1000

            if resp.status_code in (429, 402, 502, 503):
                last_error = f"{resp.status_code} (attempt {attempt + 1})"
                logger.warning("%s model=%s body=%s", last_error, model_id, resp.text[:200])
                if attempt < len(retries):
                    await asyncio.sleep(retries[attempt])
                    continue

            if resp.status_code >= 400:
                body = resp.text
                raise RuntimeError(f"{resp.status_code} {resp.reason_phrase}: {body}")
            data = resp.json()
            message = data.get("choices", [{}])[0].get("message", {})
            content = message.get("content", "") or ""
            reasoning = message.get("reasoning", "") or ""
            # Models with reasoning tokens (e.g. Nemotron) may put the
            # real answer in reasoning and leave content empty or garbled.
            # Fall back to reasoning if content doesn't look like a valid
            # response (too short / no yes/no extractable).
            if reasoning:
                stripped = content.strip()
                if not stripped or len(stripped) < 5:
                    content = reasoning
            return content.strip(), reasoning.strip(), latency_ms

        raise RuntimeError(last_error or "All retries exhausted")

    @staticmethod
    def _encode_image(path: str) -> str:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
