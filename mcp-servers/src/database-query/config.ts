import path from "node:path";
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
  ...(process.env.DB_GOOGLE_MODEL    && { googleModel:    process.env.DB_GOOGLE_MODEL }),
  ...(process.env.DB_ANTHROPIC_MODEL && { anthropicModel: process.env.DB_ANTHROPIC_MODEL }),
  ...(process.env.DB_GROQ_MODEL      && { groqModel:      process.env.DB_GROQ_MODEL }),
});

const defaultProjectRoot = path.resolve(__dirname, "..", "..", "..");
const projectRoot = process.env.PROJECT_ROOT
  ? path.resolve(process.env.PROJECT_ROOT)
  : defaultProjectRoot;

export const config: AppConfig = {
  ...llmConfig,
  port: parseInt(process.env.DB_MCP_SERVER_PORT || "3002", 10),
  ontopSparqlUrl:
    process.env.ONTOP_SPARQL_URL || "http://localhost:8080/sparql",
  ontopInputDir:
    process.env.ONTOP_INPUT_DIR
      ? path.resolve(process.env.ONTOP_INPUT_DIR)
      : path.join(projectRoot, "ontop", "input"),
  projectRoot,
};
