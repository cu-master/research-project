# Running the full stack with Docker

`docker compose` brings up the entire deployment in one command: the Next.js web
app + LangChain agent, both MCP servers (Model Interpretation, Database Query),
the Ontop OBDA SPARQL endpoint, the application/metadata Postgres, and a sample
target database (dvdrental) the chatbot can query read-only.

## Services

| Service | Image / build | Exposed port | Role |
|---|---|---|---|
| `nextjs` | `./nextjs` | **3000** | Web UI + LangChain agent API |
| `model-interpretation` | `./mcp-servers` | (internal 3001) | RAG retriever MCP server |
| `database-query` | `./mcp-servers` | (internal 3002) | RAG generator MCP server |
| `ontop` | `ontop/ontop:5.3.1` | **8080** | SPARQL → SQL (OBDA) endpoint |
| `app-db` | `postgres:16-alpine` | (internal 5432) | Metadata: users, projects, sessions |
| `target-db` | `postgres:16-alpine` | (internal 5432) | Sample dvdrental DB (read-only role) |

Only `nextjs` (3000) and `ontop` (8080) are published to the host; everything
else talks over the internal `appnet` network.

## 1. Configure environment

```bash
cp .env.docker.example .env
```

Fill in `.env`:

- `MCP_API_TOKEN`, `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `API_KEY_ENCRYPTION_SECRET` — `openssl rand -base64 48`
- `LLM_PROVIDER` + the matching API key (e.g. `GOOGLE_API_KEY`)

`MCP_API_TOKEN` is shared by the Next.js app and both MCP servers — compose wires
the same value into all three automatically.

## 2. Supply the sample dataset (optional but recommended)

`data/dvd-rental/` ships only the mapping + schema, not the data. To preload the
sample target DB, drop a dump into that folder before the first start:

- `data/dvd-rental/dvdrental.tar` — the standard PostgreSQL `dvdrental` sample
  (restored with `pg_restore`), **or**
- `data/dvd-rental/*.sql` — any SQL dump (restored with `psql`).

If no dump is present the stack still boots; `target-db` just comes up empty (you
can load data later). The dump lives under `data/` which is gitignored.

## 3. Build and run

```bash
docker compose up --build
```

On first start: `app-db` and `target-db` initialize, the `nextjs` entrypoint runs
`prisma db push` to create the metadata schema, and `target-db` restores the dump
and creates the `chatbot_ro` read-only role. Open <http://localhost:3000>.

## 4. Point a project at the sample database

In the project-setup UI, configure the target DB connection as:

| Field | Value |
|---|---|
| Host | `target-db` |
| Port | `5432` |
| Database | `dvdrental` |
| User | `chatbot_ro` |
| Password | value of `TARGET_DB_RO_PASSWORD` in `.env` |
| SSL | off |

(To query a database on your **host** machine instead, use host
`host.docker.internal` — Ontop is configured to reach it.)

## How Ontop reloading works (no Docker socket)

When you query a project, the `database-query` server generates `mapping.ttl` and
`ontop.properties` and writes them to the shared `ontop-input` volume. Ontop runs
with `ONTOP_DEV_MODE=true`, so it watches those files and restarts its own SPARQL
endpoint when they change — no container restart and **no Docker socket** mounted
into any app container. The server simply writes the config and waits for the
endpoint to come back ready.

## Useful commands

```bash
docker compose ps                      # service health
docker compose logs -f database-query  # MCP server logs
docker compose down                    # stop (keep volumes/data)
docker compose down -v                 # stop and wipe all data
```

Health check: `GET http://localhost:3000/api/servers/status` reports MCP + Ontop
connectivity.
