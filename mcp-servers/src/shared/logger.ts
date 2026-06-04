// Tiny zero-dependency leveled logger for the MCP servers.
//
// All output goes to STDERR so it can never corrupt STDOUT — which carries the JSON-RPC
// protocol in stdio mode and is reserved for data in HTTP mode. Verbosity is controlled by
// the MCP_LOG_LEVEL env var (debug | info | warn | error); default "info", so per-request
// debug traces (query/SPARQL/SQL bodies) are silent unless explicitly enabled.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  return LEVELS[(process.env.MCP_LOG_LEVEL || "info").toLowerCase() as LogLevel] ?? LEVELS.info;
}

function emit(level: LogLevel, args: unknown[]): void {
  if (LEVELS[level] < threshold()) return;
  // console.warn and console.error both write to stderr; using them (never console.log/info,
  // which go to stdout) keeps every log line off stdout.
  if (level === "warn") {
    console.warn(...args);
  } else {
    console.error(...args);
  }
}

export const log = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
