"""Central SQL execution module for all database interactions.

The executor encapsulates connection management, statement validation,
classification, auditing, and metadata synchronization. The goal is to keep
all SQL handling in one place so the REST API remains thin and stateless.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping, MutableMapping, Optional, Sequence

import psycopg
from psycopg import sql
from psycopg.errors import DatabaseError
from psycopg.rows import dict_row
from psycopg.types.json import Json
from psycopg_pool import ConnectionPool
import sqlparse


_VALID_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class QueryType(str, Enum):
    """Minimal classification used for downstream routing."""

    DDL = "ddl"
    DML = "dml"
    SELECT = "select"
    OTHER = "other"


@dataclass(slots=True)
class ExecutionResult:
    """Represents the normalized output from PostgreSQL."""

    rows: list[dict[str, Any]]
    rowcount: int
    duration_ms: float
    command_tag: str
    query_type: QueryType
    metadata: dict[str, Any]


@dataclass(slots=True)
class ExecutionError(Exception):
    """Normalized error surfaced to API callers."""

    message: str
    sqlstate: Optional[str]
    error_code: str
    http_status: int
    details: Optional[str] = None
    hint: Optional[str] = None

    def __str__(self) -> str:  # pragma: no cover - debug helper
        return f"{self.error_code}: {self.message}"

    @classmethod
    def from_db_error(cls, err: DatabaseError) -> "ExecutionError":
        sqlstate = getattr(err, "sqlstate", None)
        mapping = _ERROR_CODE_MAPPING.get(sqlstate, _ERROR_CODE_MAPPING[None])
        message = getattr(err, "pgerror", None) or str(err)
        return cls(
            message=message.strip(),
            sqlstate=sqlstate,
            error_code=mapping.code,
            http_status=mapping.http_status,
            details=getattr(err, "diag", None) and getattr(err.diag, "message_primary", None),
            hint=getattr(err, "diag", None) and getattr(err.diag, "hint", None),
        )

    @classmethod
    def from_validation(cls, message: str, error_code: str = "invalid_request", http_status: int = 400) -> "ExecutionError":
        return cls(message=message, sqlstate=None, error_code=error_code, http_status=http_status)


@dataclass(frozen=True)
class _ErrorMap:
    code: str
    http_status: int


_ERROR_CODE_MAPPING: dict[Optional[str], _ErrorMap] = {
    "23505": _ErrorMap("unique_violation", 409),
    "23503": _ErrorMap("foreign_key_violation", 409),
    "23502": _ErrorMap("not_null_violation", 400),
    "23514": _ErrorMap("check_violation", 400),
    "40P01": _ErrorMap("deadlock_detected", 409),
    "42601": _ErrorMap("syntax_error", 400),
    "42703": _ErrorMap("undefined_column", 400),
    "42P01": _ErrorMap("undefined_table", 404),
    None: _ErrorMap("database_error", 500),
}


class SQLExecutor:
    """Executes SQL statements using a shared connection pool."""

    def __init__(self, pool: ConnectionPool) -> None:
        """Initialize the executor with a connection pool and sync metadata."""
        self._pool = pool
        # Ensure metadata tables reflect the current PostgreSQL catalog.
        self.synchronize_catalog()

    def execute(
        self,
        statement: str,
        parameters: Sequence[Any] | Mapping[str, Any] | None = None,
        *,
        user_id: str | None = None,
    ) -> ExecutionResult:
        """Execute a single SQL statement and return normalized results."""

        normalized = statement.strip()
        if not normalized:
            raise ExecutionError.from_validation("SQL statement must not be empty")

        fragments = [part for part in sqlparse.split(normalized) if part.strip()]
        if len(fragments) != 1:
            raise ExecutionError.from_validation("Exactly one SQL statement is allowed per request")

        parsed = sqlparse.parse(normalized)[0]
        classification = self._classify(parsed)

        start = time.monotonic()
        try:
            with self._pool.connection() as conn:
                backend_pid = conn.info.backend_pid
                try:
                    with conn.cursor(row_factory=dict_row) as cur:
                        cur.execute(normalized, parameters)
                        rows: list[dict[str, Any]] = []
                        if cur.description:
                            rows = [dict(row) for row in cur.fetchall()]
                        rowcount = cur.rowcount if cur.rowcount != -1 else len(rows)
                        command_tag = cur.statusmessage or ""

                    if classification is QueryType.DDL:
                        self._refresh_catalog(conn)

                    conn.commit()
                except DatabaseError as exc:
                    conn.rollback()
                    raise exc
        except DatabaseError as exc:
            duration_ms = (time.monotonic() - start) * 1000.0
            error = ExecutionError.from_db_error(exc)
            self._record_audit(
                user_id=user_id,
                statement=normalized,
                parameters=parameters,
                query_type=classification,
                success=False,
                duration_ms=duration_ms,
                rowcount=0,
                error=error,
            )
            raise error

        duration_ms = (time.monotonic() - start) * 1000.0
        metadata = {
            "backend_pid": backend_pid,
            "classification": classification.value,
        }
        result = ExecutionResult(
            rows=rows,
            rowcount=rowcount,
            duration_ms=duration_ms,
            command_tag=command_tag,
            query_type=classification,
            metadata=metadata,
        )
        self._record_audit(
            user_id=user_id,
            statement=normalized,
            parameters=parameters,
            query_type=classification,
            success=True,
            duration_ms=duration_ms,
            rowcount=rowcount,
            error=None,
        )
        return result

    # Metadata convenience helpers -------------------------------------------------

    def list_tables(self, *, schema: str | None = None, user_id: str | None = None) -> list[dict[str, Any]]:
        """Return table entries from the system catalog optionally filtered by schema."""
        if schema is None:
            sql_query = """
                SELECT schema_name, table_name, owner_role, created_at
                FROM system.system_tables
                ORDER BY schema_name, table_name
            """
            return self.execute(sql_query, None, user_id=user_id).rows

        sql_query = """
            SELECT schema_name, table_name, owner_role, created_at
            FROM system.system_tables
            WHERE schema_name = %(schema)s
            ORDER BY schema_name, table_name
        """
        params = {"schema": schema}
        return self.execute(sql_query, params, user_id=user_id).rows

    def list_columns(self, schema: str, table: str, *, user_id: str | None = None) -> list[dict[str, Any]]:
        """Fetch column definitions for the specified schema-qualified table."""
        sql_query = """
            SELECT c.column_name,
                   c.data_type,
                   c.is_nullable,
                   c.default_expr,
                   c.ordinal_position
            FROM system.system_columns c
            JOIN system.system_tables t ON t.id = c.table_id
            WHERE t.schema_name = %(schema)s AND t.table_name = %(table)s
            ORDER BY c.ordinal_position
        """
        params = {"schema": schema, "table": table}
        return self.execute(sql_query, params, user_id=user_id).rows

    def list_constraints(self, schema: str, table: str, *, user_id: str | None = None) -> list[dict[str, Any]]:
        """Fetch constraint metadata (PK, FK, unique, check) for the table."""
        sql_query = """
            SELECT c.constraint_type, c.definition_json, c.created_at
            FROM system.system_constraints c
            JOIN system.system_tables t ON t.id = c.table_id
            WHERE t.schema_name = %(schema)s AND t.table_name = %(table)s
            ORDER BY c.constraint_type, c.created_at
        """
        params = {"schema": schema, "table": table}
        return self.execute(sql_query, params, user_id=user_id).rows

    def list_indexes(self, schema: str, table: str, *, user_id: str | None = None) -> list[dict[str, Any]]:
        """Fetch index information (definition, uniqueness, type) for the table."""
        sql_query = """
            SELECT i.index_name,
                   i.index_type,
                   i.columns,
                   i.uniqueness,
                   i.created_at
            FROM system.system_indexes i
            JOIN system.system_tables t ON t.id = i.table_id
            WHERE t.schema_name = %(schema)s AND t.table_name = %(table)s
            ORDER BY i.index_name
        """
        params = {"schema": schema, "table": table}
        return self.execute(sql_query, params, user_id=user_id).rows

    # Catalog management -----------------------------------------------------------

    def synchronize_catalog(self) -> None:
        """Force a metadata refresh. Called at startup and after DDL."""
        with self._pool.connection() as conn:
            self._refresh_catalog(conn)
            conn.commit()

    # Internal helpers -------------------------------------------------------------

    def _classify(self, statement: sqlparse.sql.Statement) -> QueryType:
        """Map the top-level SQL statement type to the internal query enum."""
        token = statement.get_type().upper()
        if token in {"SELECT"}:
            return QueryType.SELECT
        if token in {"INSERT", "UPDATE", "DELETE", "MERGE"}:
            return QueryType.DML
        if token in {"CREATE", "ALTER", "DROP", "TRUNCATE"}:
            return QueryType.DDL
        return QueryType.OTHER

    def _refresh_catalog(self, conn: psycopg.Connection) -> None:
        """Rebuild the system metadata tables inside a transaction.

        The logic queries PostgreSQL's catalogs to populate the system schema.
        This favors deterministic correctness over micro-optimizations since the
        total number of tables is small in the target environment.
        """

        excluded = {"pg_catalog", "pg_toast", "information_schema"}
        excluded_array = sorted(excluded)
        excluded_with_system = sorted(excluded | {"system"})

        with conn.cursor() as cur:
            cur.execute(
                """
                TRUNCATE system.system_columns,
                          system.system_constraints,
                          system.system_indexes,
                          system.system_tables
                RESTART IDENTITY CASCADE
                """
            )

            cur.execute(
                """
                SELECT schemaname, tablename, tableowner
                FROM pg_tables
                WHERE schemaname <> ALL(%(excluded)s)
                ORDER BY schemaname, tablename
                """,
                {"excluded": excluded_with_system},
            )
            tables = cur.fetchall()

            table_map: MutableMapping[tuple[str, str], int] = {}
            for schema_name, table_name, table_owner in tables:
                cur.execute(
                    """
                    INSERT INTO system.system_tables (schema_name, table_name, owner_role)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (schema_name, table_name, table_owner or "postgres"),
                )
                table_id = cur.fetchone()[0]
                table_map[(schema_name, table_name)] = table_id

            if not table_map:
                return

            cur.execute(
                """
                SELECT table_schema,
                       table_name,
                       column_name,
                       data_type,
                       is_nullable,
                       column_default,
                       ordinal_position
                FROM information_schema.columns
                WHERE table_schema <> ALL(%(excluded)s)
                  AND table_schema <> 'system'
                ORDER BY table_schema, table_name, ordinal_position
                """,
                {"excluded": excluded_array},
            )
            for schema_name, table_name, column_name, data_type, is_nullable, default_expr, ordinal_position in cur.fetchall():
                table_id = table_map.get((schema_name, table_name))
                if table_id is None:
                    continue
                cur.execute(
                    """
                    INSERT INTO system.system_columns (
                        table_id, column_name, data_type, is_nullable, default_expr, ordinal_position
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        table_id,
                        column_name,
                        data_type,
                        is_nullable.upper() == "YES",
                        default_expr,
                        ordinal_position,
                    ),
                )

            cur.execute(
                """
                SELECT n.nspname AS schema_name,
                       c.relname AS table_name,
                       con.conname AS constraint_name,
                       con.contype,
                       pg_get_constraintdef(con.oid, true) AS definition
                FROM pg_constraint con
                JOIN pg_class c ON c.oid = con.conrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname <> ALL(%(excluded)s)
                  AND n.nspname <> 'system'
                """,
                {"excluded": excluded_array},
            )
            for schema_name, table_name, constraint_name, contype, definition in cur.fetchall():
                table_id = table_map.get((schema_name, table_name))
                if table_id is None:
                    continue
                constraint_type = {
                    "p": "PRIMARY_KEY",
                    "u": "UNIQUE",
                    "f": "FOREIGN_KEY",
                    "c": "CHECK",
                }.get(contype, "CHECK")
                payload = Json({
                    "name": constraint_name,
                    "definition": definition,
                })
                cur.execute(
                    """
                    INSERT INTO system.system_constraints (table_id, constraint_type, definition_json)
                    VALUES (%s, %s, %s)
                    """,
                    (table_id, constraint_type, payload),
                )

            cur.execute(
                """
                SELECT schemaname,
                       tablename,
                       indexname,
                       indexdef
                FROM pg_indexes
                WHERE schemaname <> ALL(%(excluded)s)
                  AND schemaname <> 'system'
                """,
                {"excluded": excluded_array},
            )
            for schema_name, table_name, index_name, index_def in cur.fetchall():
                table_id = table_map.get((schema_name, table_name))
                if table_id is None:
                    continue
                index_type, columns, uniqueness = self._parse_index_definition(index_def)
                cur.execute(
                    """
                    INSERT INTO system.system_indexes (
                        table_id, index_name, index_type, columns, uniqueness
                    ) VALUES (%s, %s, %s, %s, %s)
                    """,
                    (table_id, index_name, index_type, Json({"columns": columns, "definition": index_def}), uniqueness),
                )

    def _parse_index_definition(self, index_def: str) -> tuple[str, list[str], bool]:
        """Derive index type, column list, and uniqueness flag from definition text."""
        definition = index_def.strip()
        uniqueness = definition.upper().startswith("CREATE UNIQUE INDEX")
        index_type = "btree"
        if " USING " in definition.upper():
            upper_def = definition.upper()
            start = upper_def.index(" USING ") + len(" USING ")
            remainder = definition[start:]
            index_type = remainder.split()[0].lower()
        columns: list[str] = []
        if "(" in definition and ")" in definition:
            segment = definition[definition.index("(") + 1 : definition.rindex(")")]
            columns = [part.strip().strip('"') for part in segment.split(",") if part.strip()]
        return index_type, columns, uniqueness

    def _record_audit(
        self,
        *,
        user_id: str | None,
        statement: str,
        parameters: Sequence[Any] | Mapping[str, Any] | None,
        query_type: QueryType,
        success: bool,
        duration_ms: float,
        rowcount: int,
        error: ExecutionError | None,
    ) -> None:
        """Persist audit trail entries capturing execution context and outcome."""
        payload = {
            "user_id": user_id or "anonymous",
            "operation": query_type.value,
            "object_ref": None,
            "executed_sql": statement,
            "params_json": json.dumps(parameters, default=str) if parameters is not None else None,
            "success": success,
            "error_code": error.sqlstate if error else None,
            "duration_ms": duration_ms,
            "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "rowcount": rowcount,
        }
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO system.system_audit_log (
                        user_id,
                        operation,
                        object_ref,
                        executed_sql,
                        params_json,
                        success,
                        error_code,
                        duration_ms
                    ) VALUES (%(user_id)s, %(operation)s, %(object_ref)s, %(executed_sql)s,
                              %(params_json)s::jsonb, %(success)s, %(error_code)s, %(duration_ms)s)
                    """,
                    payload,
                )
            conn.commit()


def ensure_identifier(value: str, *, label: str) -> str:
    """Validate identifier strings to avoid unsafe catalog lookups."""

    if not _VALID_IDENTIFIER.match(value):
        raise ExecutionError.from_validation(f"Invalid {label} name: {value!r}")
    return value
