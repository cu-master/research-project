import { createAICaller } from "../../shared/ai/index.js";
import { config } from "../config.js";

// ============================================================================
// AI Caller Instance
// ============================================================================

const aiCaller = createAICaller(config);

// ============================================================================
// Main AI Call Function
// ============================================================================

/**
 * Call AI with the database-query server's configuration.
 * Uses lower default max tokens (2000) suitable for SQL generation.
 */
export async function callAI(prompt: string, maxTokens = 2000): Promise<string> {
  return aiCaller(prompt, { maxTokens, temperature: 0.1 });
}
