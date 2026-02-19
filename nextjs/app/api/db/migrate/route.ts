import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/db/migrate
 * Run database migrations to add missing columns
 */
export async function POST() {
  try {
    const migrations = [];
    
    // Migration 1: Add schema_id to sessions table
    try {
      await query(`
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS schema_id UUID REFERENCES schemas(id) ON DELETE SET NULL;
      `);
      migrations.push("Added schema_id column to sessions table");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes("already exists") && !errorMsg.includes("duplicate")) {
        throw error;
      }
      migrations.push("schema_id column already exists in sessions table");
    }

    // Migration 2: Add url to schemas table
    try {
      await query(`
        ALTER TABLE schemas ADD COLUMN IF NOT EXISTS url TEXT;
      `);
      migrations.push("Added url column to schemas table");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes("already exists") && !errorMsg.includes("duplicate")) {
        throw error;
      }
      migrations.push("url column already exists in schemas table");
    }

    // Migration 3: Add indexes
    try {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_schema_id ON sessions(schema_id);
      `);
      migrations.push("Created index on sessions.schema_id");
    } catch (error) {
      migrations.push("Index on sessions.schema_id already exists or failed");
    }

    try {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_schemas_url ON schemas(url);
      `);
      migrations.push("Created index on schemas.url");
    } catch (error) {
      migrations.push("Index on schemas.url already exists or failed");
    }

    return NextResponse.json({
      success: true,
      message: "Database migrations completed",
      migrations,
    });
  } catch (error) {
    console.error("Error running migrations:", error);
    return NextResponse.json(
      {
        error: "Failed to run migrations",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
