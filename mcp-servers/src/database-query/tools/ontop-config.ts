// Ontop configuration: validates DB credentials and writes the .properties + mapping.ttl
// files that the Ontop container reads. Consumed by ontop-lifecycle.ts.
import * as fs from "fs/promises";
import * as path from "path";
import { config } from "../config.js";
import { log } from "../../shared/logger.js";

const ONTOP_INPUT_DIR = config.ontopInputDir;
const PROPERTIES_FILE = path.join(ONTOP_INPUT_DIR, "ontop.properties");
const MAPPING_FILE = path.join(ONTOP_INPUT_DIR, "mapping.ttl");

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

// Blocks cloud metadata, link-local, loopback, and broadcast ranges.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^169\.254\./,            // link-local incl. 169.254.169.254 (cloud metadata)
  /^0\./,                   // 0.0.0.0/8
  /^255\.255\.255\.255$/,   // broadcast
  /^fe80:/i,                // IPv6 link-local
  /^fd[0-9a-f]{2}:/i,       // IPv6 ULA
  /^::1$/,                  // IPv6 loopback
];

// DNS label or IPv4 dotted-quad — rejects JDBC-meta chars before URL interpolation.
const HOSTNAME_RE = /^[A-Za-z0-9.\-_]{1,253}$/;

// Validates host/port/database/user/password before they are interpolated into the Ontop .properties file.
function validateDbConfig(dbConfig: DbConfig): void {
  const host = (dbConfig.host || "localhost").trim();
  if (!HOSTNAME_RE.test(host)) {
    throw new Error(`Invalid database host: ${JSON.stringify(host)}`);
  }
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new Error(`Database host is in a blocked range: ${host}`);
  }

  const port = dbConfig.port ?? 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid database port: ${port}`);
  }

  // Reject anything that could break the JDBC URL or properties key=value parsing.
  for (const [field, value] of [
    ["database", dbConfig.database ?? "postgres"],
    ["user", dbConfig.user ?? "postgres"],
  ] as const) {
    if (typeof value !== "string" || value.length === 0 || value.length > 128) {
      throw new Error(`Invalid ${field}: must be 1-128 chars`);
    }
    if (/[\r\n\t\0?#&=;\\/]/.test(value)) {
      throw new Error(`Invalid character in ${field}`);
    }
  }

  // Newlines/null break .properties parsing.
  const password = dbConfig.password ?? "";
  if (typeof password !== "string" || password.length > 512) {
    throw new Error("Invalid password: must be a string ≤512 chars");
  }
  if (/[\r\n\0]/.test(password)) {
    throw new Error("Password may not contain newlines or null bytes");
  }
}

// Escape for the RHS of a Java .properties line — defense in depth on top of validateDbConfig.
function escapePropertyValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/^[ \t]/, (m) => `\\${m}`);
}

// Builds the Ontop ontop.properties content (jdbc.url/driver/user/password) from a validated DbConfig.
export function buildPropertiesContent(dbConfig: DbConfig): string {
  validateDbConfig(dbConfig);

  let host = dbConfig.host || "localhost";
  const port = dbConfig.port || 5432;
  const database = dbConfig.database || "postgres";
  const user = dbConfig.user || "postgres";
  const password = dbConfig.password || "";

  if (host === "localhost" || host === "127.0.0.1") {
    host = "host.docker.internal";
  }

  // Defense-in-depth read-only on the Ontop JDBC path (%20 = space);
  // pairs with the chatbot_ro role (scripts/create-readonly-role.sql).
  const params: string[] = [];
  if (dbConfig.ssl) params.push("sslmode=require");
  params.push("options=-c%20default_transaction_read_only=on");
  const query = `?${params.join("&")}`;

  return [
    `jdbc.url=jdbc:postgresql://${host}:${port}/${database}${query}`,
    `jdbc.driver=org.postgresql.Driver`,
    `jdbc.user=${escapePropertyValue(user)}`,
    `jdbc.password=${escapePropertyValue(password)}`,
  ].join("\n");
}

export async function writeOntopConfig(
  r2rmlMapping: string,
  dbConfig: DbConfig
): Promise<void> {
  await fs.mkdir(ONTOP_INPUT_DIR, { recursive: true });

  const propertiesContent = buildPropertiesContent(dbConfig);
  await fs.writeFile(PROPERTIES_FILE, propertiesContent, "utf-8");
  await fs.writeFile(MAPPING_FILE, r2rmlMapping, "utf-8");

  log.info(`[Ontop] Config written`);
}
