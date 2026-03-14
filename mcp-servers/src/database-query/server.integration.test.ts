import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { app } from "./server.js";
import { dbManager } from "./manager.js";

// ── Container lifecycle ───────────────────────────────────────────────────────

let container: StartedPostgreSqlContainer;
let DB_ID: string;

beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    // Seed the container with a minimal test table
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`
    CREATE TABLE IF NOT EXISTS test_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );
    INSERT INTO test_items (name) VALUES ('alpha'), ('beta'), ('gamma');
  `);
    await pool.end();

    DB_ID = "integration-test-db";

    // Register the container as a database on the MCP server
    await request(app)
        .post("/databases")
        .send({
            id: DB_ID,
            name: "Integration Test DB",
            type: "postgresql",
            host: container.getHost(),
            port: container.getMappedPort(5432),
            database: container.getDatabase(),
            user: container.getUsername(),
            password: container.getPassword(),
            ssl: false,
        });
}, 60_000);

afterAll(async () => {
    try {
        await dbManager.unregisterDatabase(DB_ID);
    } catch {
        /* ignore */
    }
    await container.stop();
});

// ── GET /health ───────────────────────────────────────────────────────────────

describe("GET /health", () => {
    it("returns status ok and correct shape", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ok");
        expect(res.body.server).toBe("database-query");
        expect(typeof res.body.databases).toBe("number");
    });

    it("reflects at least one connected database after setup", async () => {
        const res = await request(app).get("/health");
        expect(res.body.connectedDatabases).toBeGreaterThanOrEqual(1);
    });
});

// ── GET /tools ────────────────────────────────────────────────────────────────

describe("GET /tools", () => {
    it("returns a non-empty tools array", async () => {
        const res = await request(app).get("/tools");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.tools)).toBe(true);
        expect(res.body.tools.length).toBeGreaterThan(0);
    });

    it("includes expected tool names", async () => {
        const res = await request(app).get("/tools");
        const names: string[] = res.body.tools.map((t: { name: string }) => t.name);
        expect(names).toContain("list-tables");
        expect(names).toContain("get-table-schema");
    });
});

// ── GET /tools/:name ──────────────────────────────────────────────────────────

describe("GET /tools/:name", () => {
    it("returns the tool definition for a known tool", async () => {
        const res = await request(app).get("/tools/list-tables");
        expect(res.status).toBe(200);
        expect(res.body.name).toBe("list-tables");
        expect(res.body.inputSchema).toBeDefined();
    });

    it("returns 404 for an unknown tool", async () => {
        const res = await request(app).get("/tools/does-not-exist");
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });
});

// ── POST /databases ───────────────────────────────────────────────────────────

describe("POST /databases", () => {
    it("returns 400 when 'id' or 'type' is missing", async () => {
        const res = await request(app)
            .post("/databases")
            .send({ name: "missing-id" });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/'id' and 'type'/i);
    });

    it("returns 400 for postgresql type without host/database/user", async () => {
        const res = await request(app)
            .post("/databases")
            .send({ id: "pg-partial", type: "postgresql" });
        expect(res.status).toBe(400);
    });

    it("returns already_connected when re-registering the same connected ID", async () => {
        const res = await request(app)
            .post("/databases")
            .send({
                id: DB_ID,
                type: "postgresql",
                host: container.getHost(),
                port: container.getMappedPort(5432),
                database: container.getDatabase(),
                user: container.getUsername(),
                password: container.getPassword(),
                ssl: false,
            });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("already_connected");
    });
});

// ── DELETE /databases/:id ─────────────────────────────────────────────────────

describe("DELETE /databases/:id", () => {
    it("returns 404 when deleting a non-existent database ID", async () => {
        const res = await request(app).delete("/databases/ghost-db");
        expect(res.status).toBe(404);
    });
});

// ── GET /databases ────────────────────────────────────────────────────────────

describe("GET /databases", () => {
    it("lists registered databases", async () => {
        const res = await request(app).get("/databases");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.databases)).toBe(true);
        const ids = res.body.databases.map((d: { id: string }) => d.id);
        expect(ids).toContain(DB_ID);
    });
});

// ── POST /tools/list-tables/call ─────────────────────────────────────────────

describe("POST /tools/list-tables/call", () => {
    it("returns a list containing the seeded test table", async () => {
        const res = await request(app)
            .post("/tools/list-tables/call")
            .send({ arguments: { databaseId: DB_ID } });
        expect(res.status).toBe(200);
        const text: string = res.body.content?.[0]?.text ?? "";
        expect(text).toContain("test_items");
    });
});

// ── POST /tools/get-table-schema/call ────────────────────────────────────────

describe("POST /tools/get-table-schema/call", () => {
    it("returns column definitions for the seeded table", async () => {
        const res = await request(app)
            .post("/tools/get-table-schema/call")
            .send({ arguments: { tableName: "test_items", databaseId: DB_ID } });
        expect(res.status).toBe(200);
        const text: string = res.body.content?.[0]?.text ?? "";
        expect(text).toContain("id");
        expect(text).toContain("name");
    });
});


// ── POST /mcp/list-tools ──────────────────────────────────────────────────────

describe("POST /mcp/list-tools", () => {
    it("returns same tools as GET /tools", async () => {
        const mcpRes = await request(app).post("/mcp/list-tools").send({});
        const getRes = await request(app).get("/tools");
        expect(mcpRes.status).toBe(200);
        const mcpNames = mcpRes.body.tools.map((t: { name: string }) => t.name).sort();
        const getNames = getRes.body.tools.map((t: { name: string }) => t.name).sort();
        expect(mcpNames).toEqual(getNames);
    });
});

// ── POST /mcp/call-tool ───────────────────────────────────────────────────────

describe("POST /mcp/call-tool", () => {
    it("returns 400 when tool name is missing", async () => {
        const res = await request(app).post("/mcp/call-tool").send({});
        expect(res.status).toBe(400);
    });

    it("returns 404 for an unknown tool name", async () => {
        const res = await request(app)
            .post("/mcp/call-tool")
            .send({ name: "no-such-tool", arguments: {} });
        expect(res.status).toBe(404);
    });

    it("executes list-tables via MCP endpoint", async () => {
        const res = await request(app)
            .post("/mcp/call-tool")
            .send({ name: "list-tables", arguments: { databaseId: DB_ID } });
        expect(res.status).toBe(200);
        expect(res.body.content?.[0]?.text).toContain("test_items");
    });
});
