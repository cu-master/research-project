import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import type { Project } from "@/lib/db/projects";

const execAsync = promisify(exec);

const ONTOP_INPUT_DIR = path.resolve(process.cwd(), "..", "ontop", "input");
const PROPERTIES_FILE = path.join(ONTOP_INPUT_DIR, "ontop.properties");
const MAPPING_FILE = path.join(ONTOP_INPUT_DIR, "mapping.ttl");

const ONTOP_SPARQL_URL =
  process.env.ONTOP_SPARQL_URL || "http://localhost:8080/sparql";

let currentProjectId: string | null = null;

/**
 * Generate the JDBC properties file content for Ontop from a project's DB config.
 */
function buildPropertiesContent(project: Project): string {
  let host = project.db_host || "localhost";
  const port = project.db_port || 5432;
  const database = project.db_database || "postgres";
  const user = project.db_user || "postgres";
  const password = project.db_password || "";

  if (host === "localhost" || host === "127.0.0.1") {
    host = "host.docker.internal";
  }

  const sslParam = project.db_ssl ? "?sslmode=require" : "";

  return [
    `jdbc.url=jdbc:postgresql://${host}:${port}/${database}${sslParam}`,
    `jdbc.driver=org.postgresql.Driver`,
    `jdbc.user=${user}`,
    `jdbc.password=${password}`,
  ].join("\n");
}

/**
 * Write Ontop configuration files (ontop.properties and mapping.ttl)
 * from the given project's database connection info and R2RML mapping.
 */
export async function writeOntopConfig(project: Project): Promise<void> {
  if (!project.r2rml_mapping || !project.r2rml_mapping.trim()) {
    throw new Error(
      `Project "${project.name}" has no R2RML mapping. Generate one first using the generate_r2rml_mapping tool.`
    );
  }

  if (!project.db_host) {
    throw new Error(
      `Project "${project.name}" has no database connection configured.`
    );
  }

  await fs.mkdir(ONTOP_INPUT_DIR, { recursive: true });

  const propertiesContent = buildPropertiesContent(project);
  await fs.writeFile(PROPERTIES_FILE, propertiesContent, "utf-8");

  await fs.writeFile(MAPPING_FILE, project.r2rml_mapping, "utf-8");

  console.log(
    `[Ontop] Config written for project "${project.name}" (${project.id})`
  );
}

/**
 * Restart the Ontop Docker container so it picks up new config files.
 */
export async function restartOntopContainer(): Promise<void> {
  try {
    const projectRoot = path.resolve(process.cwd(), "..");
    await execAsync("docker compose restart ontop", { cwd: projectRoot });
    console.log("[Ontop] Container restarted");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to restart Ontop container: ${msg}`);
  }
}

/**
 * Start the Ontop Docker container if it is not already running.
 */
export async function startOntopContainer(): Promise<void> {
  try {
    const projectRoot = path.resolve(process.cwd(), "..");
    await execAsync("docker compose up -d ontop", { cwd: projectRoot });
    console.log("[Ontop] Container started");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start Ontop container: ${msg}`);
  }
}

/**
 * Check whether the Ontop SPARQL endpoint is reachable and healthy.
 */
export async function isOntopReady(): Promise<boolean> {
  try {
    const testQuery = encodeURIComponent("ASK { ?s ?p ?o }");
    const response = await fetch(`${ONTOP_SPARQL_URL}?query=${testQuery}`, {
      method: "GET",
      headers: { Accept: "application/sparql-results+json" },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for the Ontop endpoint to become ready, polling at intervals.
 * Returns true if ready within the timeout, false otherwise.
 */
async function waitForOntop(
  maxWaitMs: number = 60000,
  intervalMs: number = 3000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isOntopReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Ensure Ontop is configured and running for the given project.
 * Writes config files and restarts the container only if the project has changed.
 * Returns true if Ontop is ready, false otherwise.
 */
export async function ensureOntopConfigured(
  project: Project
): Promise<boolean> {
  const needsReconfigure = currentProjectId !== project.id;

  if (needsReconfigure) {
    await writeOntopConfig(project);

    const ready = await isOntopReady();
    if (ready) {
      await restartOntopContainer();
    } else {
      await startOntopContainer();
    }

    const isReady = await waitForOntop();
    if (isReady) {
      currentProjectId = project.id;
    }
    return isReady;
  }

  if (await isOntopReady()) {
    return true;
  }

  await writeOntopConfig(project);
  await startOntopContainer();
  const isReady = await waitForOntop();
  if (isReady) {
    currentProjectId = project.id;
  }
  return isReady;
}
