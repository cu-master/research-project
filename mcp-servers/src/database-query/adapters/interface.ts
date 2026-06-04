import type { Constraint, DatabaseType, ForeignKey, QueryResult, TableColumn, TableInfo } from "../types.js";

// Common API implemented by every database-specific adapter.
export interface DatabaseAdapter {
  readonly type: DatabaseType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  executeQuery(sql: string): Promise<QueryResult>;
  listTables(schemaName?: string, includeViews?: boolean): Promise<TableInfo[]>;
  getTableColumns(tableName: string, schemaName?: string): Promise<TableColumn[]>;
  getTableForeignKeys(tableName: string, schemaName?: string): Promise<ForeignKey[]>;
  getTableConstraints(tableName: string, schemaName?: string): Promise<Constraint[]>;
}

