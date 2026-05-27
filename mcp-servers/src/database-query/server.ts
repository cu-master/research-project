import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "./config.js";
import { dbManager } from "./manager.js";
import { tools, toolMap } from "./tools/index.js";
import { bearerAuth, rateLimit } from "../shared/index.js";

export const app = express();

const corsOrigins = (process.env.MCP_CORS_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigins.length ? corsOrigins : false,
  credentials: false,
}));

app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({
  max: parseInt(process.env.MCP_RATE_LIMIT_MAX || "60", 10),
  windowMs: parseInt(process.env.MCP_RATE_LIMIT_WINDOW_MS || "60000", 10),
}));
app.use(bearerAuth());

app.get("/health", (_req: Request, res: Response) => {
  const databases = dbManager.listDatabases();
  res.json({
    status: "ok",
    server: "database-query",
    version: "2.0.0",
    provider: config.provider,
    databases: databases.length,
    connectedDatabases: databases.filter((d) => d.connected).length,
  });
});

app.get("/tools", (_req: Request, res: Response) => {
  const toolList = tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  res.json({ tools: toolList });
});

app.get("/tools/:name", (req: Request, res: Response) => {
  const tool = toolMap.get(req.params.name);
  if (!tool) {
    res.status(404).json({ error: `Tool "${req.params.name}" not found` });
    return;
  }
  res.json({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  });
});

app.post("/tools/:name/call", async (req: Request, res: Response) => {
  const tool = toolMap.get(req.params.name);
  if (!tool) {
    res.status(404).json({ error: `Tool "${req.params.name}" not found` });
    return;
  }

  try {
    const args = req.body.arguments || req.body || {};
    const result = await tool.handler(args);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    });
  }
});

app.post("/mcp/call-tool", async (req: Request, res: Response) => {
  const { name, arguments: args } = req.body;

  if (!name) {
    res.status(400).json({ error: "Tool name is required" });
    return;
  }

  const tool = toolMap.get(name);
  if (!tool) {
    res.status(404).json({ error: `Tool "${name}" not found` });
    return;
  }

  try {
    const result = await tool.handler(args || {});
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    });
  }
});

app.post("/mcp/list-tools", (_req: Request, res: Response) => {
  const toolList = tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  res.json({ tools: toolList });
});

app.get("/databases", (_req: Request, res: Response) => {
  res.json({ databases: dbManager.listDatabases() });
});

app.post("/databases", async (req: Request, res: Response) => {
  const { id, name, type, host, port, database, user, password, ssl } = req.body;

  if (!id || !type) {
    res.status(400).json({ error: "'id' and 'type' are required" });
    return;
  }

  if (dbManager.hasDatabase(id)) {
    const existing = dbManager.getConnection(id);
    if (existing.adapter.isConnected()) {
      dbManager.setDefaultConnection(id);
      res.json({ status: "already_connected", id });
      return;
    }
    // Registered but not connected — unregister and re-register.
    try {
      await dbManager.unregisterDatabase(id);
    } catch {}
  }

  try {
    if (type === "postgresql") {
      if (!host || !database || !user) {
        res.status(400).json({ error: "'host', 'database', and 'user' are required for postgresql" });
        return;
      }
      dbManager.registerDatabase(id, name || id, {
        type: "postgresql",
        host,
        port: port || 5432,
        database,
        user,
        password: password || "",
        ssl: ssl ?? false,
      });
    } else {
      res.status(400).json({ error: `Unknown database type: ${type}` });
      return;
    }

    await dbManager.connectDatabase(id);
    dbManager.setDefaultConnection(id);
    console.log(`  ✓ Database registered and connected: ${name || id} (${id})`);
    res.json({ status: "connected", id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ Failed to register database ${id}: ${message}`);
    res.status(500).json({ error: message });
  }
});

app.delete("/databases/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await dbManager.unregisterDatabase(id);
    console.log(`  ✓ Database unregistered: ${id}`);
    res.json({ status: "unregistered", id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(404).json({ error: message });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export function startServer(): void {
  app.listen(config.port, () => {
    const activeModel =
      config.provider === "anthropic"
        ? config.anthropicModel
        : config.provider === "groq"
          ? config.groqModel
          : config.provider === "openai"
            ? config.openaiModel
            : config.googleModel;

    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`AI Provider: ${config.provider}`);
    console.log(`LLM Model: ${activeModel}\n`);
    console.log(`Available endpoints:`);
    console.log(`  GET  /health - Health check`);
    console.log(`  GET  /tools - List all tools`);
    console.log(`  GET  /tools/:name - Get tool info`);
    console.log(`  POST /tools/:name/call - Call a tool`);
    console.log(`  POST /mcp/call-tool - MCP-compatible tool call`);
    console.log(`  POST /mcp/list-tools - MCP-compatible tool listing`);
    console.log(`  GET  /databases - List connected databases`);
    console.log(`  POST /databases - Register & connect a database`);
    console.log(`  DELETE /databases/:id - Unregister a database`);
    console.log(`\nAvailable tools:`);
    for (const tool of tools) {
      console.log(`  - ${tool.name}: ${tool.description.substring(0, 50)}...`);
    }
  });
}

