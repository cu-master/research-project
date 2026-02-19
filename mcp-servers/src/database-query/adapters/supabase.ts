import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Constraint, DatabaseType, ForeignKey, QueryResult, SupabaseConfig, TableColumn, TableInfo } from "../types.js";
import type { DatabaseAdapter } from "./interface.js";

// ============================================================================
// Supabase Adapter
// ============================================================================

export class SupabaseAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = "supabase";
  private client: SupabaseClient | null = null;
  private config: SupabaseConfig;

  constructor(config: SupabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.client) return;

    this.client = createClient(this.config.url, this.config.serviceKey);
    // Test connection by making a simple query
    const { error } = await this.client.from("pg_catalog.pg_tables").select("tablename").limit(1);
    if (error && !error.message.includes("permission denied")) {
      // Some errors are expected if RLS is enabled, only throw on connection errors
      if (error.message.includes("connection") || error.message.includes("network")) {
        throw new Error(`Failed to connect to Supabase: ${error.message}`);
      }
    }
  }

  async disconnect(): Promise<void> {
    // Supabase client doesn't have a disconnect method
    this.client = null;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.client;
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    try {
      const client = this.getClient();
      const { data, error } = await client.rpc("execute_sql", { query: sql });

      if (error) {
        return {
          rows: [],
          rowCount: 0,
          error: error.message,
        };
      }

      const rows = (data || []) as Record<string, unknown>[];
      return {
        rows,
        rowCount: rows.length,
      };
    } catch (error) {
      return {
        rows: [],
        rowCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listTables(schemaName = "public", includeViews = true): Promise<TableInfo[]> {
    const client = this.getClient();
    const viewCondition = includeViews ? "" : "AND table_type = 'BASE TABLE'";

    const { data, error } = await client.rpc("execute_sql", {
      query: `
        SELECT table_name, table_schema, table_type
        FROM information_schema.tables
        WHERE table_schema = '${schemaName}' ${viewCondition}
        ORDER BY table_type, table_name
      `,
    });

    if (error) {
      // Fallback approach
      const { data: fallbackData, error: fallbackError } = await client
        .from("pg_catalog.pg_tables")
        .select("tablename, schemaname")
        .eq("schemaname", schemaName);

      if (fallbackError) {
        throw new Error(`Failed to list tables: ${fallbackError.message}`);
      }

      return (fallbackData || []).map((t: { tablename: string; schemaname: string }) => ({
        table_name: t.tablename,
        table_schema: t.schemaname,
        table_type: "BASE TABLE",
      }));
    }

    return (data || []) as TableInfo[];
  }

  async getTableColumns(tableName: string, schemaName = "public"): Promise<TableColumn[]> {
    const client = this.getClient();

    const { data, error } = await client.rpc("execute_sql", {
      query: `
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'
        ORDER BY ordinal_position
      `,
    });

    if (error) {
      throw new Error(`Failed to get columns for ${tableName}: ${error.message}`);
    }

    return (data || []) as TableColumn[];
  }

  async getTableForeignKeys(tableName: string, schemaName = "public"): Promise<ForeignKey[]> {
    const client = this.getClient();

    const { data, error } = await client.rpc("execute_sql", {
      query: `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = '${schemaName}'
          AND tc.table_name = '${tableName}'
      `,
    });

    if (error) {
      return [];
    }

    return (data || []) as ForeignKey[];
  }

  async getTableConstraints(tableName: string, schemaName = "public"): Promise<Constraint[]> {
    const client = this.getClient();

    const { data, error } = await client.rpc("execute_sql", {
      query: `
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = '${schemaName}' AND tc.table_name = '${tableName}'
        ORDER BY tc.constraint_type, tc.constraint_name
      `,
    });

    if (error) {
      return [];
    }

    return (data || []) as Constraint[];
  }

  async buildSchemaContext(): Promise<string> {
    let context = "DATABASE SCHEMA (Supabase/PostgreSQL):\n\n";

    try {
      const tables = await this.listTables();

      for (const table of tables) {
        context += `Table: ${table.table_name} (${table.table_type})\n`;
        const columns = await this.getTableColumns(table.table_name);

        for (const col of columns) {
          const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : "";
          context += `  - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}\n`;
        }

        const fks = await this.getTableForeignKeys(table.table_name);
        if (fks.length > 0) {
          context += "  Foreign Keys:\n";
          for (const fk of fks) {
            context += `    - ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}\n`;
          }
        }
        context += "\n";
      }

      return context;
    } catch (err) {
      return `Unable to fetch complete schema: ${err}`;
    }
  }
}

