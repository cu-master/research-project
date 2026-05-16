import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { bearerAuth, rateLimit } from "./auth-rate-limit.js";

describe("bearerAuth", () => {
    const ORIGINAL_TOKEN = process.env.MCP_API_TOKEN;
    afterEach(() => {
        if (ORIGINAL_TOKEN === undefined) delete process.env.MCP_API_TOKEN;
        else process.env.MCP_API_TOKEN = ORIGINAL_TOKEN;
    });

    function makeApp() {
        const app = express();
        app.use(bearerAuth());
        app.get("/health", (_req, res) => { res.json({ ok: true }); });
        app.get("/secure", (_req, res) => { res.json({ ok: true }); });
        return app;
    }

    it("allows all requests when MCP_API_TOKEN is unset", async () => {
        delete process.env.MCP_API_TOKEN;
        const app = makeApp();
        const res = await request(app).get("/secure");
        expect(res.status).toBe(200);
    });

    it("rejects requests without a Bearer token when MCP_API_TOKEN is set", async () => {
        process.env.MCP_API_TOKEN = "s3cret";
        const app = makeApp();
        const res = await request(app).get("/secure");
        expect(res.status).toBe(401);
    });

    it("rejects requests with a wrong Bearer token", async () => {
        process.env.MCP_API_TOKEN = "s3cret";
        const app = makeApp();
        const res = await request(app).get("/secure").set("Authorization", "Bearer wrong");
        expect(res.status).toBe(401);
    });

    it("accepts requests with the correct Bearer token", async () => {
        process.env.MCP_API_TOKEN = "s3cret";
        const app = makeApp();
        const res = await request(app).get("/secure").set("Authorization", "Bearer s3cret");
        expect(res.status).toBe(200);
    });

    it("exempts /health even when token is required", async () => {
        process.env.MCP_API_TOKEN = "s3cret";
        const app = makeApp();
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
    });
});

describe("rateLimit", () => {
    function makeApp(max: number, windowMs = 60_000) {
        const app = express();
        app.use(rateLimit({ max, windowMs }));
        app.get("/anything", (_req, res) => { res.json({ ok: true }); });
        app.get("/health", (_req, res) => { res.json({ ok: true }); });
        return app;
    }

    it("permits up to `max` requests in a window then 429s", async () => {
        const app = makeApp(3);
        for (let i = 0; i < 3; i++) {
            const res = await request(app).get("/anything");
            expect(res.status).toBe(200);
        }
        const blocked = await request(app).get("/anything");
        expect(blocked.status).toBe(429);
        expect(blocked.headers["retry-after"]).toBeDefined();
    });

    it("exempts /health from rate limiting", async () => {
        const app = makeApp(1);
        await request(app).get("/health");
        await request(app).get("/health");
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
    });
});
