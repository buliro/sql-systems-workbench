"""REST API blueprint providing SQL execution and metadata exploration."""

from __future__ import annotations

from http import HTTPStatus
from typing import Any

from flask import Blueprint, Response, current_app, jsonify, request

from ..execution import ExecutionError, SQLExecutor, ensure_identifier

api_bp = Blueprint("api", __name__)


def _get_executor() -> SQLExecutor:
    """Return the shared SQL executor stored in the Flask app state."""
    state = current_app.config["APP_STATE"]
    return state.executor


def _user_id() -> str:
    """Extract the request user identifier for audit logging."""
    return request.headers.get("X-User-Id", "anonymous")


@api_bp.errorhandler(ExecutionError)
def _handle_execution_error(err: ExecutionError) -> tuple[Response, int]:
    """Serialize normalized execution errors to JSON responses."""
    payload = {
        "status": "error",
        "error": {
            "code": err.error_code,
            "message": err.message,
            "sqlstate": err.sqlstate,
            "details": err.details,
            "hint": err.hint,
        },
    }
    return jsonify(payload), err.http_status


@api_bp.errorhandler(Exception)
def _handle_unexpected(err: Exception) -> tuple[Response, int]:  # pragma: no cover - defensive guard
    """Catch-all handler that logs and emits sanitized error responses."""
    current_app.logger.exception("Unhandled API error", exc_info=err)
    payload = {
        "status": "error",
        "error": {
            "code": "internal_error",
            "message": "An unexpected error occurred.",
        },
    }
    return jsonify(payload), HTTPStatus.INTERNAL_SERVER_ERROR


@api_bp.route("/sql", methods=["POST"])
def execute_sql() -> Response:
    """Execute a single SQL statement and return rows with metadata."""
    body: dict[str, Any] | None = request.get_json(silent=True)
    if body is None:
        raise ExecutionError.from_validation("Request body must be valid JSON")

    statement = body.get("statement")
    if not isinstance(statement, str):
        raise ExecutionError.from_validation("'statement' must be a SQL string")

    parameters = body.get("parameters")
    if parameters is not None and not isinstance(parameters, (list, tuple, dict)):
        raise ExecutionError.from_validation("'parameters' must be a list or dict when provided")

    executor = _get_executor()
    result = executor.execute(statement, parameters, user_id=_user_id())

    payload = {
        "status": "ok",
        "data": {
            "rows": result.rows,
            "rowcount": result.rowcount,
            "command_tag": result.command_tag,
        },
        "meta": {
            "duration_ms": result.duration_ms,
            "query_type": result.query_type.value,
            "backend_pid": result.metadata.get("backend_pid"),
        },
    }
    return jsonify(payload), HTTPStatus.OK


@api_bp.route("/metadata/tables", methods=["GET"])
def list_tables() -> Response:
    """List tables tracked in the system catalog, optionally filtered by schema."""
    schema = request.args.get("schema")
    if schema is not None:
        ensure_identifier(schema, label="schema")

    executor = _get_executor()
    rows = executor.list_tables(schema=schema, user_id=_user_id())
    return jsonify({"status": "ok", "data": {"tables": rows}})


@api_bp.route("/metadata/tables/<string:schema>/<string:table>/columns", methods=["GET"])
def list_columns(schema: str, table: str) -> Response:
    """Return column definitions for the specified table."""
    schema = ensure_identifier(schema, label="schema")
    table = ensure_identifier(table, label="table")
    executor = _get_executor()
    rows = executor.list_columns(schema, table, user_id=_user_id())
    return jsonify({"status": "ok", "data": {"columns": rows}})


@api_bp.route("/metadata/tables/<string:schema>/<string:table>/constraints", methods=["GET"])
def list_constraints(schema: str, table: str) -> Response:
    """Return constraint metadata (PK, FK, unique, check) for the table."""
    schema = ensure_identifier(schema, label="schema")
    table = ensure_identifier(table, label="table")
    executor = _get_executor()
    rows = executor.list_constraints(schema, table, user_id=_user_id())
    return jsonify({"status": "ok", "data": {"constraints": rows}})


@api_bp.route("/metadata/tables/<string:schema>/<string:table>/indexes", methods=["GET"])
def list_indexes(schema: str, table: str) -> Response:
    """Return index definitions captured in the system catalog for the table."""
    schema = ensure_identifier(schema, label="schema")
    table = ensure_identifier(table, label="table")
    executor = _get_executor()
    rows = executor.list_indexes(schema, table, user_id=_user_id())
    return jsonify({"status": "ok", "data": {"indexes": rows}})
