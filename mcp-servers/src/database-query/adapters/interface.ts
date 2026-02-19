import type { Constraint, DatabaseType, ForeignKey, QueryResult, TableColumn, TableInfo } from "../types.js";

// ============================================================================
// Database Adapter Interface
// ============================================================================

/**
 * Abstract interface that all database adapters must implement.
 * This provides a common API for interacting with different databases.
 */
export interface DatabaseAdapter {
  /** Unique identifier for this adapter type */
  readonly type: DatabaseType;

  /** Connect to the database */
  connect(): Promise<void>;

  /** Disconnect from the database */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Execute a raw SQL query */
  executeQuery(sql: string): Promise<QueryResult>;

  /** List all tables in the database */
  listTables(schemaName?: string, includeViews?: boolean): Promise<TableInfo[]>;

  /** Get columns for a specific table */
  getTableColumns(tableName: string, schemaName?: string): Promise<TableColumn[]>;

  /** Get foreign keys for a specific table */
  getTableForeignKeys(tableName: string, schemaName?: string): Promise<ForeignKey[]>;

  /** Get table constraints */
  getTableConstraints(tableName: string, schemaName?: string): Promise<Constraint[]>;

  /** Build schema context string for AI */
  buildSchemaContext(): Promise<string>;
}

