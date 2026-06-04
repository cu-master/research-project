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

    // Defense-in-depth: force every pooled connection read-only at the
    // session level, so writes are rejected even if the configured credentials
    // are not the dedicated chatbot_ro role. The role-level guarantee (see
    // scripts/create-readonly-role.sql) is the primary, database-level control.
    this.pool.on("connect", (client) => {
      client.query("SET default_transaction_read_only = on").catch(() => {});
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

  // Not on the production query path — live queries run through SPARQL/Ontop (see obda-handler.ts).
  // Retained as the harness for the NFR-01 read-only integration tests (postgresql.integration.test.ts),
  // which prove the database rejects writes at the DB-user level.
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

}

