-- Migration: Add db_schema column to projects table
-- Stores the fetched database schema (tables, columns, constraints) as JSONB

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS db_schema JSONB DEFAULT NULL;

COMMENT ON COLUMN projects.db_schema IS 'Cached database schema retrieved via Get Schema (tables, columns, constraints)';
