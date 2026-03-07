# Session Management Implementation (FR-07)

This document describes the implementation of the "Start New Chat Session" feature.

## Overview

The session management system allows users to:
- Start new chat sessions
- Archive previous conversations
- Switch between sessions
- Prevent context pollution between sessions
- Detect and warn about unsaved work

## Database Schema

The system uses PostgreSQL to store sessions and messages:

### Sessions Table
- `id` (UUID): Primary key
- `title` (TEXT): Auto-generated from first user message
- `created_at` (TIMESTAMP): Session creation time
- `updated_at` (TIMESTAMP): Last message time
- `archived_at` (TIMESTAMP): When session was archived
- `is_archived` (BOOLEAN): Archive status
- `message_count` (INTEGER): Number of messages in session

### Messages Table
- `id` (UUID): Primary key
- `session_id` (UUID): Foreign key to sessions
- `role` (VARCHAR): 'user' or 'assistant'
- `content` (TEXT): Message content
- `attachments` (JSONB): File attachments
- `tools_used` (JSONB): Tool calls made
- `latency` (NUMERIC): Response time in seconds
- `created_at` (TIMESTAMP): Message creation time

## API Endpoints

### POST /api/sessions/new
Creates a new chat session.

**Response:**
```json
{
  "sessionId": "uuid",
  "success": true
}
```

### POST /api/sessions/archive
Archives an existing session.

**Request:**
```json
{
  "sessionId": "uuid"
}
```

**Response:**
```json
{
  "success": true
}
```

### GET /api/sessions
Fetches sessions or messages.

**Query Parameters:**
- `type`: 'active' or 'archived' (default: 'active')
- `sessionId`: If provided, returns messages for that session

**Response (list):**
```json
{
  "sessions": [...]
}
```

**Response (messages):**
```json
{
  "session": {...},
  "messages": [...]
}
```

### POST /api/sessions/clear-store
Clears the model interpretation store (URL content and schemas).

**Response:**
```json
{
  "success": true
}
```

## Frontend Components

### SessionContext
Provides session management state and functions:
- `currentSessionId`: Currently active session
- `sessions`: List of active sessions
- `hasUnsavedWork`: Whether there's unsaved work
- `refreshSessions()`: Refresh session list
- `setCurrentSessionId()`: Switch sessions
- `setHasUnsavedWork()`: Update unsaved work flag

### Sidebar
- Displays archived sessions
- "New Chat" button that:
  - Checks for unsaved work
  - Archives current session
  - Clears model interpretation store
  - Creates new session

### ChatSurface
- Automatically creates session on mount
- Loads messages from database when session changes
- Saves messages to database with session_id
- Tracks unsaved work state
- Shows welcome message for new sessions

## Workflow

### Normal Flow
1. User clicks "+" (New Chat) button
2. System checks for unsaved work (if yes, shows confirmation)
3. Current session is archived
4. Model interpretation store is cleared
5. New session is created
6. Chat interface is cleared
7. Welcome message is displayed

### Alternative Flow (Unsaved Work)
1. User clicks "+" (New Chat) button
2. System detects unsaved work
3. Confirmation dialog: "You have an active query. Are you sure you want to start over?"
4. If confirmed, proceed with normal flow
5. If cancelled, return to current session

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   cd nextjs
   npm install
   ```

2. **Set up PostgreSQL Database:**
   - Create a database (e.g., `chatbot_db`)
   - Set `DATABASE_URL` environment variable:
     ```
     DATABASE_URL=postgresql://user:password@localhost:5432/chatbot_db
     ```

3. **Initialize Database Schema:**
   The schema will be automatically initialized on first use, or you can run it manually:
   ```bash
   psql -d chatbot_db -f nextjs/lib/db/schema.sql
   ```

4. **Start the Application:**
   ```bash
   cd nextjs
   npm run dev
   ```

## Environment Variables

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `LLM_PROVIDER`: AI provider ('google', 'anthropic', 'openai', or 'groq')
- Provider-specific API keys (GOOGLE_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY)
- `MODEL_INTERPRETATION_URL`: URL of model interpretation MCP server (default: http://localhost:3001)
- `DATABASE_QUERY_URL`: URL of database query MCP server (default: http://localhost:3002)

## Notes

- Sessions are automatically archived when a new session is created
- Session titles are auto-generated from the first user message (truncated to 50 characters)
- The model interpretation store (URL content) is cleared when starting a new session to prevent context pollution
- Messages are saved to the database asynchronously and won't block the chat response
- Unsaved work detection is based on whether a message is currently being processed

