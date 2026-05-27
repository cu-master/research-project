import { createAICaller } from "../../shared/ai/index.js";
import { config } from "../config.js";

const aiCaller = createAICaller(config);

// Default 2000 max tokens — sized for SQL generation.
export async function callAI(prompt: string, maxTokens = 2000): Promise<string> {
  return aiCaller(prompt, { maxTokens, temperature: 0.1 });
}
