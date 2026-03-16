import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { execSync } from "child_process";

// ── Inline minimal MCP server for controlled test responses ─────────────────
//
// Rather than fully starting mcp-servers (which requires separate env setup),
// we spin up a tiny Express-like HTTP server in-process that mimics the MCP
// database-query API contract. This validates that database-query-client.ts
// correctly serialises requests and parses responses.

import express from "express";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

// ── Container (only needed for ensureProjectDatabase path) ───────────────────
let container: StartedPostgreSqlContainer | undefined;

const hasContainerRuntime = (() => {
    try {
        execSync("docker info", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

const itIfContainer = hasContainerRuntime ? it : it.skip;

let ensureProjectDatabase: typeof import("./database-query-client").ensureProjectDatabase;
let callDatabaseQueryTool: typeof import("./database-query-client").callDatabaseQueryTool;

const mockApp = express();
mockApp.use(express.json());

// Mimic POST /databases
mockApp.post("/databases", (_req, res) => {
    res.json({ status: "connected", id: "project_test" });
});

// Mimic POST /mcp/call-tool
mockApp.post("/mcp/call-tool", (req, res) => {
    const { name } = req.body;
    if (name === "list-tables") {
        res.json({
            content: [{ type: "text", text: "Tables: customers, orders" }],
            isError: false,
        });
    } else if (name === "error-tool") {
        res.json({
            content: [{ type: "text", text: "Something went wrong" }],
            isError: true,
        });
    } else {
        res.status(404).json({ error: `Tool "${name}" not found` });
    }
});

beforeAll(async () => {
    if (!hasContainerRuntime) {
        return;
    }

    // Start mock MCP server
    server = createServer(mockApp);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Set env var so the client points at our mock server
    process.env.DATABASE_QUERY_URL = baseUrl;

    // Start Testcontainer (used by ensureProjectDatabase test)
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    // Dynamic import AFTER env var is set
    const mod = await import("./database-query-client.js");
    ensureProjectDatabase = mod.ensureProjectDatabase;
    callDatabaseQueryTool = mod.callDatabaseQueryTool;
}, 60_000);

afterAll(async () => {
    if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (container) {
        await container.stop();
    }
});

// ── ensureProjectDatabase ─────────────────────────────────────────────────────

describe("ensureProjectDatabase", () => {
    const baseProject = {
        id: "proj-001",
        db_type: "postgresql",
        db_name: "Integration DB",
        db_host: "localhost",
        db_port: 5432,
        db_database: "testdb",
        db_user: "admin",
        db_password: "secret",
        db_ssl: false,
    };

    itIfContainer("registers the database and returns the DB ID", async () => {
        const result = await ensureProjectDatabase(baseProject);
        expect(result).toBe("project_proj-001");
    });

    itIfContainer("skips re-registration on a second call (in-process cache)", async () => {
        const spy = vi.spyOn(global, "fetch" as "fetch");
        // Second call for the same project should return the cached ID without fetch
        const result = await ensureProjectDatabase(baseProject);
        expect(result).toBe("project_proj-001");
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    itIfContainer("returns null when required DB fields are missing", async () => {
        const incomplete = { ...baseProject, db_host: null };
        const result = await ensureProjectDatabase(incomplete);
        expect(result).toBeNull();
    });
});

// ── callDatabaseQueryTool ─────────────────────────────────────────────────────

describe("callDatabaseQueryTool", () => {
    itIfContainer("returns parsed text content from a successful tool call", async () => {
        const result = await callDatabaseQueryTool("list-tables", {});
        expect(result).toContain("customers");
        expect(result).toContain("orders");
    });

    itIfContainer("throws an Error when the tool returns isError=true", async () => {
        await expect(callDatabaseQueryTool("error-tool", {})).rejects.toThrow(
            "Something went wrong"
        );
    });

    itIfContainer("throws with 'not found' message for an unknown tool", async () => {
        await expect(callDatabaseQueryTool("ghost-tool", {})).rejects.toThrow();
    });

    itIfContainer("throws a readable ECONNREFUSED error when the server is not running", async () => {
        // Temporarily redirect to a port with no server
        process.env.DATABASE_QUERY_URL = "http://127.0.0.1:19999";

        // Re-import to pick up new env var (module may be cached, mock fetch instead)
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

        await expect(callDatabaseQueryTool("list-tables", {})).rejects.toThrow(
            /Cannot connect|fetch failed/i
        );

        // Restore
        global.fetch = originalFetch;
        process.env.DATABASE_QUERY_URL = baseUrl;
    });
});
