"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ServerStatus {
  name: string;
  connected: boolean;
  error?: string;
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

interface StatusResponse {
  servers: ServerStatus[];
  database: DatabaseStatus;
  ontop: OntopStatus;
  timestamp: string;
}

// Background poll: tight enough that a stopped container surfaces within
// ~10 s without hammering the upstream health endpoints.
const POLL_INTERVAL_MS = 10_000;

/**
 * FR-01: Top-of-page connection status row.
 *
 * Shows a green/red dot per Tier 3 MCP server plus the active project's
 * database. When the database is configured but unreachable, an offline
 * banner appears warning the user that data queries are unavailable while
 * Model Interpretation mode still works.
 *
 * Refresh strategy: poll every 10 s in the background, AND immediately
 * re-poll whenever the tab regains focus or visibility (so flipping back to
 * the app after stopping a container shows the failure right away — no need
 * to refresh the page).
 */
export default function ConnectionStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Guards against state updates from a stale fetch that resolves after the
  // component has unmounted or a newer poll has already returned.
  const cancelledRef = useRef(false);
  const inFlightRef = useRef(false);

  const poll = useCallback(async () => {
    if (inFlightRef.current) return; // de-dupe overlapping polls
    inFlightRef.current = true;
    try {
      const response = await fetch("/api/servers/status", { cache: "no-store" });
      if (!response.ok) {
        if (!cancelledRef.current) setIsLoading(false);
        return;
      }
      const data = (await response.json()) as StatusResponse;
      if (!cancelledRef.current) {
        setStatus(data);
        setIsLoading(false);
      }
    } catch {
      if (!cancelledRef.current) setIsLoading(false);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    const handleFocus = () => void poll();
    const handleOnline = () => void poll();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [poll]);

  if (isLoading || !status) {
    return (
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-400">
        <StatusDot connected={null} />
        <span>Checking services…</span>
      </div>
    );
  }

  const modelServer = status.servers.find((s) => s.name === "Model Interpretation");
  const queryServer = status.servers.find((s) => s.name === "Database Query");
  const db = status.database;
  const ontop = status.ontop;

  const dbConfiguredButOffline = db.configured && !db.connected;
  const ontopOffline = !ontop?.connected;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-600">
        <StatusBadge
          label="Model Server"
          connected={modelServer?.connected ?? false}
          error={modelServer?.error}
        />
        <StatusBadge
          label="Query Server"
          connected={queryServer?.connected ?? false}
          error={queryServer?.error}
        />
        <StatusBadge
          label={db.configured ? `Database${db.name ? ` (${db.name})` : ""}` : "Database"}
          connected={db.configured ? db.connected : null}
          error={db.error}
          neutralText={db.configured ? undefined : "Not configured"}
        />
        <StatusBadge
          label="Ontop"
          connected={ontop?.connected ?? false}
          error={ontop?.error}
        />
      </div>

      {dbConfiguredButOffline && (
        <div
          role="alert"
          className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700"
        >
          <span className="font-semibold">Database Disconnected:</span>{" "}
          Unable to reach the target database
          {db.error ? <span className="text-red-600"> ({db.error})</span> : null}.{" "}
          Only Model Interpretation mode is available — data queries are disabled until
          the connection is restored.
        </div>
      )}

      {ontopOffline && (
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800"
        >
          <span className="font-semibold">Ontop Offline:</span>{" "}
          The SPARQL/OBDA engine is not reachable
          {ontop?.error ? (
            <span className="text-amber-700"> ({ontop.error})</span>
          ) : null}
          . OBDA queries that translate the ontology to SQL will fail until the
          Ontop Docker container is started. Try{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">
            docker compose up -d ontop
          </code>{" "}
          from the project root.
        </div>
      )}
    </>
  );
}

function StatusBadge({
  label,
  connected,
  error,
  neutralText,
}: {
  label: string;
  connected: boolean | null;
  error?: string;
  neutralText?: string;
}) {
  const titleParts = [label];
  if (connected === true) titleParts.push("Online");
  else if (connected === false) titleParts.push(error ? `Offline: ${error}` : "Offline");
  else titleParts.push(neutralText ?? "Unknown");

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={titleParts.join(" — ")}
    >
      <StatusDot connected={connected} />
      <span className="text-gray-700">{label}</span>
      {connected === null && neutralText && (
        <span className="text-gray-400">· {neutralText}</span>
      )}
    </span>
  );
}

function StatusDot({ connected }: { connected: boolean | null }) {
  const color =
    connected === true
      ? "bg-green-500"
      : connected === false
      ? "bg-red-500"
      : "bg-gray-300";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      aria-hidden="true"
    />
  );
}
