import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import pg from "pg";

/**
 * POST /api/projects/get-schema
 * Retrieve the database schema (tables, columns, types, constraints) from the
 * target database using the provided credentials.
 *
 * Body: { db_type, db_host, db_port, db_database, db_user, db_password, db_ssl }
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { db_type, db_host, db_port, db_database, db_user, db_password, db_ssl } = body;

    if (!db_type) {
      return NextResponse.json({ error: "Database type is required" }, { status: 400 });
    }
    if (!db_host) {
      return NextResponse.json({ error: "Host is required" }, { status: 400 });
    }
    if (!db_database) {
      return NextResponse.json({ error: "Database name is required" }, { status: 400 });
    }

    if (db_type !== "postgresql") {
      return NextResponse.json(
        { error: `Schema retrieval is only supported for PostgreSQL currently. Got: ${db_type}` },
        { status: 400 }
      );
    }

    const pool = new pg.Pool({
      host: db_host,
      port: db_port ? parseInt(String(db_port), 10) : 5432,
      database: db_database,
      user: db_user || undefined,
      password: db_password || undefined,
      ssl: db_ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    let client: pg.PoolClient | null = null;
    try {
      client = await pool.connect();

      // 1. Get all tables in public schema
      const tablesResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      // 2. Get columns for each table
      const columnsResult = await client.query(`
        SELECT
          c.table_name,
          c.column_name,
          c.data_type,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.is_nullable,
          c.column_default,
          c.ordinal_position
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON c.table_schema = t.table_schema AND c.table_name = t.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.ordinal_position
      `);

      // 3. Get primary keys
      const pkResult = await client.query(`
        SELECT
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name, kcu.ordinal_position
      `);

      // 4. Get foreign keys
      const fkResult = await client.query(`
        SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name
      `);

      // 5. Get unique constraints
      const uniqueResult = await client.query(`
        SELECT
          tc.table_name,
          kcu.column_name,
          tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name
      `);

      // Build primary key lookup
      const pkLookup: Record<string, Set<string>> = {};
      for (const row of pkResult.rows) {
        if (!pkLookup[row.table_name]) pkLookup[row.table_name] = new Set();
        pkLookup[row.table_name].add(row.column_name);
      }

      // Build foreign key lookup
      const fkLookup: Record<string, Record<string, { table: string; column: string; constraint: string }>> = {};
      for (const row of fkResult.rows) {
        if (!fkLookup[row.table_name]) fkLookup[row.table_name] = {};
        fkLookup[row.table_name][row.column_name] = {
          table: row.foreign_table_name,
          column: row.foreign_column_name,
          constraint: row.constraint_name,
        };
      }

      // Build unique lookup
      const uniqueLookup: Record<string, Set<string>> = {};
      for (const row of uniqueResult.rows) {
        if (!uniqueLookup[row.table_name]) uniqueLookup[row.table_name] = new Set();
        uniqueLookup[row.table_name].add(row.column_name);
      }

      // Build structured schema
      const tables = tablesResult.rows.map((t) => {
        const tableName = t.table_name;
        const columns = columnsResult.rows
          .filter((c) => c.table_name === tableName)
          .map((c) => {
            let dataType = c.data_type;
            if (c.character_maximum_length) {
              dataType += `(${c.character_maximum_length})`;
            } else if (c.numeric_precision && c.data_type === "numeric") {
              dataType += `(${c.numeric_precision},${c.numeric_scale ?? 0})`;
            }

            return {
              name: c.column_name,
              type: dataType,
              nullable: c.is_nullable === "YES",
              default: c.column_default,
              isPrimaryKey: pkLookup[tableName]?.has(c.column_name) || false,
              isUnique: uniqueLookup[tableName]?.has(c.column_name) || false,
              foreignKey: fkLookup[tableName]?.[c.column_name] || null,
            };
          });

        return { name: tableName, columns };
      });

      return NextResponse.json({
        success: true,
        database: db_database,
        tableCount: tables.length,
        tables,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: "Failed to retrieve schema", message: msg },
        { status: 400 }
      );
    } finally {
      if (client) client.release();
      await pool.end().catch(() => {});
    }
  } catch (error) {
    console.error("Error fetching schema:", error);
    return NextResponse.json({ error: "Failed to fetch schema" }, { status: 500 });
  }
}
