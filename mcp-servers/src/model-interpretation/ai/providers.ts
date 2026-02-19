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
 * Call AI with the model-interpretation server's configuration.
 * Uses higher default max tokens (4000) suitable for schema analysis.
 */
export async function callAI(prompt: string, maxTokens = 4000): Promise<string> {
  return aiCaller(prompt, { maxTokens, temperature: 0.2 });
}
