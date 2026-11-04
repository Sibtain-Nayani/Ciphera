"""Shared Redis-backed limits for authentication endpoints."""

import hashlib
from typing import Any

from fastapi import HTTPException
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


_FIXED_WINDOW_INCREMENT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


class AuthRateLimiter:
    """Use atomic Redis counters; authentication fails closed if Redis is down."""

    def __init__(self, client: Any = None):
        self._client = client or Redis.from_url(
            settings.AUTH_RATE_LIMIT_REDIS_URL,
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )

    def enforce(self, scope: str, subject: str, *, limit: int, window_seconds: int) -> None:
        subject_hash = hashlib.sha256(subject.encode("utf-8")).hexdigest()
        key = f"ciphera:auth-rate:{scope}:{subject_hash}"
        try:
            count = int(self._client.eval(_FIXED_WINDOW_INCREMENT, 1, key, window_seconds))
        except RedisError as exc:
            raise HTTPException(
                status_code=503,
                detail="Authentication is temporarily unavailable",
                headers={"Retry-After": "5"},
            ) from exc

        if count > limit:
            raise HTTPException(
                status_code=429,
                detail="Too many authentication attempts. Try again later.",
                headers={"Retry-After": str(window_seconds)},
            )


_rate_limiter: AuthRateLimiter | None = None


def get_auth_rate_limiter() -> AuthRateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = AuthRateLimiter()
    return _rate_limiter
