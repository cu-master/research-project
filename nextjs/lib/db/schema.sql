-- Session Management Schema
-- This schema stores chat sessions and messages in PostgreSQL

-- Schemas table - stores uploaded DataSpecer schemas
CREATE TABLE IF NOT EXISTS schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    content TEXT NOT NULL,
    format TEXT, -- JSON, XML, XSD, etc.
    url TEXT, -- Source URL for the schema
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- Additional metadata about the schema
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE,
    is_archived BOOLEAN DEFAULT FALSE,
    message_count INTEGER DEFAULT 0
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    attachments JSONB,
    tools_used JSONB,
    latency NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_role CHECK (role IN ('user', 'assistant'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_archived_at ON sessions(archived_at) WHERE is_archived = TRUE;
CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_schemas_created_at ON schemas(created_at);

-- Function to update session updated_at timestamp and unarchive if archived
CREATE OR REPLACE FUNCTION update_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE sessions
    SET updated_at = CURRENT_TIMESTAMP,
        message_count = (
            SELECT COUNT(*) FROM messages WHERE session_id = NEW.session_id
        ),
        is_archived = FALSE,
        archived_at = NULL
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session timestamp when messages are added
CREATE TRIGGER trigger_update_session_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_session_updated_at();

-- Function to auto-generate session title from first user message
CREATE OR REPLACE FUNCTION generate_session_title()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'user' AND NEW.content IS NOT NULL AND NEW.content != '' THEN
        UPDATE sessions
        SET title = CASE
            WHEN LENGTH(NEW.content) > 50 THEN LEFT(NEW.content, 50) || '...'
            ELSE NEW.content
        END
        WHERE id = NEW.session_id
        AND (title IS NULL OR title = '');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate title
CREATE TRIGGER trigger_generate_session_title
    AFTER INSERT ON messages
    FOR EACH ROW
    WHEN (NEW.role = 'user')
    EXECUTE FUNCTION generate_session_title();

