import "./config.js";
import { startServer } from "./server.js";

async function main() {
  console.log("Database Query MCP Server v2.0.0 - Dynamic Database Registration\n");
  console.log("Databases are registered dynamically via POST /databases.\n");

  try {
    startServer();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export * from "./types.js";
export * from "./config.js";
export * from "./manager.js";
export * from "./adapters/index.js";
export * from "./tools/index.js";
export { app, startServer } from "./server.js";

