import pg from "pg";

export interface TargetDbCreds {
  db_type: string;
  db_host: string;
  db_port?: string | number;
  db_database: string;
  db_user?: string;
  db_password?: string;
  db_ssl?: boolean;
}

/**
 * Validates the required fields + PostgreSQL-only guard shared by the target-database
 * routes (test-connection, get-schema). Returns an error string (caller responds 400)
 * or the validated credentials. `featureLabel` personalizes the unsupported-type message.
 */
export function validateTargetDbCreds(
  body: Record<string, unknown>,
  featureLabel: string
): { error: string } | { creds: TargetDbCreds } {
  const db_type = body.db_type;
  const db_host = body.db_host;
  const db_database = body.db_database;

  if (!db_type) return { error: "Database type is required" };
  if (!db_host) return { error: "Host is required" };
  if (!db_database) return { error: "Database name is required" };

  if (db_type !== "postgresql") {
    return {
      error: `${featureLabel} is only supported for PostgreSQL currently. Got: ${String(db_type)}`,
    };
  }

  return {
    creds: {
      db_type: db_type as string,
      db_host: db_host as string,
      db_port: body.db_port as string | number | undefined,
      db_database: db_database as string,
      db_user: body.db_user as string | undefined,
      db_password: body.db_password as string | undefined,
      db_ssl: body.db_ssl as boolean | undefined,
    },
  };
}

/** Builds a single-connection pg.Pool for the target database from validated credentials. */
export function createTargetPool(creds: TargetDbCreds): pg.Pool {
  return new pg.Pool({
    host: creds.db_host,
    port: creds.db_port ? parseInt(String(creds.db_port), 10) : 5432,
    database: creds.db_database,
    user: creds.db_user || undefined,
    password: creds.db_password || undefined,
    ssl: creds.db_ssl ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 10000,
  });
}
