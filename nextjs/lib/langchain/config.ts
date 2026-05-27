import { ModelProvider } from "./types";

export const LLM_PROVIDER = (process.env.LLM_PROVIDER as ModelProvider) || "google";

export const MODEL_INTERPRETATION_BASE_URL =
  process.env.MODEL_INTERPRETATION_URL || "http://localhost:3001";

export const DATABASE_QUERY_BASE_URL =
  process.env.DATABASE_QUERY_URL || "http://localhost:3002";

export const MCP_API_TOKEN = process.env.MCP_API_TOKEN?.trim() || "";

// Adds JSON content-type and (when configured) a Bearer token for MCP servers. Matches what shared/auth-rate-limit.ts expects.
export function mcpFetchHeaders(extra?: HeadersInit): HeadersInit {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (MCP_API_TOKEN) base["Authorization"] = `Bearer ${MCP_API_TOKEN}`;
  return { ...base, ...(extra as Record<string, string> | undefined) };
}

