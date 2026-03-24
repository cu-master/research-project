// Re-export shared types
export type {
  McpResponse,
  ToolDefinition,
  LLMProvider,
  LLMConfig,
  BaseAppConfig,
} from "../shared/types.js";

// ============================================================================
// Database Types & Interfaces
// ============================================================================

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

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  error?: string;
}

// ============================================================================
// Database Configuration Types
// ============================================================================

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

// ============================================================================
// App Configuration (extends shared config)
// ============================================================================

export interface AppConfig {
  provider: import("../shared/types.js").LLMProvider;
  anthropicKey: string | undefined;
  googleKey: string | undefined;
  groqKey: string | undefined;
  anthropicModel: string;
  googleModel: string;
  groqModel: string;
  port: number;
  ontopSparqlUrl: string;
  ontopInputDir: string;
  projectRoot: string;
}
