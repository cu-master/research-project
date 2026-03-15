import { loadEnv, getDirname, createLLMConfig } from "../shared/index.js";
import type { AppConfig } from "./types.js";

// ============================================================================
// Environment Setup
// ============================================================================

const __dirname = getDirname(import.meta.url);
loadEnv(__dirname);

// ============================================================================
// App Configuration
// ============================================================================

const llmConfig = createLLMConfig({
  ...(process.env.MI_GOOGLE_MODEL    && { googleModel:    process.env.MI_GOOGLE_MODEL }),
  ...(process.env.MI_ANTHROPIC_MODEL && { anthropicModel: process.env.MI_ANTHROPIC_MODEL }),
  ...(process.env.MI_GROQ_MODEL      && { groqModel:      process.env.MI_GROQ_MODEL }),
});

export const config: AppConfig = {
  ...llmConfig,
  port: parseInt(process.env.MODEL_INTERPRETATION_SERVER_PORT || "3001", 10),
};
