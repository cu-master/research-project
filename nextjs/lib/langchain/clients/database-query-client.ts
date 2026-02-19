import { DATABASE_QUERY_BASE_URL } from "../config";
import { McpToolResponse } from "../types";

// Track which project databases have been registered in this process lifetime
const registeredDatabases = new Set<string>();

/**
 * Ensure a project's database is registered and connected on the MCP server.
 * Uses the project ID as the database ID. Skips if already registered.
 */
export async function ensureProjectDatabase(project: {
  id: string;
  db_type: string | null;
  db_name: string | null;
  db_host: string | null;
  db_port: number | null;
  db_database: string | null;
  db_user: string | null;
  db_password: string | null;
  db_ssl: boolean;
}): Promise<string | null> {
  if (!project.db_type || !project.db_host || !project.db_database || !project.db_user) {
    return null;
  }

  const dbId = `project_${project.id}`;

  if (registeredDatabases.has(dbId)) {
    return dbId;
  }

  const url = `${DATABASE_QUERY_BASE_URL}/databases`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: dbId,
        name: project.db_name || `Project DB`,
        type: project.db_type,
        host: project.db_host,
        port: project.db_port || 5432,
        database: project.db_database,
        user: project.db_user,
        password: project.db_password || "",
        ssl: project.db_ssl ?? false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DB Client] Failed to register database: ${errorText}`);
      return null;
    }

    registeredDatabases.add(dbId);
    return dbId;
  } catch (error) {
    console.error("[DB Client] Failed to register project database:", error);
    return null;
  }
}

export async function callDatabaseQueryTool(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const url = `${DATABASE_QUERY_BASE_URL}/mcp/call-tool`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: toolName, arguments: args }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const result = (await response.json()) as McpToolResponse;

    if (result.isError) {
      const message = result.content?.[0]?.text || `Database Query tool "${toolName}" failed`;
      throw new Error(message);
    }

    if (Array.isArray(result.content) && result.content.length > 0) {
      return result.content
        .map((item) => {
          if (item?.type === "text" && typeof item.text === "string") {
            return item.text;
          }
          return JSON.stringify(item);
        })
        .join("\n\n");
    }

    if (result.structuredContent) {
      return typeof result.structuredContent === "string"
        ? result.structuredContent
        : JSON.stringify(result.structuredContent, null, 2);
    }

    return "Tool executed successfully but returned no content.";
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to Database Query MCP server at ${DATABASE_QUERY_BASE_URL}. Make sure the server is running.`
        );
      }
      throw error;
    }
    throw new Error(`Unknown error calling tool "${toolName}": ${error}`);
  }
}

