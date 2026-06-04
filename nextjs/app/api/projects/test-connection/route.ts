import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import pg from "pg";
import { validateTargetDbCreds, createTargetPool } from "@/lib/db/target-connection";

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
    const validation = validateTargetDbCreds(body, "Test connection");
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const pool = createTargetPool(validation.creds);

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
