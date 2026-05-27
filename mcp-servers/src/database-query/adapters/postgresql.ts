import pg from "pg";
import type { Constraint, DatabaseType, ForeignKey, PostgreSQLConfig, QueryResult, TableColumn, TableInfo } from "../types.js";
import type { DatabaseAdapter } from "./interface.js";

export class PostgreSQLAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = "postgresql";
  private pool: pg.Pool | null = null;
  private config: PostgreSQLConfig;

  constructor(config: PostgreSQLConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool) return;

    if (!this.config.host) {
      throw new Error("PostgreSQL host is required");
    }
    if (!this.config.database) {
      throw new Error("PostgreSQL database name is required");
    }
    if (!this.config.user) {
      throw new Error("PostgreSQL user is required");
    }
    // Password may be empty for local peer/trust auth.

    this.pool = new pg.Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    let client: pg.PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query("SELECT 1");
    } catch (error) {
      if (this.pool) {
        await this.pool.end().catch(() => {});
        this.pool = null;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to connect to PostgreSQL database "${this.config.database}" at ${this.config.host}:${this.config.port}. ` +
        `Error: ${errorMessage}. ` +
        `Please check: 1) PostgreSQL is running, 2) Connection details are correct, 3) Network/firewall settings.`
      );
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  isConnected(): boolean {
    return this.pool !== null;
  }

  private getPool(): pg.Pool {
    if (!this.pool) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.pool;
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    try {
      const pool = this.getPool();
      const result = await pool.query(sql);
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
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
    const pool = this.getPool();
    const viewCondition = includeViews ? "" : "AND table_type = 'BASE TABLE'";
    const query = `
      SELECT table_name, table_schema, table_type
      FROM information_schema.tables
      WHERE table_schema = $1 ${viewCondition}
      ORDER BY table_type, table_name
    `;
    const result = await pool.query(query, [schemaName]);
    return result.rows;
  }

  async getTableColumns(tableName: string, schemaName = "public"): Promise<TableColumn[]> {
    const pool = this.getPool();
    const query = `
      SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;
    const result = await pool.query(query, [schemaName, tableName]);
    return result.rows;
  }

  async getTableForeignKeys(tableName: string, schemaName = "public"): Promise<ForeignKey[]> {
    const pool = this.getPool();
    const query = `
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
        AND tc.table_schema = $1
        AND tc.table_name = $2
    `;
    const result = await pool.query(query, [schemaName, tableName]);
    return result.rows;
  }

  async getTableConstraints(tableName: string, schemaName = "public"): Promise<Constraint[]> {
    const pool = this.getPool();
    const query = `
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = $1 AND tc.table_name = $2
      ORDER BY tc.constraint_type, tc.constraint_name
    `;
    const result = await pool.query(query, [schemaName, tableName]);
    return result.rows;
  }

  async buildSchemaContext(): Promise<string> {
    let context = "DATABASE SCHEMA (PostgreSQL):\n\n";

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

