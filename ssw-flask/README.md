# SQL Systems Workbench — Backend

This module contains the backend implementation for Phase 2. The code aligns
with the architecture defined in Phase 1, focusing on the database schema, SQL
execution engine, and REST API.

## Structure

```
ssw-flask/
├── app/
│   ├── __init__.py          # Flask application factory
│   ├── api/
│   │   └── routes.py        # REST endpoints
│   ├── config.py            # Configuration loading
│   ├── execution.py         # Central SQL execution module
│   └── pool.py              # Connection pool creation
├── sql/
│   └── 001_base_schema.sql  # DDL for system and demo schemas
└── README.md
```

## Transaction Handling

- Each API request acquires a connection from the pool and starts a transaction.
- Statements execute within the transaction; success results in `COMMIT`,
  failures trigger `ROLLBACK`.
- DDL statements force a catalog refresh to keep metadata tables in sync.
- Audit log entries are appended in their own short transaction so recording
  failures do not affect user transactions.

## Error Mapping

- PostgreSQL errors are captured and normalized to `ExecutionError` objects.
- SQLSTATE codes map to stable API error codes (`unique_violation`,
  `foreign_key_violation`, etc.).
- Validation issues (bad identifiers, malformed requests) return HTTP 400.
- Unexpected errors surface as HTTP 500 with sanitized responses.
