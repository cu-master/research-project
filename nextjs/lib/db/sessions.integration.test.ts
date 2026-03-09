import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
// ── Container lifecycle ───────────────────────────────────────────────────────
//
// The sessions.ts/projects.ts modules use getPool() which picks up the
// DATABASE_URL env var. We set that var BEFORE importing the modules so the
// lazy singleton pool is created pointing at our Testcontainer.

let container: StartedPostgreSqlContainer;

import { execSync } from "child_process";

let createSession: typeof import("./sessions").createSession;
let getSession: typeof import("./sessions").getSession;
let saveMessage: typeof import("./sessions").saveMessage;
let getSessionMessages: typeof import("./sessions").getSessionMessages;
let archiveSession: typeof import("./sessions").archiveSession;
let getActiveSessions: typeof import("./sessions").getActiveSessions;
let getArchivedSessions: typeof import("./sessions").getArchivedSessions;
let deleteSession: typeof import("./sessions").deleteSession;

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    process.env.DATABASE_URL = container.getConnectionUri();

    // Apply the Prisma schema directly to the container
    execSync("npx prisma db push --skip-generate", {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        stdio: "ignore"
    });

    const prisma = (await import("./prisma.js")).default;

    // Seed test users
    await prisma.user.create({
        data: { id: TEST_USER_ID, name: "Test User", email: "test@integration.test", password_hash: "hash" }
    });

    const sessions = await import("./sessions.js");
    createSession = sessions.createSession;
    getSession = sessions.getSession;
    saveMessage = sessions.saveMessage;
    getSessionMessages = sessions.getSessionMessages;
    archiveSession = sessions.archiveSession;
    getActiveSessions = sessions.getActiveSessions;
    getArchivedSessions = sessions.getArchivedSessions;
    deleteSession = sessions.deleteSession;
}, 60_000);

afterAll(async () => {
    await container.stop();
});

// ── createSession / getSession ────────────────────────────────────────────────

describe("createSession / getSession", () => {
    it("persists a new session and returns it by ID", async () => {
        const session = await createSession(TEST_USER_ID);
        expect(session.id).toBeTruthy();
        expect(session.is_archived).toBe(false);

        const found = await getSession(session.id, TEST_USER_ID);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(session.id);
    });

    it("returns null for a session that does not exist", async () => {
        const result = await getSession("00000000-0000-0000-0000-000000000999", TEST_USER_ID);
        expect(result).toBeNull();
    });

    it("returns null when userId does not match session owner", async () => {
        const session = await createSession(TEST_USER_ID);
        const result = await getSession(session.id, "00000000-0000-0000-0000-000000000002");
        expect(result).toBeNull();
    });
});

// ── saveMessage / getSessionMessages ─────────────────────────────────────────

describe("saveMessage / getSessionMessages", () => {
    let sessionId: string;

    beforeEach(async () => {
        // Fresh session for each test in this group
        const session = await createSession(TEST_USER_ID);
        sessionId = session.id;
    });

    it("saves a user message and retrieves it", async () => {
        const msg = await saveMessage(sessionId, "user", "Hello from user");
        expect(msg.id).toBeTruthy();
        expect(msg.role).toBe("user");
        expect(msg.content).toBe("Hello from user");

        const messages = await getSessionMessages(sessionId);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe(msg.id);
    });

    it("saves both user and assistant messages in order", async () => {
        await saveMessage(sessionId, "user", "Question?");
        await saveMessage(sessionId, "assistant", "Answer.");

        const messages = await getSessionMessages(sessionId);
        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe("user");
        expect(messages[1].role).toBe("assistant");
    });

    it("persists toolsUsed and latency on assistant messages", async () => {
        const tools = [{ tool: "list-tables", input: "{}", log: "", observation: "ok" }];
        const msg = await saveMessage(sessionId, "assistant", "I used a tool", undefined, tools, 1.23);
        expect(msg.tools_used).toBeTruthy();
        expect(Number(msg.latency)).toBeCloseTo(1.23, 1);
    });

    it("auto-updates session title from the first user message", async () => {
        await saveMessage(sessionId, "user", "My first message");
        const session = await getSession(sessionId, TEST_USER_ID);
        expect(session?.title).toContain("My first message");
    });
});

// ── archiveSession / getActiveSessions / getArchivedSessions ─────────────────

describe("archiveSession / getActiveSessions / getArchivedSessions", () => {
    it("moves a session from active to archived", async () => {
        const session = await createSession(TEST_USER_ID);

        await archiveSession(session.id, TEST_USER_ID);
        const archived = await getSession(session.id, TEST_USER_ID);
        expect(archived?.is_archived).toBe(true);
    });

    it("excludes archived sessions from getActiveSessions", async () => {
        const session = await createSession(TEST_USER_ID);
        await archiveSession(session.id, TEST_USER_ID);

        const active = await getActiveSessions(50, TEST_USER_ID);
        const ids = active.map((s) => s.id);
        expect(ids).not.toContain(session.id);
    });

    it("includes archived sessions in getArchivedSessions", async () => {
        const session = await createSession(TEST_USER_ID);
        await archiveSession(session.id, TEST_USER_ID);

        const archived = await getArchivedSessions(50, TEST_USER_ID);
        const ids = archived.map((s) => s.id);
        expect(ids).toContain(session.id);
    });
});

// ── deleteSession (CASCADE to messages) ──────────────────────────────────────

describe("deleteSession", () => {
    it("deletes the session and cascades to messages", async () => {
        const session = await createSession(TEST_USER_ID);
        await saveMessage(session.id, "user", "Will be deleted");

        await deleteSession(session.id, TEST_USER_ID);

        const found = await getSession(session.id, TEST_USER_ID);
        expect(found).toBeNull();

        const messages = await getSessionMessages(session.id);
        expect(messages).toHaveLength(0);
    });
});
