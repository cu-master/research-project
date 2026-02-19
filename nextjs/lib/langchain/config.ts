import { ModelProvider } from "./types";

export const LLM_PROVIDER = (process.env.LLM_PROVIDER as ModelProvider) || "google";

export const MODEL_INTERPRETATION_BASE_URL =
  process.env.MODEL_INTERPRETATION_URL || "http://localhost:3001";

export const DATABASE_QUERY_BASE_URL =
  process.env.DATABASE_QUERY_URL || "http://localhost:3002";

export const ONTOP_SPARQL_URL =
  process.env.ONTOP_SPARQL_URL || "http://localhost:8080/sparql";

