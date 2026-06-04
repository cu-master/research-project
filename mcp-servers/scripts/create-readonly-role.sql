-- Creates a SELECT-only login role (chatbot_ro) so writes are impossible
-- at the database-user level, whatever SQL the LLM generates. The app also forces
-- read-only per connection (defense-in-depth); this role is the primary guarantee.
-- Run once per target DB as an admin; substitute <target_db> and change the password:
--   psql -U postgres -d <target_db> -f create-readonly-role.sql

CREATE ROLE chatbot_ro LOGIN PASSWORD 'CHANGE_ME';

GRANT CONNECT ON DATABASE "<target_db>" TO chatbot_ro;
GRANT USAGE ON SCHEMA public TO chatbot_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chatbot_ro;

-- Keep future tables readable too (never writable).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chatbot_ro;

-- Make read-only sticky for every session this role opens.
ALTER ROLE chatbot_ro SET default_transaction_read_only = on;
