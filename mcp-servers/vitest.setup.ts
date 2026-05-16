// Force MCP_API_TOKEN to empty so the Express apps are imported in
// "auth disabled" mode. We set it to "" rather than `delete`-ing, because
// shared/config.ts calls dotenv.config() at module-load and would otherwise
// repopulate the value from .env. Dedicated auth tests build their own
// middleware after toggling the env explicitly.
process.env.MCP_API_TOKEN = "";
