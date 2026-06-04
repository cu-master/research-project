export type {
  McpResponse,
  ToolDefinition,
  LLMProvider,
  LLMConfig,
  BaseAppConfig,
} from "../shared/types.js";

export interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

export interface TableInfo {
  table_name: string;
  table_schema: string;
  table_type: string;
}

export interface ForeignKey {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export interface Constraint {
  constraint_name: string;
  constraint_type: string;
  column_name: string;
}

// Return shape of DatabaseAdapter.executeQuery, retained as the NFR-01 read-only test harness
// (see postgresql.ts); not used by the production SPARQL/Ontop query path.
export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  error?: string;
}

export type DatabaseType = "postgresql";

export interface PostgreSQLConfig {
  type: "postgresql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export type DatabaseConfig = PostgreSQLConfig;

export interface AppConfig {
  provider: import("../shared/types.js").LLMProvider;
  anthropicKey: string | undefined;
  googleKey: string | undefined;
  groqKey: string | undefined;
  openaiKey: string | undefined;
  anthropicModel: string;
  googleModel: string;
  groqModel: string;
  openaiModel: string;
  port: number;
  ontopSparqlUrl: string;
  ontopInputDir: string;
  projectRoot: string;
}
