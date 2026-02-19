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

const llmConfig = createLLMConfig();

export const config: AppConfig = {
  ...llmConfig,
  port: parseInt(process.env.DB_MCP_SERVER_PORT || "3002", 10),
};
