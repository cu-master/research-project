import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "./config.js";
import { dbManager } from "./manager.js";
import { tools, toolMap } from "./tools/index.js";
import { bearerAuth, rateLimit } from "../shared/index.js";
import { log } from "../shared/logger.js";

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
    } catch (err) {
      log.warn(`[db] Failed to unregister stale connection '${id}' before re-registering:`, err);
    }
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
    log.info(`  ✓ Database registered and connected: ${name || id} (${id})`);
    res.json({ status: "connected", id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`  ✗ Failed to register database ${id}: ${message}`);
    res.status(500).json({ error: message });
  }
});

app.delete("/databases/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await dbManager.unregisterDatabase(id);
    log.info(`  ✓ Database unregistered: ${id}`);
    res.json({ status: "unregistered", id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(404).json({ error: message });
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error("Server error:", err);
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

    log.info(`Server running on http://localhost:${config.port}`);
    log.info(`AI Provider: ${config.provider}`);
    log.info(`LLM Model: ${activeModel}\n`);
    log.info(`Available endpoints:`);
    log.info(`  GET  /health - Health check`);
    log.info(`  GET  /tools - List all tools`);
    log.info(`  GET  /tools/:name - Get tool info`);
    log.info(`  POST /tools/:name/call - Call a tool`);
    log.info(`  POST /mcp/call-tool - MCP-compatible tool call`);
    log.info(`  POST /mcp/list-tools - MCP-compatible tool listing`);
    log.info(`  GET  /databases - List connected databases`);
    log.info(`  POST /databases - Register & connect a database`);
    log.info(`  DELETE /databases/:id - Unregister a database`);
    log.info(`\nAvailable tools:`);
    for (const tool of tools) {
      log.info(`  - ${tool.name}: ${tool.description.substring(0, 50)}...`);
    }
  });
}

