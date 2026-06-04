import type { Request, Response, NextFunction, RequestHandler } from "express";
import { log } from "./logger.js";

// ---------------------------------------------------------------------------
// Bearer-token auth
// ---------------------------------------------------------------------------
//
// If MCP_API_TOKEN is set, every request must include
//   Authorization: Bearer <token>
// (constant-time compared). Health checks are exempt so Docker probes still work.
//
// If MCP_API_TOKEN is NOT set we log a single warning at startup and allow all
// requests — keeps local dev frictionless. Production deployments must set it.

const HEALTH_PATHS = new Set(["/health", "/healthz", "/ready"]);

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function bearerAuth(): RequestHandler {
  const token = process.env.MCP_API_TOKEN?.trim();
  if (!token) {
    log.warn(
      "[auth] MCP_API_TOKEN is not set — MCP endpoints are UNAUTHENTICATED. " +
      "Set MCP_API_TOKEN in production."
    );
    return (_req, _res, next) => next();
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (HEALTH_PATHS.has(req.path)) return next();
    const header = req.header("authorization") || "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !timingSafeEqualStr(m[1].trim(), token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Token-bucket rate limiter (per client IP, in-memory)
// ---------------------------------------------------------------------------
//
// Sized for a single-process MCP server. For multi-replica deploys, swap for
// a Redis-backed limiter. Health checks are exempt.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimitOptions {
  /** Requests permitted per windowMs (default 60). */
  max?: number;
  /** Window size in ms (default 60_000). */
  windowMs?: number;
  /** Max distinct IPs to track before LRU-evicting oldest (default 10_000). */
  maxClients?: number;
}

export function rateLimit(opts: RateLimitOptions = {}): RequestHandler {
  const max = opts.max ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const maxClients = opts.maxClients ?? 10_000;
  const refillPerMs = max / windowMs;
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (HEALTH_PATHS.has(req.path)) return next();

    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxClients) {
        // Evict oldest entry (Map iteration order is insertion order).
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
      bucket = { tokens: max, updatedAt: now };
      buckets.set(key, bucket);
    } else {
      // Refill since last touch, capped at max.
      const elapsed = now - bucket.updatedAt;
      bucket.tokens = Math.min(max, bucket.tokens + elapsed * refillPerMs);
      bucket.updatedAt = now;
      // Re-insert to update LRU position.
      buckets.delete(key);
      buckets.set(key, bucket);
    }

    if (bucket.tokens < 1) {
      const retryAfterMs = Math.ceil((1 - bucket.tokens) / refillPerMs);
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
      res.status(429).json({ error: "Too Many Requests" });
      return;
    }
    bucket.tokens -= 1;
    next();
  };
}
