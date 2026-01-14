# SQL Systems Workbench

Backend reference implementation for a PostgreSQL-powered SQL dashboard. The
project is organized in phases; Phase 2 delivers the database schema, central
SQL execution engine, and Flask REST API.

## Technology Stack

- **Database:** PostgreSQL 15
- **Backend:** Python 3.11 + Flask, psycopg (no ORM)
- **Runtime:** Docker / Docker Compose

## Repository Layout

```
.
├── Docker/                  # Container definitions (API + Postgres)
├── docs/                    # Prompts and planning notes
├── ssw-flask/               # Flask application code
│   ├── app/                 # Application modules
│   ├── sql/                 # SQL schema files
│   └── requirements.txt     # Python dependencies
└── README.md
```

## Prerequisites

- Docker Engine ≥ 24
- Docker Compose plugin (`docker compose`)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/buliro/sql-systems-workbench.git
   cd sql-systems-workbench
   ```

2. **Build the API image**
   ```bash
   docker compose -f Docker/docker-compose.yml build
   ```

3. **Start PostgreSQL**
   ```bash
   docker compose -f Docker/docker-compose.yml up -d db
   ```

4. **Apply the base schema**
   ```bash
   docker compose -f Docker/docker-compose.yml run --rm api \
     python -m app.manage migrate
   ```

5. **Start the API service**
   ```bash
   docker compose -f Docker/docker-compose.yml up -d api
   ```

6. **Verify the service**
   ```bash
   docker compose -f Docker/docker-compose.yml exec -T api python - <<'PY'
    import json
    import urllib.request

    req = urllib.request.Request(
        'http://localhost:8000/api/sql',
        data=json.dumps({'statement': 'SELECT 1 AS result'}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req) as resp:
        print(resp.read().decode())
    PY
   ```

## Using the REST API

The API exposes SQL execution and metadata exploration endpoints. The container
uses port `8000` on the host.

### Execute Arbitrary SQL

All SQL statements funnel through `/api/sql`. Use positional (`%s`) or named
(`%(name)s`) placeholders; values are bound server side to prevent injection.

```bash
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "INSERT INTO demo.accounts (email, display_name) VALUES (%s, %s) RETURNING account_id",
        "parameters": ["alice@example.com", "Alice"]
      }'
```

### Create Schemas, Tables, and Relationships

```bash
# Create a custom schema
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{ "statement": "CREATE SCHEMA IF NOT EXISTS app" }'

# Create parent table
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "CREATE TABLE app.organizations (organization_id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)"
      }'

# Create child table with foreign key relationship
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "CREATE TABLE app.members (member_id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES app.organizations(organization_id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL)"
      }'
```

### Create Indexes and Constraints

```bash
# Add a partial index to speed up lookups by role
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "CREATE INDEX members_role_idx ON app.members (role)"
      }'

# Enforce a business rule with a check constraint
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "ALTER TABLE app.members ADD CONSTRAINT role_check CHECK (role IN ('\"owner\"','\"viewer\"','\"editor\"'))"
      }'
```

### Insert, Update, and Delete Rows

```bash
# Insert using named parameters
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "INSERT INTO app.organizations (name) VALUES (%(name)s) RETURNING organization_id",
        "parameters": {"name": "Acme"}
      }'

# Update rows
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "UPDATE app.members SET role = %s WHERE email = %s",
        "parameters": ["owner", "jane@example.com"]
      }'

# Delete with cascading relationship
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "DELETE FROM app.organizations WHERE organization_id = %s",
        "parameters": [42]
      }'
```

### Query with Joins and Aggregations

```bash
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": """
            SELECT o.name AS organization,
                   COUNT(m.member_id) AS member_count
            FROM app.organizations o
            LEFT JOIN app.members m USING (organization_id)
            GROUP BY o.organization_id
            ORDER BY member_count DESC
        """
      }'
```

### Inspect Table Metadata

List all tracked tables:

```bash
curl -s http://localhost:8000/api/metadata/tables | jq
```

List columns, constraints, and indexes for a specific table:

```bash
curl -s http://localhost:8000/api/metadata/tables/app/members/columns | jq
curl -s http://localhost:8000/api/metadata/tables/app/members/constraints | jq
curl -s http://localhost:8000/api/metadata/tables/app/members/indexes | jq
```

### Error Handling Example

Constraint violations surface as structured errors:

```bash
curl -s http://localhost:8000/api/sql \
  -H 'Content-Type: application/json' \
  -d '{
        "statement": "INSERT INTO app.organizations (name) VALUES (%s)",
        "parameters": ["Acme"]
      }' | jq
```

Returns (HTTP 409):

```json
{
  "status": "error",
  "error": {
    "code": "unique_violation",
    "message": "duplicate key value violates unique constraint ...",
    "sqlstate": "23505"
  }
}
```

### Transaction Notes

- Each request executes within its own transaction (autocommit disabled).
- DDL statements trigger a metadata refresh to keep catalog tables in sync.

## Stopping Services

```bash
docker compose -f Docker/docker-compose.yml down
```

Add `-v` to remove the PostgreSQL volume (`db-data`) if you want a clean slate.

## Development Tips

- Environment variables for the API are set in `docker-compose.yml`:
  - `DATABASE_DSN`
  - `DB_POOL_MIN_SIZE`
  - `DB_POOL_MAX_SIZE`
  - `DB_POOL_TIMEOUT`
- The management script (`python -m app.manage migrate`) accepts additional SQL
  files as arguments for ad-hoc migrations.