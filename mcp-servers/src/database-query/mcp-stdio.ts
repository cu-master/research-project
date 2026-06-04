// Native MCP stdio entry point — mirrors the HTTP server's tool registry over JSON-RPC.
// If MCP_DB_HOST + MCP_DB_NAME + MCP_DB_USER are set, a default Postgres connection is auto-registered.

import "./config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { dbManager } from "./manager.js";
import { tools, toolMap } from "./tools/index.js";
import { log } from "../shared/logger.js";

const SERVER_NAME = "dataspecer-database-query";
const SERVER_VERSION = "2.0.0";

// Exported (not auto-started) so tests can drive it via InMemoryTransport.
export function buildMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object"; [k: string]: unknown },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);
    if (!tool) {
      return {
        content: [{ type: "text" as const, text: `Tool "${name}" not found` }],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(args ?? {});
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// Failures are non-fatal — obda-query carries its own dbConfig and other tools
// will surface the missing-connection error at call time.
async function maybeAutoRegisterDatabase(): Promise<void> {
  const host = process.env.MCP_DB_HOST;
  const database = process.env.MCP_DB_NAME;
  const user = process.env.MCP_DB_USER;
  if (!host || !database || !user) return;

  try {
    dbManager.registerDatabase(
      process.env.MCP_DB_ID || "default",
      process.env.MCP_DB_LABEL || database,
      {
        type: "postgresql",
        host,
        port: parseInt(process.env.MCP_DB_PORT || "5432", 10),
        database,
        user,
        password: process.env.MCP_DB_PASSWORD || "",
        ssl: process.env.MCP_DB_SSL === "true",
      }
    );
    await dbManager.connectDatabase(process.env.MCP_DB_ID || "default");
    log.info(`[mcp-stdio] Auto-registered database "${database}" on ${host}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`[mcp-stdio] Auto-register failed (non-fatal): ${message}`);
  }
}

async function main(): Promise<void> {
  // stdio carries JSON-RPC — redirect stray console.log so it doesn't corrupt the stream.
  console.log = (...args: unknown[]) => console.error("[stdout-redirect]", ...args);

  await maybeAutoRegisterDatabase();

  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`[mcp-stdio] ${SERVER_NAME} v${SERVER_VERSION} ready on stdio`);
}

// Only run main() when invoked directly (not when imported by the test).
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("mcp-stdio.ts") ||
  process.argv[1]?.endsWith("mcp-stdio.js");

if (isDirectInvocation) {
  main().catch((error) => {
    log.error("[mcp-stdio] Fatal error:", error);
    process.exit(1);
  });
}
