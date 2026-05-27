import { NextResponse } from "next/server";
import pg from "pg";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getDefaultProjectId } from "@/lib/db/users";
import { getProject } from "@/lib/db/projects";

const MODEL_INTERPRETATION_BASE_URL =
  process.env.MODEL_INTERPRETATION_URL || "http://localhost:3001";

const DATABASE_QUERY_BASE_URL =
  process.env.DATABASE_QUERY_URL || "http://localhost:3002";

const ONTOP_SPARQL_URL =
  process.env.ONTOP_SPARQL_URL || "http://localhost:8080/sparql";

interface ServerStatus {
  name: string;
  url: string;
  connected: boolean;
  error?: string;
  version?: string;
  details?: Record<string, unknown>;
}

interface DatabaseStatus {
  configured: boolean;
  connected: boolean;
  name?: string;
  error?: string;
}

interface OntopStatus {
  connected: boolean;
  url: string;
  error?: string;
}

async function checkServerHealth(
  name: string,
  url: string
): Promise<ServerStatus> {
  try {
    const healthUrl = `${url}/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store", // Prevent caching
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        name,
        url,
        connected: true,
        version: data.version,
        details: data,
      };
    } else {
      return {
        name,
        url,
        connected: false,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    // Handle connection refused, timeout, and other network errors
    let errorMessage = "Connection failed";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "Timeout";
      } else if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
        errorMessage = "Connection refused";
      } else {
        errorMessage = error.message;
      }
    }

    return {
      name,
      url,
      connected: false,
      error: errorMessage,
    };
  }
}

/**
 * FR-01: ping the Ontop SPARQL endpoint with the standard "ASK { ?s ?p ?o }"
 * probe. Ontop runs as a separate Docker container (see docker-compose.yml)
 * and is required for any OBDA query — so it gets its own indicator.
 */
async function checkOntopHealth(): Promise<OntopStatus> {
  const probeQuery = encodeURIComponent("ASK { ?s ?p ?o }");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${ONTOP_SPARQL_URL}?query=${probeQuery}`, {
      method: "GET",
      headers: { Accept: "application/sparql-results+json" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      return { connected: true, url: ONTOP_SPARQL_URL };
    }
    return {
      connected: false,
      url: ONTOP_SPARQL_URL,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    let msg = "Connection failed";
    if (error instanceof Error) {
      if (error.name === "AbortError") msg = "Timeout";
      else if (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed")
      ) {
        msg = "Container not running";
      } else msg = error.message;
    }
    return { connected: false, url: ONTOP_SPARQL_URL, error: msg };
  }
}

/**
 * FR-01: ping the project's database with a lightweight "SELECT 1".
 * Returns connected=false with a user-friendly error on any failure so the UI
 * can show the "Database Disconnected" banner and disable query features.
 */
async function checkDatabaseHealth(userId: string): Promise<DatabaseStatus> {
  let projectId: string | null = null;
  try {
    projectId = await getDefaultProjectId(userId);
  } catch {
    return { configured: false, connected: false, error: "Could not load default project" };
  }
  if (!projectId) {
    return { configured: false, connected: false };
  }

  const project = await getProject(projectId, userId);
  if (!project || !project.db_host || !project.db_database) {
    return { configured: false, connected: false };
  }
  if (project.db_type && project.db_type !== "postgresql") {
    return {
      configured: true,
      connected: false,
      name: project.db_database,
      error: `Health check only supports PostgreSQL (got ${project.db_type})`,
    };
  }

  const pool = new pg.Pool({
    host: project.db_host,
    port: project.db_port ?? 5432,
    database: project.db_database,
    user: project.db_user ?? undefined,
    password: project.db_password ?? undefined,
    ssl: project.db_ssl ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 3000,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { configured: true, connected: true, name: project.db_database };
    } finally {
      client.release();
    }
  } catch (error) {
    let msg = "Connection failed";
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) msg = "Connection refused";
      else if (error.message.includes("timeout")) msg = "Timeout";
      else msg = error.message;
    }
    return { configured: true, connected: false, name: project.db_database, error: msg };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function GET() {
  try {
    const userId = await getAuthUserId();
    const databasePromise: Promise<DatabaseStatus> = userId
      ? checkDatabaseHealth(userId)
      : Promise.resolve({ configured: false, connected: false });

    const [modelInterpretation, databaseQuery, database, ontop] = await Promise.all([
      checkServerHealth("Model Interpretation", MODEL_INTERPRETATION_BASE_URL),
      checkServerHealth("Database Query", DATABASE_QUERY_BASE_URL),
      databasePromise,
      checkOntopHealth(),
    ]);

    return NextResponse.json(
      {
        servers: [modelInterpretation, databaseQuery],
        database,
        ontop,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (error) {
    console.error("Error checking server status:", error);
    return NextResponse.json(
      {
        servers: [
          {
            name: "Model Interpretation",
            url: MODEL_INTERPRETATION_BASE_URL,
            connected: false,
            error: "Failed to check status",
          },
          {
            name: "Database Query",
            url: DATABASE_QUERY_BASE_URL,
            connected: false,
            error: "Failed to check status",
          },
        ],
        database: { configured: false, connected: false, error: "Failed to check status" },
        ontop: {
          connected: false,
          url: ONTOP_SPARQL_URL,
          error: "Failed to check status",
        },
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  }
}
