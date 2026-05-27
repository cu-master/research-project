import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMConfig, LLMProvider } from "./types.js";

// Call once at server startup.
export function loadEnv(dirname: string): void {
  dotenv.config({ path: path.resolve(dirname, "../../.env") });
}

export function getDirname(importMetaUrl: string): string {
  const __filename = fileURLToPath(importMetaUrl);
  return path.dirname(__filename);
}

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

