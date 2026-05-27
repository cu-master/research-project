import { describe, it, expect } from "vitest";
import {
    extractSqlFromResponse,
    validateSelectOnlySql,
    prepareSqlForExecution,
} from "./utils.js";

describe("extractSqlFromResponse", () => {
    it("extracts SQL from a ```sql code fence", () => {
        const input = "Here it is:\n```sql\nSELECT * FROM users\n```";
        expect(extractSqlFromResponse(input)).toBe("SELECT * FROM users");
    });

    it("extracts SQL from a generic ``` code fence", () => {
        const input = "```\nSELECT id FROM orders\n```";
        expect(extractSqlFromResponse(input)).toBe("SELECT id FROM orders");
    });

    it("extracts bare SQL when there is no code fence", () => {
        const input = "SELECT name FROM products LIMIT 10";
        expect(extractSqlFromResponse(input)).toBe("SELECT name FROM products LIMIT 10");
    });

    it("strips trailing semicolons", () => {
        const input = "```sql\nSELECT 1;\n```";
        expect(extractSqlFromResponse(input)).toBe("SELECT 1");
    });

    it("returns the raw response trimmed when no recognisable SQL is found", () => {
        const input = "  some free text  ";
        expect(extractSqlFromResponse(input)).toBe("some free text");
    });
});

describe("validateSelectOnlySql", () => {
    it("accepts a plain SELECT query", () => {
        const result = validateSelectOnlySql("SELECT id, name FROM users");
        expect(result.valid).toBe(true);
        expect(result.statementType).toBe("select");
    });

    it("accepts a SELECT with WHERE, ORDER BY and LIMIT", () => {
        const result = validateSelectOnlySql(
            "SELECT id FROM orders WHERE status = 'active' ORDER BY id DESC LIMIT 10"
        );
        expect(result.valid).toBe(true);
    });

    it("accepts a SELECT with a JOIN", () => {
        const result = validateSelectOnlySql(
            "SELECT u.id, o.total FROM users u JOIN orders o ON u.id = o.user_id"
        );
        expect(result.valid).toBe(true);
    });

    it("rejects an INSERT statement", () => {
        const result = validateSelectOnlySql("INSERT INTO users (name) VALUES ('Alice')");
        expect(result.valid).toBe(false);
        expect(result.statementType).toBe("insert");
        expect(result.reason).toMatch(/INSERT/i);
    });

    it("rejects an UPDATE statement", () => {
        const result = validateSelectOnlySql("UPDATE users SET name = 'Bob' WHERE id = 1");
        expect(result.valid).toBe(false);
        expect(result.statementType).toBe("update");
    });

    it("rejects a DELETE statement", () => {
        const result = validateSelectOnlySql("DELETE FROM users WHERE id = 1");
        expect(result.valid).toBe(false);
        expect(result.statementType).toBe("delete");
    });

    it("rejects a DROP TABLE statement", () => {
        const result = validateSelectOnlySql("DROP TABLE users");
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/DROP/i);
    });

    it("rejects a CREATE TABLE statement", () => {
        const result = validateSelectOnlySql("CREATE TABLE tmp (id INT)");
        expect(result.valid).toBe(false);
    });

    it("rejects multi-statement SQL (SELECT then DROP)", () => {
        const result = validateSelectOnlySql("SELECT 1; DROP TABLE users");
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/multiple/i);
    });

    it("rejects unparseable / garbage SQL", () => {
        const result = validateSelectOnlySql("this is definitely not SQL");
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/parse/i);
    });
});

describe("prepareSqlForExecution", () => {
    it("appends LIMIT when the SELECT has no LIMIT clause", () => {
        const sql = prepareSqlForExecution("SELECT * FROM users", 50);
        expect(sql.toUpperCase()).toContain("LIMIT 50");
    });

    it("does NOT add a second LIMIT when one already exists", () => {
        const sql = prepareSqlForExecution("SELECT * FROM users LIMIT 10", 50);
        // Should not contain two LIMIT keywords
        const matches = sql.toUpperCase().match(/LIMIT/g);
        expect(matches?.length).toBe(1);
    });

    it("strips a trailing semicolon before appending LIMIT", () => {
        const sql = prepareSqlForExecution("SELECT 1;", 100);
        expect(sql).not.toContain(";");
        expect(sql.toUpperCase()).toContain("LIMIT");
    });

    it("does not add LIMIT to non-SELECT statements (no-op)", () => {
        // prepareSqlForExecution only adds LIMIT to SELECT
        const sql = prepareSqlForExecution("INSERT INTO t VALUES (1)", 50);
        expect(sql.toUpperCase()).not.toContain("LIMIT");
    });
});

