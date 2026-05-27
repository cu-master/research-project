import { createAICaller } from "../../shared/ai/index.js";
import { config } from "../config.js";

const aiCaller = createAICaller(config);

// Default 4000 max tokens — sized for schema analysis.
export async function callAI(prompt: string, maxTokens = 4000): Promise<string> {
  return aiCaller(prompt, { maxTokens, temperature: 0.2 });
}
