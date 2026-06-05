// Ontop config lifecycle: serializes config writes and waits for the SPARQL
// endpoint to come back after Ontop's dev-mode reloads. ensureOntopConfigured is
// the entry point. Ontop's own lifecycle (start/stop) is owned by docker compose;
// running with ONTOP_DEV_MODE=true, Ontop restarts its endpoint whenever the
// mapping/properties files change on disk, so we only need to write + wait.
import * as crypto from "crypto";
import { type DbConfig, writeOntopConfig } from "./ontop-config.js";

let currentConfigHash: string | null = null;

// Serializes config writes so concurrent queries with different mappings can't
// race against each other (and against the endpoint reload they trigger).
let ontopConfigLock: Promise<unknown> = Promise.resolve();
function withOntopLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = ontopConfigLock.then(fn, fn);
  ontopConfigLock = next.catch(() => undefined);
  return next;
}

// Gives Ontop's dev-mode file watcher time to notice the new config and begin
// cycling the endpoint, so we don't observe the old mapping as "ready".
const RELOAD_SETTLE_MS = 2000;

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
      // Write the new mapping/properties to the shared volume. Ontop dev-mode
      // detects the change and restarts its endpoint on its own — no container
      // restart from here (which would need host Docker access).
      await writeOntopConfig(r2rmlMapping, dbConfig);

      // Settle so we wait for the *reloaded* endpoint rather than catching the
      // old mapping still briefly serving before dev-mode cycles it.
      await new Promise((resolve) => setTimeout(resolve, RELOAD_SETTLE_MS));

      const isReady = await waitForOntop(ontopSparqlUrl);
      if (isReady) {
        currentConfigHash = configHash;
      }
      return isReady;
    }

    // Config unchanged: endpoint may still be initializing (lazy-init defers
    // loading until the first query), so probe and wait if needed.
    if (await isOntopReady(ontopSparqlUrl)) {
      return true;
    }

    const isReady = await waitForOntop(ontopSparqlUrl);
    if (isReady) {
      currentConfigHash = configHash;
    }
    return isReady;
  });
}
