-- Migration: Replace url_contents JSONB with content TEXT
-- Stores the merged plain text from all URLs, directly consumable by an LLM.
--
-- If url_contents has existing data, migrate the _merged key (or concatenated values) into the new column.

-- Step 1: Add the new TEXT column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '';

-- Step 2: Migrate existing data from url_contents -> content
-- Prefer the _merged key; fall back to concatenating all values.
UPDATE projects
SET content = COALESCE(
    url_contents->>'_merged',
    (
        SELECT string_agg(value::text, E'\n\n')
        FROM jsonb_each_text(url_contents)
    ),
    ''
)
WHERE url_contents IS NOT NULL
  AND url_contents != '{}'::jsonb;

-- Step 3: Drop the old JSONB column
ALTER TABLE projects DROP COLUMN IF EXISTS url_contents;
