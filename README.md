# AI Chatbot for DataSpecer and Database Query

An AI chatbot that answers natural-language questions about your relational
databases using **Ontology-Based Data Access (OBDA)**. Instead of querying SQL
directly, the agent reasons over your domain ontology and R2RML mappings: it
generates SPARQL from a question, Ontop translates it to SQL, runs it read-only,
and the agent returns results in your domain's terms.

It also explains your data model — summarizing project content, explaining
R2RML mappings, finding gaps between ontology/schema/mapping, and suggesting
meaningful questions to ask.

## Architecture

A Next.js web app hosts a LangChain agent that orchestrates two MCP servers and
an Ontop SPARQL endpoint.

| Component | What it does |
|---|---|
| **Next.js app** (`nextjs/`) | Web UI, auth, project setup, and the LangChain agent API |
| **Model Interpretation MCP** (`mcp-servers/`) | RAG over project content — answers questions, summarizes, explains mappings |
| **Database Query MCP** (`mcp-servers/`) | Generates SPARQL/Ontop config, runs OBDA queries, browses schema |
| **Ontop** | OBDA engine: SPARQL → SQL translation via R2RML mappings |
| **app-db** (Postgres) | Application metadata: users, projects, sessions, messages |
| **target-db** (Postgres) | The database being queried (queried via a read-only role) |

The agent supports multiple LLM providers — **Google Gemini, Anthropic, OpenAI,
and Groq** — selectable per deployment, with per-user API keys encrypted at rest.

## Quick start (Docker)

`docker compose` brings up the entire stack in one command: the web app + agent,
both MCP servers, the Ontop SPARQL endpoint, the metadata Postgres, and a sample
target database (`dvdrental`) the chatbot can query read-only.

Only `nextjs` (**3000**) and `ontop` (**8080**) are published to the host;
everything else talks over the internal `appnet` network.

### 1. Configure environment

```bash
cp .env.docker.example .env
```

Fill in `.env`:

- `MCP_API_TOKEN`, `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `API_KEY_ENCRYPTION_SECRET` — `openssl rand -base64 48`
- `LLM_PROVIDER` + the matching API key (e.g. `GOOGLE_API_KEY`)

`MCP_API_TOKEN` is the shared bearer token between the Next.js app and both MCP
servers — compose wires the same value into all three automatically.

### 2. Sample dataset

The repo bundles the standard PostgreSQL `dvdrental` sample at
`data/dvd-rental/dvdrental.tar`, so the sample target DB is preloaded
automatically on first start (restored with `pg_restore`).

To use your own data instead, replace that file, or drop a `data/dvd-rental/*.sql`
dump alongside it (restored with `psql`). If no dump is present the stack still
boots and `target-db` just comes up empty (you can load data later).

### 3. Build and run

```bash
docker compose up --build
```

On first start: `app-db` and `target-db` initialize, the `nextjs` entrypoint
runs `prisma db push` to create the metadata schema, and `target-db` restores
the dump and creates the `chatbot_ro` read-only role. Open
<http://localhost:3000>.

### 4. Point a project at the sample database

In the project-setup UI, configure the target DB connection as:

| Field | Value |
|---|---|
| Host | `target-db` |
| Port | `5432` |
| Database | `dvdrental` |
| User | `chatbot_ro` |
| Password | value of `TARGET_DB_RO_PASSWORD` in `.env` |
| SSL | off |

To query a database on your **host** machine instead, use host
`host.docker.internal` — Ontop is configured to reach it.

## How Ontop reloading works (no Docker socket)

When you query a project, the `database-query` server generates `mapping.ttl`
and `ontop.properties` and writes them to the shared `ontop-input` volume. Ontop
runs with `ONTOP_DEV_MODE=true`, so it watches those files and restarts its own
SPARQL endpoint when they change — no container restart and **no Docker socket**
mounted into any app container. The server simply writes the config and waits
for the endpoint to come back ready.

## Useful commands

```bash
docker compose ps                      # service health
docker compose logs -f database-query  # MCP server logs
docker compose down                    # stop (keep volumes/data)
docker compose down -v                 # stop and wipe all data
```

Health check: `GET http://localhost:3000/api/servers/status` reports MCP + Ontop
connectivity.

## Local development

Each workspace runs independently outside Docker:

```bash
# Web app + agent
cd nextjs && npm install && npm run dev

# MCP servers (model-interpretation + database-query)
cd mcp-servers && npm install && npm run start:all
```

Both workspaces use [Vitest](https://vitest.dev): `npm test` for unit tests,
`npm run test:integration` for integration tests (Testcontainers-backed), and
`npm run test:all` for both.

## Benchmarking

The `nextjs` workspace ships an AI-accuracy benchmark that exercises the agent
end-to-end against the running app, scoring response correctness, tool
selection, consistency, and safety/refusal behavior. Cases live in
`nextjs/benchmarks/` (`dvd-rental-test-cases.json`, `config.json`); every metric
is defined in [`nextjs/benchmarks/METRICS.md`](nextjs/benchmarks/METRICS.md).

It calls the real `/api/chat` endpoint, so the app must be running and you must
provide an authenticated session cookie:

```bash
cd nextjs

# App must be reachable (default http://localhost:3000) and a project configured.
export BENCHMARK_AUTH_COOKIE="<session cookie from a logged-in browser>"

npm run benchmark:ai-accuracy            # run the suite, write a report
npm run benchmark:ai-accuracy:report     # same, but --strict: exit 1 on FAIL
npm run benchmark:verify-ground-truth    # check expected results against the DB
```

Useful flags: `--case-id <id>` (run one case), `--concurrency <n>`,
`--base-url <url>`, `--cookie <value>`. Reports are written to
`nextjs/benchmarks/results/` (gitignored).

The run is **PASS** only when all four thresholded metrics clear at once:
Response Success ≥ 85%, Result Accuracy ≥ 80%, Consistency ≥ 75%, and Refusal
Rate ≥ 90%. Thresholds live in `config.json`.
