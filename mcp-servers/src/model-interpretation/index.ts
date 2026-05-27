import { startServer } from "./server.js";

async function main() {
  console.log("Model Interpretation MCP Server v1.0.0\n");

  try {
    startServer();
  } catch (error) {
    console.error("Failed to start Model Interpretation MCP Server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

export * from "./types.js";
export * from "./config.js";
export * from "./utils.js";
export * from "./store.js";
export * from "./ai/index.js";
export * from "./tools/index.js";
export { app, startServer } from "./server.js";

