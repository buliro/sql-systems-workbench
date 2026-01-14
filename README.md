# SQL Systems Workbench

Description: Backend reference implementation for a PostgreSQL-powered SQL dashboard.

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

2. **Build the container images**
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

6. **Start the frontend UI (optional)**
   ```bash
   docker compose -f Docker/docker-compose.yml up -d frontend
   ```

7. **Open the dashboard**
   Visit http://localhost:4173 to load the React UI. The container proxies
   `/api` calls to the API service.

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

## Frontend Dashboard (Phase 3)

The React + SASS dashboard lives under `React/` and consumes the REST API defined in
Phase 2. It provides schema exploration, SQL execution, result inspection, and
relationship visualization.

### Dependencies

- Node.js 20+
- `pnpm` (preferred package manager)

Install dependencies once:

```bash
cd React
pnpm install
```

### Running Locally

1. Start the backend API (see Quick Start above) so it is reachable at
   `http://localhost:8000`.
2. The Vite dev server proxies `/api` to the backend. Adjust `VITE_API_PROXY`
   if you expose the API elsewhere:
   ```bash
   cp .env.example .env.local   # customise if needed
   # ensure VITE_API_PROXY=http://localhost:8000
   ```
3. Run the dev server:
   ```bash
   pnpm dev
   ```
4. Open `http://localhost:5173` in a browser. The proxy and hot module reload
   work automatically.

### Running with Docker Compose

- Ensure the API and database containers are running (see Quick Start steps 3–5).
- Bring up the frontend container:
  ```bash
  docker compose -f Docker/docker-compose.yml up -d frontend
  ```
- Browse to `http://localhost:4173`. The nginx layer forwards `/api` requests to
  the API container, so no additional configuration is required.
- Stop the frontend with `docker compose -f Docker/docker-compose.yml stop frontend`.

### Using the Dashboard UI

1. Select a schema from the left sidebar to reveal its tables and row counts.
2. Choose a table to populate the **Table Details** panel (columns, constraints,
   indexes) and refresh the **Relationship Matrix**.
3. Use the **Query Console** to run SQL statements; results, execution metadata,
   and command tags appear inline below the editor.
4. API errors are surfaced via the top **Error Banner** so failed requests can be
   diagnosed without checking browser consoles.
5. Sample data: the base schema seeds a demo account (`demo@example.com`) that you
   can reference when exploring tables or crafting queries.

### Build & Type Check

- Type check: `pnpm exec tsc --noEmit`
- Production bundle: `pnpm build` (emits assets into `React/dist/`)

### Architecture Notes

- **State management**: `src/context/AppContext.tsx` tracks the selected schema
  and table plus SQL execution state (in-progress/result/error). Components
  dispatch actions such as `markExecutionStart`, `markExecutionSuccess`, and
  `markExecutionError` to keep UI feedback consistent.
- **Async data**: `@tanstack/react-query` powers hooks in `src/hooks/useMetadata.ts`
  to fetch tables, columns, constraints, and indexes with request-level caching
  and loading indicators.
- **API client**: `src/api/client.ts` provides a thin wrapper that normalises
  backend errors. Domain modules (`src/api/sql.ts`, `src/api/metadata.ts`) expose
  typed helpers used throughout the app.
- **Error handling**: Shared `ErrorBanner` surfaces backend error payloads
  without reinterpretation. The Query Console also validates local JSON
  parameters before dispatching requests.
- **Styling**: Global variables and mixins live in `src/styles/`. Components use
  dedicated `.scss` files, focusing on flexible grid layouts and accessible
  focus states.

### Manual Validation Flow

1. Start PostgreSQL and the Flask API as described earlier.
2. Launch the frontend (`pnpm dev`).
3. Load the dashboard:
   - Schemas/tables should populate in the sidebar.
   - Selecting a table updates the Table Details and Relationship Matrix panels.
4. Execute a sample query in the SQL Console (e.g. `SELECT * FROM demo.accounts LIMIT 5;`).
   - Observe result rows, metadata (row count, duration), and command tag.
   - Trigger a constraint violation to confirm the Error Banner displays the API
     error payload verbatim.
5. Resize the viewport to confirm responsive behaviour and keyboard navigation
   (skip link + focus outlines) remains usable.