import { Pool, QueryResult, QueryResultRow } from "pg";

// Database connection pool
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
        "Please set it to your PostgreSQL connection string (e.g., postgresql://user:password@localhost:5432/dbname)"
      );
    }

    pool = new Pool({
      connectionString,
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    pool.on("error", (err: Error) => {
      console.error("Unexpected error on idle database client", err);
    });
  }

  return pool;
}

// Initialize database schema
export async function initializeDatabase(): Promise<void> {
  const pool = getPool();
  const fs = await import("fs/promises");
  const path = await import("path");
  
  const schemaPath = path.join(process.cwd(), "lib", "db", "schema.sql");
  const schemaSQL = await fs.readFile(schemaPath, "utf-8");
  
  // Execute schema SQL
  await pool.query(schemaSQL);
  console.log("Database schema initialized successfully");
}

// Helper function to execute queries with error handling
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  try {
    const result = await pool.query<T>(text, params);
    return result;
  } catch (error) {
    console.error("Database query error:", error);
    console.error("Query:", text);
    console.error("Params:", params);
    throw error;
  }
}

