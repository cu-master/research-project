# Connecting Native MCP Clients

This project exposes both Tier 3 servers as native [Model Context Protocol](https://modelcontextprotocol.io/) servers over stdio, in addition to the HTTP transport used by the Next.js orchestrator. Any MCP-compliant client (Claude Desktop, MCP-aware IDE plugins, custom clients built on `@modelcontextprotocol/sdk`) can connect without code changes — fulfilling NFR-11.

## Architecture

```
┌─────────────────────┐                ┌───────────────────────────┐
│   Next.js (Tier 2)  │ ── HTTP ─────▶ │  Express MCP servers      │
│   LangChain Agent   │  /tools etc.   │  (server.ts)              │
└─────────────────────┘                └───────────────────────────┘
                                                   ▲
                                                   │ shared tool registry
                                                   │ (tools/index.ts)
                                                   ▼
┌─────────────────────┐                ┌───────────────────────────┐
│  Claude Desktop /   │ ── stdio  ───▶ │  Stdio MCP entry points   │
│  IDE plugins        │  JSON-RPC 2.0  │  (mcp-stdio.ts)           │
└─────────────────────┘                └───────────────────────────┘
```

Both transports share the same handler implementations from `mcp-servers/src/{database-query,model-interpretation}/tools/`. The stdio entry points are thin SDK adapters — no business logic is duplicated.

## Running the stdio servers manually

From `mcp-servers/`:

```sh
# Model Interpretation server — no DB dependency
npm run start:mcp:model

# Database Query server — see env vars below
npm run start:mcp:db
```

The processes read JSON-RPC 2.0 messages from stdin and write responses to stdout; all diagnostics go to stderr.

## Claude Desktop integration

Add the following to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dataspecer-model-interpretation": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/cu-research-project/mcp-servers/src/model-interpretation/mcp-stdio.ts"],
      "env": {
        "GOOGLE_API_KEY": "your-gemini-key-here"
      }
    },
    "dataspecer-database-query": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/cu-research-project/mcp-servers/src/database-query/mcp-stdio.ts"],
      "env": {
        "GOOGLE_API_KEY": "your-gemini-key-here",
        "MCP_DB_HOST": "localhost",
        "MCP_DB_PORT": "5432",
        "MCP_DB_NAME": "dvdrental",
        "MCP_DB_USER": "postgres",
        "MCP_DB_PASSWORD": "postgres",
        "MCP_DB_SSL": "false"
      }
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/cu-research-project` with the actual checkout path. Restart Claude Desktop. The two servers appear in the MCP panel; the registered tools (e.g. `list-tables`, `get-table-schema`, `obda-query`, `summarize_content`, `explain_mapping`) become directly invocable from Claude.

If you prefer to run the compiled JS instead of `tsx`, build first (`npm run build` in `mcp-servers/`) and point `args` at the `dist/.../mcp-stdio.js` files.

## Database auto-registration (database-query server)

Setting `MCP_DB_HOST`, `MCP_DB_NAME`, and `MCP_DB_USER` in the stdio process environment triggers automatic registration of a default Postgres connection at startup, so `list-tables` and `get-table-schema` work out of the box. Without these variables the server still starts, but those two tools will return their normal "register a database first" error. The `obda-query` tool always works because it accepts a `dbConfig` parameter directly.

| Variable | Default | Description |
|---|---|---|
| `MCP_DB_HOST` | — | Postgres host (required to auto-register) |
| `MCP_DB_PORT` | `5432` | Postgres port |
| `MCP_DB_NAME` | — | Database name (required to auto-register) |
| `MCP_DB_USER` | — | Database user (required to auto-register) |
| `MCP_DB_PASSWORD` | `""` | Database password |
| `MCP_DB_SSL` | `false` | Set to `"true"` to require SSL |
| `MCP_DB_ID` | `default` | Internal id used by tools that accept a `databaseId` parameter |
| `MCP_DB_LABEL` | value of `MCP_DB_NAME` | Display label |

## Security note

The HTTP transport uses bearer auth + rate limiting (see `MCP_API_TOKEN`). The stdio transport relies on the standard MCP trust model: the client (Claude Desktop) spawns the server as a child process and owns its lifecycle, so authentication happens at the OS level. Do not expose the stdio entry points over a network socket.

## Verifying the integration

```sh
cd mcp-servers
npm test -- mcp-stdio
```

The smoke tests in `src/database-query/mcp-stdio.test.ts` and `src/model-interpretation/mcp-stdio.test.ts` use the SDK's `InMemoryTransport` to confirm:

1. The MCP handshake completes and the server reports the correct name/version.
2. `tools/list` returns the full registry.
3. `tools/call` dispatches via the shared handlers (unknown-tool path is verified end-to-end without requiring a live DB or LLM credentials).
