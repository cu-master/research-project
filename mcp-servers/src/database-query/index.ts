import "./config.js";
import { startServer } from "./server.js";
import { log } from "../shared/logger.js";

async function main() {
  log.info("Database Query MCP Server v2.0.0 - Dynamic Database Registration\n");
  log.info("Databases are registered dynamically via POST /databases.\n");

  try {
    startServer();
  } catch (error) {
    log.error("Failed to start server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error("Fatal error:", error);
  process.exit(1);
});

