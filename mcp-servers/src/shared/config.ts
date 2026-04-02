import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMConfig, LLMProvider } from "./types.js";

// ============================================================================
// Environment Setup Helper
// ============================================================================

/**
 * Loads environment variables from .env file.
 * Should be called once at the start of each server.
 */
export function loadEnv(dirname: string): void {
  dotenv.config({ path: path.resolve(dirname, "../../.env") });
}

/**
 * Helper to get dirname from import.meta.url
 */
export function getDirname(importMetaUrl: string): string {
  const __filename = fileURLToPath(importMetaUrl);
  return path.dirname(__filename);
}

// ============================================================================
// LLM Configuration Helper
// ============================================================================

/**
 * Creates LLM configuration from environment variables.
 * Provides consistent defaults across all servers.
 */
export function createLLMConfig(overrides?: Partial<LLMConfig>): LLMConfig {
  return {
    provider:
      (process.env.LLM_PROVIDER?.toLowerCase() as LLMProvider) || "google",
    anthropicKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    googleKey: process.env.GOOGLE_API_KEY,
    groqKey: process.env.GROQ_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307",
    googleModel: process.env.GOOGLE_MODEL || "gemini-1.5-flash",
    groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    ...overrides,
  };
}

