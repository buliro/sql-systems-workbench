"""Connection pool factory wrapping psycopg's pool implementation."""

from __future__ import annotations

from psycopg_pool import ConnectionPool

from .config import AppConfig


def create_pool(config: AppConfig) -> ConnectionPool:
    """Create a connection pool configured for transactional usage."""

    # Autocommit is disabled so each request can control its own transaction.
    return ConnectionPool(
        conninfo=config.database_dsn,
        min_size=config.pool_min_size,
        max_size=config.pool_max_size,
        timeout=config.pool_timeout,
        kwargs={"autocommit": False},
    )
