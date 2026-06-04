// Native MCP stdio entry point — mirrors the HTTP server's tool registry over JSON-RPC.

import "./config.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, toolMap } from "./tools/index.js";
import { log } from "../shared/logger.js";

const SERVER_NAME = "dataspecer-model-interpretation";
const SERVER_VERSION = "2.1.0";

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

async function main(): Promise<void> {
  // stdio carries JSON-RPC — redirect stray console.log so it doesn't corrupt the stream.
  console.log = (...args: unknown[]) => console.error("[stdout-redirect]", ...args);

  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`[mcp-stdio] ${SERVER_NAME} v${SERVER_VERSION} ready on stdio`);
}

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
