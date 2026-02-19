# C4 Model Architecture

This directory contains C4 model architecture definitions for the AI Chatbot System using Structurizr DSL.

## How to use local Structurizr

Just write this command in the root of `c4-model`:

```shell
> docker compose up
```

And after that you can go to http://localhost:8080 web page. Done :D

## Workspace File

### AI Chatbot System (`model/ai-chatbot-workspace.dsl`)

This workspace defines the architecture for the **AI Chatbot for DataSpecer and Database Query** system, which enables non-expert users to interpret structured data specifications and query real-world databases using natural language.

**Architecture Overview:**
- **Tier 1 (Presentation)**: Next.js Web Application - React-based chat interface
- **Tier 2 (Orchestration)**: LangChain Agent API - Routes queries and manages tool calls
- **Tier 3 (Backend Services)**: 
  - Model Interpretation MCP Server - Schema analysis and interpretation
  - Database Query MCP Server - SQL generation and execution

**External Systems:**
- LLM Providers (Google Gemini, Anthropic Claude, OpenAI GPT)
- Databases (PostgreSQL, Supabase)
- Weather API

## Documentation

For detailed architecture documentation, see:
- `../C4_ARCHITECTURE.md` - Comprehensive C4 model documentation for the AI Chatbot System

## Views Available

When you open Structurizr at http://localhost:8080, you'll see:

1. **System Context Diagram** - Shows the system and its relationships with users and external systems
2. **Container Diagram** - Shows the high-level technical building blocks (3-tier architecture)
3. **Component Diagrams** - Detailed components for each container:
   - Web Application Components
   - LangChain Agent Components
   - Model Interpretation Server Components
   - Database Query Server Components
4. **Deployment Diagram** - Production deployment architecture

## File Structure

```
c4-model/
├── docker-compose.yaml          # Docker Compose configuration
├── README.md                     # This file
└── model/
    ├── ai-chatbot-workspace.dsl  # AI Chatbot System architecture
    ├── workspace.json            # Generated workspace JSON
    └── docs/                     # Documentation files
        ├── ai-chatbot-context.md # AI Chatbot system context
        └── ai-chatbot-views.md   # AI Chatbot diagram views
```

## Notes

- The `model/` directory is mounted as a volume in the Docker container
- All `.dsl` files in the `model/` directory will be automatically loaded by Structurizr Lite
- Changes to `.dsl` files require restarting the Docker container to take effect
