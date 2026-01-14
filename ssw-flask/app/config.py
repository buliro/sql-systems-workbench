"""Application configuration utilities.

The configuration is intentionally minimal to avoid introducing new
infrastructure. Environment variables are used so the Docker runtime can
inject secrets without modifying source code.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class AppConfig:
    """Container for runtime configuration values."""

    database_dsn: str
    pool_min_size: int
    pool_max_size: int
    pool_timeout: float


def load_config(env: Mapping[str, str] | None = None) -> AppConfig:
    """Create an :class:`AppConfig` from environment variables.

    Parameters
    ----------
    env:
        Optional mapping used primarily for tests. Defaults to ``os.environ``.
    """

    source = env or os.environ

    try:
        dsn = source["DATABASE_DSN"]
    except KeyError as exc:  # pragma: no cover - defensive guard for clarity
        raise RuntimeError("DATABASE_DSN must be configured") from exc

    pool_min = int(source.get("DB_POOL_MIN_SIZE", "1"))
    pool_max = int(source.get("DB_POOL_MAX_SIZE", "10"))
    pool_timeout = float(source.get("DB_POOL_TIMEOUT", "5.0"))

    if pool_min < 1 or pool_max < pool_min:
        raise ValueError("Invalid connection pool sizing configuration")

    return AppConfig(
        database_dsn=dsn,
        pool_min_size=pool_min,
        pool_max_size=pool_max,
        pool_timeout=pool_timeout,
    )
