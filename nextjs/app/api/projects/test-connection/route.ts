import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import pg from "pg";

/**
 * POST /api/projects/test-connection
 * Test a database connection using the provided credentials.
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
      return NextResponse.json(
        { error: "Database type is required" },
        { status: 400 }
      );
    }
    if (!db_host) {
      return NextResponse.json(
        { error: "Host is required" },
        { status: 400 }
      );
    }
    if (!db_database) {
      return NextResponse.json(
        { error: "Database name is required" },
        { status: 400 }
      );
    }

    // Currently only PostgreSQL is supported for test connections
    if (db_type !== "postgresql") {
      return NextResponse.json(
        { error: `Test connection is only supported for PostgreSQL currently. Got: ${db_type}` },
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
      const result = await client.query(
        "SELECT current_database() AS db, current_user AS usr, version() AS ver"
      );
      const row = result.rows[0];

      return NextResponse.json({
        success: true,
        message: `Connected to "${row.db}" as ${row.usr}`,
        details: {
          database: row.db,
          user: row.usr,
          version: row.ver,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          success: false,
          error: "Connection failed",
          message: msg,
        },
        { status: 400 }
      );
    } finally {
      if (client) client.release();
      await pool.end().catch(() => {});
    }
  } catch (error) {
    console.error("Error testing connection:", error);
    return NextResponse.json(
      { error: "Failed to test connection" },
      { status: 500 }
    );
  }
}
