# AI Chatbot System - Views

## Available Diagrams

The AI Chatbot System workspace includes the following C4 model diagrams:

### 1. System Context Diagram
Shows the AI Chatbot System and its relationships with:
- Users (non-expert data analysts and developers)
- External systems (LLM Providers, Databases, Weather API)

### 2. Container Diagram
Illustrates the 3-tier architecture:
- **Tier 1**: Next.js Web Application
- **Tier 2**: LangChain Agent API
- **Tier 3**: Model Interpretation MCP Server and Database Query MCP Server

### 3. Component Diagrams

#### Web Application Components
- Chat Surface
- Message Bubble
- Chat Input
- Loading Indicator
- App Layout
- Sidebar

#### LangChain Agent Components
- Agent Core
- Tool Registry
- Intent Router
- Conversation Manager
- Client Wrappers
- Utilities

#### Model Interpretation Server Components
- Express Server
- Tool Handlers
- Data Store
- AI Provider
- URL Fetcher
- Schema Parser

#### Database Query Server Components
- Express Server
- Tool Handlers
- Database Manager
- SQL Generator
- Query Validator
- Schema Explorer
- Database Adapters

### 4. Deployment Diagram
Shows the production deployment architecture with:
- User's Browser
- Application Server (Next.js)
- Backend Servers (Express.js)
- Database Server

## Viewing the Diagrams

1. Start Structurizr: `docker compose up`
2. Open http://localhost:8080
3. Select "AI Chatbot System" workspace
4. Navigate through the different diagram views

