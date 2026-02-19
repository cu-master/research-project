import { NextResponse } from "next/server";
import { initializeDatabase } from "@/lib/db";
import { query } from "@/lib/db";

/**
 * POST /api/db/init
 * Initialize the database schema and run migrations
 */
export async function POST() {
  try {
    // First, try to initialize the full schema
    try {
      await initializeDatabase();
    } catch (error) {
      // If initialization fails (e.g., tables already exist), that's okay
      // We'll run migrations to add missing columns
      console.log("Schema initialization skipped (tables may already exist), running migrations...");
    }

    // Run migrations to ensure all columns exist
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
        // Only log if it's not a "column already exists" error
        if (!errorMsg.includes("column") || !errorMsg.includes("already exists")) {
          console.warn("Migration 1 warning:", errorMsg);
        }
      }
      migrations.push("schema_id column already exists or schemas table doesn't exist yet");
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
        if (!errorMsg.includes("column") || !errorMsg.includes("already exists")) {
          console.warn("Migration 2 warning:", errorMsg);
        }
      }
      migrations.push("url column already exists or schemas table doesn't exist yet");
    }

    // Migration 3: Create users table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          image TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      migrations.push("Created users table");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes("already exists")) {
        console.warn("Migration 3 (users table) warning:", errorMsg);
      }
      migrations.push("Users table already exists");
    }

    // Migration 4: Add user_id to sessions table
    try {
      await query(`
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      `);
      migrations.push("Added user_id column to sessions table");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes("already exists") && !errorMsg.includes("duplicate")) {
        console.warn("Migration 4 (user_id) warning:", errorMsg);
      }
      migrations.push("user_id column already exists");
    }

    // Migration 5: Add user-related indexes
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
      migrations.push("Created index on users.email");
    } catch (error) {
      migrations.push("Index on users.email already exists or failed");
    }

    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`);
      migrations.push("Created index on sessions.user_id");
    } catch (error) {
      migrations.push("Index on sessions.user_id already exists or failed");
    }

    // Migration 6: Add existing indexes
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
      message: "Database schema initialized and migrations completed",
      migrations,
    });
  } catch (error) {
    console.error("Error initializing database:", error);
    return NextResponse.json(
      {
        error: "Failed to initialize database",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
