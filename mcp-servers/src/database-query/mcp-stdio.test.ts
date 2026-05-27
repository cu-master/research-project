// Smoke test for the database-query stdio entry point.
// Drives buildMcpServer() over InMemoryTransport so no Docker/Postgres/LLM is needed.

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tools } from "./tools/index.js";
import { buildMcpServer } from "./mcp-stdio.js";

async function connectInMemory() {
  const server = buildMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);

  return { client, server };
}

describe("database-query MCP stdio entry", () => {
  it("completes the MCP handshake and exposes server info", async () => {
    const { client } = await connectInMemory();
    const serverInfo = client.getServerVersion();
    expect(serverInfo).toBeDefined();
    expect(serverInfo?.name).toBe("dataspecer-database-query");
    await client.close();
  });

  it("tools/list returns the full Express-registry tool set", async () => {
    const { client } = await connectInMemory();
    const result = await client.listTools();
    expect(result.tools).toHaveLength(tools.length);

    const expectedNames = tools.map((t) => t.name).sort();
    const actualNames = result.tools.map((t) => t.name).sort();
    expect(actualNames).toEqual(expectedNames);

    for (const t of result.tools) {
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toMatchObject({ type: "object" });
    }
    await client.close();
  });

  it("tools/call dispatches via the shared registry (unknown tool path)", async () => {
    const { client } = await connectInMemory();
    const result = await client.callTool({
      name: "definitely-not-a-real-tool",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/not found/i);
    await client.close();
  });
});
