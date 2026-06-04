// Ontop container lifecycle: serializes config writes + container (re)starts and
// waits for the SPARQL endpoint to become ready. ensureOntopConfigured is the entry point.
import { exec } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import { config } from "../config.js";
import { type DbConfig, writeOntopConfig } from "./ontop-config.js";
import { log } from "../../shared/logger.js";

const execAsync = promisify(exec);

let currentConfigHash: string | null = null;

// Serializes config writes + container restarts so concurrent queries with
// different mappings can't race against the running container's config.
let ontopConfigLock: Promise<unknown> = Promise.resolve();
function withOntopLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = ontopConfigLock.then(fn, fn);
  ontopConfigLock = next.catch(() => undefined);
  return next;
}

async function restartOntopContainer(): Promise<void> {
  try {
    await execAsync("docker compose up -d --force-recreate ontop", {
      cwd: config.projectRoot,
    });
    log.info("[Ontop] Container recreated");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to recreate Ontop container: ${msg}`);
  }
}

async function startOntopContainer(): Promise<void> {
  try {
    await execAsync("docker compose up -d ontop", {
      cwd: config.projectRoot,
    });
    log.info("[Ontop] Container started");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start Ontop container: ${msg}`);
  }
}

function isOntopReady(ontopSparqlUrl: string): Promise<boolean> {
  const testQuery = encodeURIComponent("ASK { ?s ?p ?o }");
  return fetch(`${ontopSparqlUrl}?query=${testQuery}`, {
    method: "GET",
    headers: { Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

async function waitForOntop(
  ontopSparqlUrl: string,
  maxWaitMs = 60000,
  intervalMs = 3000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isOntopReady(ontopSparqlUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function getMappingHash(dbConfig: DbConfig, r2rmlMapping: string): string {
  const data = JSON.stringify(dbConfig) + r2rmlMapping;
  return crypto.createHash("sha256").update(data).digest("hex");
}

export async function ensureOntopConfigured(
  r2rmlMapping: string,
  dbConfig: DbConfig,
  ontopSparqlUrl: string
): Promise<boolean> {
  const configHash = getMappingHash(dbConfig, r2rmlMapping);

  return withOntopLock(async () => {
    const needsReconfigure = currentConfigHash !== configHash;

    if (needsReconfigure) {
      await writeOntopConfig(r2rmlMapping, dbConfig);

      const ready = await isOntopReady(ontopSparqlUrl);
      if (ready) {
        await restartOntopContainer();
      } else {
        await startOntopContainer();
      }

      const isReady = await waitForOntop(ontopSparqlUrl);
      if (isReady) {
        currentConfigHash = configHash;
      }
      return isReady;
    }

    if (await isOntopReady(ontopSparqlUrl)) {
      return true;
    }

    await startOntopContainer();
    const isReady = await waitForOntop(ontopSparqlUrl);
    if (isReady) {
      currentConfigHash = configHash;
    }
    return isReady;
  });
}
