// Shared types, constants, and helpers for the project create/edit form and its sections.

export interface AlignmentResult {
  score: number;
  ontologyDomain: string;
  databaseDomain: string;
  matchedConcepts: string[];
  unmatchedOntology: string[];
  unmatchedDatabase: string[];
  recommendation: "proceed" | "warning" | "mismatch";
  summary: string;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  foreignKey: { table: string; column: string; constraint: string } | null;
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

export interface SchemaData {
  database: string;
  tableCount: number;
  tables: SchemaTable[];
}

export interface ConnectionStatus {
  type: "success" | "error";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: { level: "error" | "warning"; message: string }[];
  stats: {
    tripleCount: number;
    triplesMaps: string[];
    referencedTables: string[];
    referencedColumns: string[];
  };
}

export interface UploadedFile {
  name: string;
  size: number;
}

export const DB_TYPES = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "sqlite", label: "SQLite" },
  { value: "mssql", label: "SQL Server" },
  { value: "oracle", label: "Oracle" },
  { value: "mongodb", label: "MongoDB" },
];

export const inputClass =
  "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export const labelClass = "block text-sm font-medium text-gray-700 mb-1";

// Triggers a client-side file download of in-memory text content.
export function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Shared "what's still missing" hint for the alignment/mapping prerequisites
// (data-source content + database schema). Returns null when both are present.
export function prerequisiteMessage(hasContent: boolean, hasSchema: boolean): string | null {
  if (!hasContent && !hasSchema) return "Fetch data source content and database schema first";
  if (!hasContent) return "Fetch data source content first (Section 2)";
  if (!hasSchema) return "Fetch database schema first (Section 3)";
  return null;
}
