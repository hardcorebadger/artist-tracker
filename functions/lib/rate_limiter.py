"""
Token Bucket Rate Limiter

Verbatim Python port of the playlist-generation sample app's `src/lib/rateLimiter.ts`.
Manages API call rates for Spotify (kept intentionally low — see below), Last.fm, and
Gemini, and implements exponential backoff on 429 responses with a hard-ban fast-fail.

Used by the playlist-generation background job (controllers/generation.py). DO NOT relax
the Spotify tuning without testing — the sample app earned a multi-hour ban at 3 req/s.

The executed callable signals a 429 by raising an exception carrying a ``status``
(or ``status_code``) of 429 and an optional ``retry_after_ms`` (or ``retry_after``).
On a hard limit this raises ``RateLimitError(hard_limit=True)`` so the caller can map it
to the backend's 299 "handled, don't retry" convention instead of burning the task
timeout sleeping.
"""

import time


class RateLimitError(Exception):
    def __init__(self, message, retry_after_ms=None, hard_limit=False):
        super().__init__(message)
        self.status = 429
        self.retry_after_ms = retry_after_ms
        self.hard_limit = hard_limit


class RateLimiter:
    def __init__(self, name, max_tokens, refill_rate):
        self.name = name
        self.max_tokens = max_tokens        # Maximum burst capacity
        self.tokens = max_tokens
        self.refill_rate = refill_rate      # Tokens added per second
        self.last_refill = time.monotonic()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.max_tokens, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

    def acquire(self):
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return
        # Wait until 1 token is available
        wait_seconds = (1 - self.tokens) / self.refill_rate
        time.sleep(wait_seconds)
        self._refill()
        self.tokens -= 1

    def execute(self, fn, max_retries=5):
        """Execute ``fn`` with rate limiting and retry on 429.

        Handles a server-provided Retry-After (in ms) automatically; falls back to
        exponential backoff. If the requested wait exceeds MAX_BACKOFF_MS it is treated
        as a hard throttle and raised immediately (``hard_limit=True``) so the caller can
        skip the work rather than sleep through the whole function timeout (which only
        triggers more 429s).
        """
        attempt = 0
        MAX_BACKOFF_MS = 30_000  # never sleep longer than 30s — a long Retry-After means a real ban

        while attempt < max_retries:
            self.acquire()
            try:
                return fn()
            except RateLimitError:
                raise
            except Exception as error:
                status = getattr(error, 'status', None) or getattr(error, 'status_code', None)
                if status == 429:
                    retry_after = getattr(error, 'retry_after_ms', None)
                    if retry_after is None:
                        retry_after = getattr(error, 'retry_after', None)
                    requested = retry_after if retry_after is not None else (2 ** attempt) * 1000
                    if requested > MAX_BACKOFF_MS:
                        print(f"[{self.name}] Server wants {requested}ms wait; throwing fast instead of sleeping.")
                        raise RateLimitError(
                            f"[{self.name}] Hard rate limit; Retry-After={requested}ms",
                            retry_after_ms=requested,
                            hard_limit=True,
                        )
                    print(f"[{self.name}] Rate limited. Retrying after {requested}ms (attempt {attempt + 1}/{max_retries})")
                    time.sleep(requested / 1000)
                    attempt += 1
                    continue
                raise

        raise Exception(f"[{self.name}] Max retries ({max_retries}) exceeded")


# Pre-configured rate limiters (values mirror the sample app — keep them).
# Spotify dev-mode is much tighter than the docs suggest — heavy usage with 3 req/sec
# triggered a 4+ hour ban. Back off to 1 req/sec sustained until we have more headroom.
spotify_limiter = RateLimiter(name='Spotify', max_tokens=15, refill_rate=1)

lastfm_limiter = RateLimiter(name='Last.fm', max_tokens=5, refill_rate=5)     # 5 req/sec

gemini_limiter = RateLimiter(name='Gemini', max_tokens=10, refill_rate=1)     # 60 req/min = 1/sec
