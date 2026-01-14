"""Flask application factory aligned with the Phase 1 architecture."""

from __future__ import annotations

from dataclasses import dataclass

from flask import Flask

from .config import AppConfig, load_config
from .execution import SQLExecutor
from .pool import create_pool
from .api.routes import api_bp


@dataclass(slots=True)
class AppState:
    """Holds shared infrastructure objects for the application."""

    config: AppConfig
    executor: SQLExecutor


def create_app(config: AppConfig | None = None) -> Flask:
    """Application factory used by the Docker entrypoint and tests."""

    app = Flask(__name__)

    app_config = config or load_config()
    pool = create_pool(app_config)
    executor = SQLExecutor(pool)

    app.config["APP_STATE"] = AppState(config=app_config, executor=executor)

    app.register_blueprint(api_bp, url_prefix="/api")

    @app.teardown_appcontext
    def _teardown(exception: BaseException | None) -> None:  # pragma: no cover - Flask hook
        if exception is not None:
            return
        # Connections are returned automatically by the pool context manager.

    return app
