-- Migration: Add project_id to sessions table
-- Links each chat session to a specific project for per-session project context

-- Add project_id column to sessions
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Index for performance when querying sessions by project
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
