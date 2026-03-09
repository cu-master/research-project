import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PostgreSQLAdapter } from "./postgresql.js";

// ── Container lifecycle ───────────────────────────────────────────────────────

let container: StartedPostgreSqlContainer;
let adapter: PostgreSQLAdapter;

beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    adapter = new PostgreSQLAdapter({
        type: "postgresql",
        host: container.getHost(),
        port: container.getMappedPort(5432),
        database: container.getDatabase(),
        user: container.getUsername(),
        password: container.getPassword(),
        ssl: false,
    });

    await adapter.connect();

    // Seed a test schema
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      customer_id SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      order_id    SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
      total       NUMERIC(10, 2) NOT NULL
    );
    INSERT INTO customers (name, email)
      VALUES ('Alice', 'alice@test.com'), ('Bob', 'bob@test.com');
    INSERT INTO orders (customer_id, total)
      VALUES (1, 99.99), (1, 149.50), (2, 19.00);
  `);
    await pool.end();
}, 60_000);

afterAll(async () => {
    await adapter.disconnect();
    await container.stop();
});

// ── isConnected ───────────────────────────────────────────────────────────────

describe("PostgreSQLAdapter.isConnected()", () => {
    it("returns true after connect()", () => {
        expect(adapter.isConnected()).toBe(true);
    });
});

// ── listTables ────────────────────────────────────────────────────────────────

describe("PostgreSQLAdapter.listTables()", () => {
    it("returns the seeded tables", async () => {
        const tables = await adapter.listTables();
        const names = tables.map((t) => t.table_name);
        expect(names).toContain("customers");
        expect(names).toContain("orders");
    });

    it("table entries have the expected shape", async () => {
        const tables = await adapter.listTables();
        const cust = tables.find((t) => t.table_name === "customers");
        expect(cust).toBeDefined();
        expect(cust!.table_type).toBe("BASE TABLE");
    });

    it("excludes views when includeViews=false", async () => {
        const tables = await adapter.listTables("public", false);
        tables.forEach((t) => expect(t.table_type).toBe("BASE TABLE"));
    });
});

// ── getTableColumns ───────────────────────────────────────────────────────────

describe("PostgreSQLAdapter.getTableColumns()", () => {
    it("returns correct columns for 'customers'", async () => {
        const cols = await adapter.getTableColumns("customers");
        const names = cols.map((c) => c.column_name);
        expect(names).toContain("customer_id");
        expect(names).toContain("name");
        expect(names).toContain("email");
    });

    it("returns column data types", async () => {
        const cols = await adapter.getTableColumns("customers");
        const emailCol = cols.find((c) => c.column_name === "email");
        expect(emailCol?.data_type).toBe("text");
    });

    it("returns an empty array for a non-existent table", async () => {
        const cols = await adapter.getTableColumns("ghost_table");
        expect(cols).toHaveLength(0);
    });
});

// ── getTableConstraints ───────────────────────────────────────────────────────

describe("PostgreSQLAdapter.getTableConstraints()", () => {
    it("returns the PK constraint for 'customers'", async () => {
        const constraints = await adapter.getTableConstraints("customers");
        const pk = constraints.find((c) => c.constraint_type === "PRIMARY KEY");
        expect(pk).toBeDefined();
        expect(pk!.column_name).toBe("customer_id");
    });

    it("returns the UNIQUE constraint on 'email'", async () => {
        const constraints = await adapter.getTableConstraints("customers");
        const uniq = constraints.find(
            (c) => c.constraint_type === "UNIQUE" && c.column_name === "email"
        );
        expect(uniq).toBeDefined();
    });
});

// ── getTableForeignKeys ───────────────────────────────────────────────────────

describe("PostgreSQLAdapter.getTableForeignKeys()", () => {
    it("returns the FK from orders → customers", async () => {
        const fks = await adapter.getTableForeignKeys("orders");
        expect(fks.length).toBeGreaterThan(0);
        const fk = fks[0];
        expect(fk.column_name).toBe("customer_id");
        expect(fk.foreign_table_name).toBe("customers");
        expect(fk.foreign_column_name).toBe("customer_id");
    });

    it("returns an empty array for a table without FKs", async () => {
        const fks = await adapter.getTableForeignKeys("customers");
        expect(fks).toHaveLength(0);
    });
});

// ── executeQuery ──────────────────────────────────────────────────────────────

describe("PostgreSQLAdapter.executeQuery()", () => {
    it("executes a SELECT and returns the correct row count", async () => {
        const result = await adapter.executeQuery("SELECT * FROM customers ORDER BY customer_id");
        expect(result.error).toBeUndefined();
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].name).toBe("Alice");
    });

    it("executes an aggregate query", async () => {
        const result = await adapter.executeQuery(
            "SELECT COUNT(*) AS total FROM orders"
        );
        expect(result.error).toBeUndefined();
        expect(Number(result.rows[0].total)).toBe(3);
    });

    it("propagates a DB-level error cleanly (no throw, returns error field)", async () => {
        const result = await adapter.executeQuery("SELECT * FROM nonexistent_table_xyz");
        expect(result.rows).toHaveLength(0);
        expect(result.error).toBeTruthy();
        expect(result.error).toMatch(/nonexistent_table_xyz/);
    });
});

// ── disconnect / reconnect ────────────────────────────────────────────────────

describe("PostgreSQLAdapter disconnect / reconnect", () => {
    it("isConnected() returns false after disconnect()", async () => {
        const tempAdapter = new PostgreSQLAdapter({
            type: "postgresql",
            host: container.getHost(),
            port: container.getMappedPort(5432),
            database: container.getDatabase(),
            user: container.getUsername(),
            password: container.getPassword(),
            ssl: false,
        });
        await tempAdapter.connect();
        expect(tempAdapter.isConnected()).toBe(true);
        await tempAdapter.disconnect();
        expect(tempAdapter.isConnected()).toBe(false);
    });

    it("throws when connecting with invalid credentials", async () => {
        const badAdapter = new PostgreSQLAdapter({
            type: "postgresql",
            host: container.getHost(),
            port: container.getMappedPort(5432),
            database: container.getDatabase(),
            user: "wrong_user",
            password: "wrong_pass",
            ssl: false,
        });
        await expect(badAdapter.connect()).rejects.toThrow();
    });
});
