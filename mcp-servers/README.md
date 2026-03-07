# MCP Servers

A collection of Model Context Protocol (MCP) servers for AI-powered data interpretation and database querying.

## Servers

### 1. Model Interpretation Server

Analyzes and interprets data schemas, models, and specifications using AI.

**Features:**
- Upload and analyze schemas (JSON, XML, XSD, GraphQL, Prisma, SQL, etc.)
- Ask questions about uploaded schemas
- Explain fields, entities, and relationships
- Generate example data conforming to schemas
- Summarize web pages and answer questions about URL content

**Port:** 3001 (configurable via `MODEL_INTERPRETATION_SERVER_PORT`)

### 2. Database Query Server

Connects to databases and provides AI-powered SQL generation and execution.

**Features:**
- Multi-database support (PostgreSQL, Supabase)
- Natural language to SQL translation
- Schema exploration (tables, columns, constraints)
- Safe query execution with dangerous operation blocking
- Sample query generation

**Port:** 3002 (configurable via `DB_MCP_SERVER_PORT`)

## Project Structure

```
mcp-servers/
├── src/
│   ├── shared/                    # Shared code across servers
│   │   ├── ai/                    # AI provider abstraction
│   │   │   ├── index.ts
│   │   │   └── providers.ts
│   │   ├── config.ts              # Config helpers
│   │   ├── types.ts               # Common types
│   │   ├── utils.ts               # Shared utilities
│   │   └── index.ts               # Barrel exports
│   ├── database-query/            # Database Query Server
│   │   ├── adapters/              # Database adapters
│   │   │   ├── interface.ts       # Adapter interface
│   │   │   ├── postgresql.ts
│   │   │   └── supabase.ts
│   │   ├── ai/                    # Server-specific AI config
│   │   ├── tools/                 # MCP tools
│   │   │   ├── handlers.ts
│   │   │   ├── schemas.ts
│   │   │   └── index.ts
│   │   ├── config.ts
│   │   ├── manager.ts             # Database connection manager
│   │   ├── server.ts              # Express server
│   │   ├── types.ts
│   │   ├── utils.ts
│   │   └── index.ts               # Entry point
│   └── model-interpretation/      # Model Interpretation Server
│       ├── ai/                    # Server-specific AI config
│       ├── url/                   # URL fetching utilities
│       ├── tools/                 # MCP tools
│       │   ├── handlers.ts
│       │   ├── schemas.ts
│       │   └── index.ts
│       ├── config.ts
│       ├── store.ts               # In-memory data store
│       ├── server.ts              # Express server
│       ├── types.ts
│       ├── utils.ts
│       └── index.ts               # Entry point
├── .env.example                   # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd mcp-servers
npm install
```

### Configuration

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and configure:
   - LLM provider (Google, Anthropic, or Groq)
   - API keys
   - Database connections (optional)

### Running the Servers

**Model Interpretation Server:**
```bash
npm run start        # Production
npm run dev          # Development with hot reload
```

**Database Query Server:**
```bash
npm run start:db     # Production
npm run dev:db       # Development with hot reload
```

**Both servers:**
```bash
npm run start:all    # Run both servers concurrently
```

## API Endpoints

Both servers expose the following endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/tools` | GET | List available tools |
| `/tools/:name` | GET | Get tool info |
| `/tools/:name/call` | POST | Call a tool |
| `/mcp/list-tools` | POST | MCP-compatible tool listing |
| `/mcp/call-tool` | POST | MCP-compatible tool call |

### Model Interpretation Tools

- `upload-files` - Upload schema content for analysis
- `get-files-overview` - Get brief schema overview
- `ask-question` - Ask questions about the schema
- `explain-fields` - Explain schema fields
- `explain-entity` - Explain entities/tables
- `explain-relationships` - Explain entity relationships
- `generate-examples` - Generate example data
### Database Query Tools

- `generate-sql` - Generate SQL from natural language
- `list-tables` - List database tables
- `get-table-schema` - Get table schema details
- `execute-query` - Execute SQL query
- `get-sample-queries` - Generate sample queries

## LLM Providers

### Google (Gemini)

Set in `.env`:
```env
LLM_PROVIDER=google
GOOGLE_API_KEY=your_api_key
GOOGLE_MODEL=gemini-1.5-flash
```

### Anthropic (Claude)

Set in `.env`:
```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

### Groq

Set in `.env`:
```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

## Database Support

### PostgreSQL

```env
DB_1_TYPE=postgresql
DB_1_ID=mydb
DB_1_NAME=My Database
DB_1_HOST=localhost
DB_1_PORT=5432
DB_1_DATABASE=myapp
DB_1_USER=postgres
DB_1_PASSWORD=password
DB_1_SSL=false
```

### Supabase

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
```

## Development

### Build

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

## License

ISC

