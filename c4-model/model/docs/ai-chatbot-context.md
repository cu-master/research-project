# AI Chatbot System - Context

## Overview

The AI Chatbot System enables non-expert users to interpret structured data specifications and query real-world databases using natural language. The system is built using a 3-tier architecture that separates presentation, orchestration, and backend services.

## Key Features

- **Schema Interpretation**: Upload and analyze data schemas (JSON, XML, XSD, etc.)
- **Database Querying**: Natural language to SQL translation with safe execution
- **Web Content Analysis**: Summarize and answer questions about web pages
- **Conversational Interface**: Chat-based interaction with context awareness

## Architecture Tiers

### Tier 1: Presentation
- Next.js Web Application with React components
- Real-time chat interface
- File attachment support

### Tier 2: Orchestration
- LangChain Agent for query routing
- Tool orchestration and management
- Conversation state management

### Tier 3: Backend Services
- Model Interpretation MCP Server (Port 3001)
- Database Query MCP Server (Port 3002)

## External Dependencies

- **LLM Providers**: Google Gemini, Anthropic Claude, OpenAI GPT
- **Databases**: PostgreSQL
- **Weather API**: External weather service

## Technology Stack

- **Frontend**: Next.js 14+, React, TypeScript, Tailwind CSS
- **Orchestration**: LangChain.js
- **Backend**: Node.js, Express.js, TypeScript
- **Protocol**: Model Context Protocol (MCP)

For detailed architecture documentation, see `../../C4_ARCHITECTURE.md`.

