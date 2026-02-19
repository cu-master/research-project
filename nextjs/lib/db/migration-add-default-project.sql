-- Migration: Add default project to users and remove schema_id from sessions
-- The per-session schema_id is replaced by a user-level default_project_id

-- Add default_project_id to users table
-- ON DELETE SET NULL ensures that if the project is deleted, the column is cleared (not cascaded to user)
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Drop schema_id from sessions table (no longer needed)
ALTER TABLE sessions DROP COLUMN IF EXISTS schema_id;
