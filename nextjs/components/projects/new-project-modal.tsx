"use client";

import { useState, useEffect, useRef } from "react";

export interface ProjectData {
  id: string;
  name: string;
  urls: string[];
  content: string;
  db_type: string | null;
  db_name: string | null;
  db_host: string | null;
  db_port: number | null;
  db_database: string | null;
  db_user: string | null;
  db_password: string | null;
  db_ssl: boolean;
  db_schema: Record<string, unknown> | null;
  r2rml_mapping: string | null;
  alignment_result?: any;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  project?: ProjectData | null;
}

const DB_TYPES = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "sqlite", label: "SQLite" },
  { value: "mssql", label: "SQL Server" },
  { value: "oracle", label: "Oracle" },
  { value: "mongodb", label: "MongoDB" },
];

export default function ProjectModal({
  isOpen,
  onClose,
  onSaved,
  project,
}: ProjectModalProps) {
  const r2rmlFileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = !!project;

  // Section 1: Project Name
  const [name, setName] = useState("");

  // Section 2: URLs
  const [urls, setUrls] = useState<string[]>([""]);

  // Section 3: Database
  const [dbType, setDbType] = useState("");
  const [dbName, setDbName] = useState("");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbUser, setDbUser] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbSsl, setDbSsl] = useState(false);

  // Fetched content state (merged plain text from all URLs)
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);

  // Form state
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [contentStatus, setContentStatus] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isFetchingSchema, setIsFetchingSchema] = useState(false);
  const [schemaData, setSchemaData] = useState<{
    database: string;
    tableCount: number;
    tables: {
      name: string;
      columns: {
        name: string;
        type: string;
        nullable: boolean;
        default: string | null;
        isPrimaryKey: boolean;
        isUnique: boolean;
        foreignKey: { table: string; column: string; constraint: string } | null;
      }[];
    }[];
  } | null>(null);
  const [schemaError, setSchemaError] = useState("");

  // Section 4: Alignment Check & R2RML Mapping
  const [alignmentResult, setAlignmentResult] = useState<{
    score: number;
    ontologyDomain: string;
    databaseDomain: string;
    matchedConcepts: string[];
    unmatchedOntology: string[];
    unmatchedDatabase: string[];
    recommendation: "proceed" | "warning" | "mismatch";
    summary: string;
  } | null>(null);
  const [isCheckingAlignment, setIsCheckingAlignment] = useState(false);
  const [alignmentError, setAlignmentError] = useState("");

  const [r2rmlMapping, setR2rmlMapping] = useState<string | null>(null);
  const [isGeneratingMapping, setIsGeneratingMapping] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    issues: { level: "error" | "warning"; message: string }[];
    stats: {
      tripleCount: number;
      triplesMaps: string[];
      referencedTables: string[];
      referencedColumns: string[];
    };
  } | null>(null);

  const [error, setError] = useState("");

  // Populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (project) {
        setName(project.name || "");
        setUrls(project.urls && project.urls.length > 0 ? [...project.urls] : [""]);
        setDbType(project.db_type || "");
        setDbName(project.db_name || "");
        setDbHost(project.db_host || "");
        setDbPort(project.db_port != null ? String(project.db_port) : "");
        setDbDatabase(project.db_database || "");
        setDbUser(project.db_user || "");
        setDbPassword(project.db_password || "");
        setDbSsl(project.db_ssl || false);
        setSchemaData(
          project.db_schema
            ? (project.db_schema as typeof schemaData)
            : null
        );
        setR2rmlMapping(project.r2rml_mapping || null);
        setAlignmentResult(project.alignment_result || null);
      } else {
        setName("");
        setUrls([""]);
        setDbType("");
        setDbName("");
        setDbHost("");
        setDbPort("");
        setDbDatabase("");
        setDbUser("");
        setDbPassword("");
        setDbSsl(false);
        setSchemaData(null);
        setR2rmlMapping(null);
      }
      setError("");
      setContentStatus("");
      setConnectionStatus(null);
      setSchemaError("");
      setAlignmentError("");
      setIsCheckingAlignment(false);
      setMappingError("");
      setValidationResult(null);
      setFetchedContent(project?.content || null);
      // Note: schemaData is set inside the if/else branches above;
      // do NOT reset it here or it will overwrite the project value.
    }
  }, [isOpen, project]);

  // Prevent Escape key from closing the modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) e.preventDefault();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleCheckAlignment = async () => {
    if (!fetchedContent || !schemaData) return;

    setIsCheckingAlignment(true);
    setAlignmentError("");
    setAlignmentResult(null);

    try {
      const response = await fetch("/api/projects/check-alignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ontologyContent: fetchedContent,
          dbSchema: schemaData,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setAlignmentError(data.error || data.message || "Failed to check alignment");
      } else {
        const result = {
          score: data.score,
          ontologyDomain: data.ontologyDomain,
          databaseDomain: data.databaseDomain,
          matchedConcepts: data.matchedConcepts,
          unmatchedOntology: data.unmatchedOntology,
          unmatchedDatabase: data.unmatchedDatabase,
          recommendation: data.recommendation,
          summary: data.summary,
        };
        setAlignmentResult(result);
        
        // Auto-save alignment result if editing an existing project
        if (isEditing && project) {
          try {
            await fetch(`/api/projects/${project.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ alignment_result: result }),
            });
          } catch {
            // Silently fail
          }
        }
      }
    } catch (err) {
      setAlignmentError(err instanceof Error ? err.message : "Alignment check failed");
    } finally {
      setIsCheckingAlignment(false);
    }
  };

  // Backdrop click intentionally does NOT close the modal
  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const addUrlField = () => setUrls([...urls, ""]);
  const removeUrlField = (index: number) => {
    if (urls.length > 1) {
      setUrls(urls.filter((_, i) => i !== index));
    }
  };
  const updateUrl = (index: number, value: string) => {
    const updated = [...urls];
    updated[index] = value;
    setUrls(updated);
  };

  const handleGetContent = async () => {
    const validUrls = urls.filter((u) => u.trim());
    if (validUrls.length === 0) {
      setError("Add at least one URL before fetching content.");
      return;
    }

    setIsFetchingContent(true);
    setContentStatus("");
    setError("");
    setAlignmentResult(null);
    setAlignmentError("");

    try {
      let response: Response;

      if (isEditing && project) {
        // Edit mode: call the project-specific endpoint (also stores in DB)
        response = await fetch(`/api/projects/${project.id}/get-content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: validUrls }),
        });
      } else {
        // Create mode: call the standalone fetch endpoint
        response = await fetch("/api/projects/fetch-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: validUrls }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to fetch content");
      }

      // Store the merged plain-text content for inclusion in the create/update payload
      if (data.mergedContent) {
        setFetchedContent(data.mergedContent);
      }

      setContentStatus(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch content");
    } finally {
      setIsFetchingContent(false);
    }
  };

  const handleTestConnection = async () => {
    if (!dbType || !dbHost || !dbDatabase) {
      setConnectionStatus({
        type: "error",
        message: "Type, Host, and Database are required to test the connection.",
      });
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus(null);

    try {
      const response = await fetch("/api/projects/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_type: dbType,
          db_host: dbHost,
          db_port: dbPort || undefined,
          db_database: dbDatabase,
          db_user: dbUser || undefined,
          db_password: dbPassword || undefined,
          db_ssl: dbSsl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConnectionStatus({ type: "success", message: data.message });
      } else {
        setConnectionStatus({
          type: "error",
          message: data.message || data.error || "Connection failed",
        });
      }
    } catch (err) {
      setConnectionStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Connection test failed",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleGetSchema = async () => {
    if (!dbType || !dbHost || !dbDatabase) {
      setSchemaError("Type, Host, and Database are required to fetch the schema.");
      return;
    }

    setIsFetchingSchema(true);
    setSchemaError("");
    setSchemaData(null);
    setAlignmentResult(null);
    setAlignmentError("");

    try {
      const response = await fetch("/api/projects/get-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          db_type: dbType,
          db_host: dbHost,
          db_port: dbPort || undefined,
          db_database: dbDatabase,
          db_user: dbUser || undefined,
          db_password: dbPassword || undefined,
          db_ssl: dbSsl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSchemaData(data);

        // If editing an existing project, persist the schema immediately
        if (isEditing && project) {
          try {
            await fetch(`/api/projects/${project.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ db_schema: data }),
            });
          } catch {
            // Silently fail — schema is still shown in the UI and will be
            // included in the next full save.
          }
        }
      } else {
        setSchemaError(data.message || data.error || "Failed to fetch schema");
      }
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : "Failed to fetch schema");
    } finally {
      setIsFetchingSchema(false);
    }
  };

  const handleGenerateR2rml = async () => {
    if (!fetchedContent || !schemaData) return;

    setIsGeneratingMapping(true);
    setMappingError("");
    setR2rmlMapping(null);

    try {
      const response = await fetch("/api/projects/generate-r2rml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ontologyContent: fetchedContent,
          dbSchema: schemaData,
          projectId: isEditing ? project!.id : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMappingError(data.error || data.message || "Failed to generate R2RML mapping");
      } else {
        setR2rmlMapping(data.r2rml_mapping);
      }
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Failed to generate R2RML mapping");
    } finally {
      setIsGeneratingMapping(false);
    }
  };

  const handleValidateR2rml = async () => {
    if (!r2rmlMapping) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await fetch("/api/projects/validate-r2rml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          r2rml_mapping: r2rmlMapping,
          dbSchema: schemaData ?? undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setValidationResult({
          valid: false,
          issues: [{ level: "error", message: data.error || "Validation request failed" }],
          stats: { tripleCount: 0, triplesMaps: [], referencedTables: [], referencedColumns: [] },
        });
      } else {
        setValidationResult(data);
      }
    } catch (err) {
      setValidationResult({
        valid: false,
        issues: [{ level: "error", message: err instanceof Error ? err.message : "Validation failed" }],
        stats: { tripleCount: 0, triplesMaps: [], referencedTables: [], referencedColumns: [] },
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }

    setIsLoading(true);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      urls: urls.filter((u) => u.trim()),
      db_type: dbType || undefined,
      db_name: dbName || undefined,
      db_host: dbHost || undefined,
      db_port: dbPort || undefined,
      db_database: dbDatabase || undefined,
      db_user: dbUser || undefined,
      db_password: dbPassword || undefined,
      db_ssl: dbSsl,
    };

    // Include fetched content (merged plain text) if available
    if (fetchedContent) {
      payload.content = fetchedContent;
    }

    // Include database schema if fetched
    if (schemaData) {
      payload.db_schema = schemaData;
    }

    // Include R2RML mapping if generated
    if (r2rmlMapping) {
      payload.r2rml_mapping = r2rmlMapping;
    }

    // Include alignment result if checked
    if (alignmentResult) {
      payload.alignment_result = alignmentResult;
    }

    try {
      const url = isEditing ? `/api/projects/${project!.id}` : "/api/projects";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to ${isEditing ? "update" : "create"} project`);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Section 1: Project Name */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                1
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Project Details
              </h3>
            </div>
            <div>
              <label htmlFor="project-name" className={labelClass}>
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                required
                className={inputClass}
              />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Section 2: URLs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                2
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Data Sources
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Add URLs to data specifications or conceptual models.
            </p>
            <div className="space-y-2">
              {urls.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => updateUrl(index, e.target.value)}
                    placeholder="https://example.com/schema.json"
                    className={inputClass}
                  />
                  {urls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUrlField(index)}
                      className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Remove URL"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={addUrlField}
                  className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add another URL
                </button>

                <button
                  type="button"
                  onClick={handleGetContent}
                  disabled={isFetchingContent || urls.every((u) => !u.trim())}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isFetchingContent ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Fetching...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Get Content
                    </>
                  )}
                </button>
              </div>

              {contentStatus && (
                <p className="text-xs text-emerald-600 mt-1">{contentStatus}</p>
              )}

              {/* Fetched content preview */}
              {fetchedContent && (
                <div className="mt-3">
                  <label className={labelClass}>
                    Fetched Content
                    <span className="ml-1.5 font-normal text-gray-400">
                      ({fetchedContent.length.toLocaleString()} chars)
                    </span>
                  </label>
                  <textarea
                    readOnly
                    value={fetchedContent}
                    rows={8}
                    className={`${inputClass} resize-y font-mono text-xs leading-relaxed text-gray-700 bg-gray-50`}
                  />
                </div>
              )}

            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Section 3: Database */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                3
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Database Connection
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Configure a database connection for this project (optional).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="db-type" className={labelClass}>
                  Type
                </label>
                <select
                  id="db-type"
                  value={dbType}
                  onChange={(e) => setDbType(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select type...</option>
                  {DB_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="db-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="db-name"
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="My Database"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="db-host" className={labelClass}>
                  Host
                </label>
                <input
                  id="db-host"
                  type="text"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  placeholder="localhost"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="db-port" className={labelClass}>
                  Port
                </label>
                <input
                  id="db-port"
                  type="number"
                  value={dbPort}
                  onChange={(e) => setDbPort(e.target.value)}
                  placeholder="5432"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="db-database" className={labelClass}>
                  Database
                </label>
                <input
                  id="db-database"
                  type="text"
                  value={dbDatabase}
                  onChange={(e) => setDbDatabase(e.target.value)}
                  placeholder="mydb"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="db-user" className={labelClass}>
                  User
                </label>
                <input
                  id="db-user"
                  type="text"
                  value={dbUser}
                  onChange={(e) => setDbUser(e.target.value)}
                  placeholder="postgres"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="db-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="db-password"
                  type="password"
                  value={dbPassword}
                  onChange={(e) => setDbPassword(e.target.value)}
                  placeholder="Enter password"
                  className={inputClass}
                />
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dbSsl}
                    onChange={(e) => setDbSsl(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">Enable SSL</span>
                </label>
              </div>
            </div>

            {/* Test Connection & Get Schema */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection || !dbType || !dbHost || !dbDatabase}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isTestingConnection ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Testing...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Test Connection
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleGetSchema}
                disabled={isFetchingSchema || !dbType || !dbHost || !dbDatabase}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFetchingSchema ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching Schema...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                    Get Schema
                  </>
                )}
              </button>

              {connectionStatus && (
                <p
                  className={`text-xs ${
                    connectionStatus.type === "success"
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {connectionStatus.type === "success" ? "\u2713 " : "\u2717 "}
                  {connectionStatus.message}
                </p>
              )}
            </div>

            {/* Schema Error */}
            {schemaError && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {schemaError}
              </div>
            )}

            {/* Schema Display */}
            {schemaData && (
              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-violet-200">
                  <div>
                    <h4 className="text-sm font-semibold text-violet-900">
                      Database Schema
                    </h4>
                    <p className="text-xs text-violet-600 mt-0.5">
                      {schemaData.database} &mdash; {schemaData.tableCount} table{schemaData.tableCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSchemaData(null)}
                    className="rounded-lg p-1 text-violet-400 hover:bg-violet-100 hover:text-violet-600 transition-colors"
                    title="Close schema"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-4">
                  {schemaData.tables.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No tables found in the public schema.</p>
                  ) : (
                    schemaData.tables.map((table) => (
                      <div key={table.name}>
                        <h5 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
                          <svg className="h-3.5 w-3.5 text-violet-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          {table.name}
                        </h5>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-500">
                                <th className="pb-1 pr-4 font-medium">Column</th>
                                <th className="pb-1 pr-4 font-medium">Type</th>
                                <th className="pb-1 pr-4 font-medium">Nullable</th>
                                <th className="pb-1 pr-4 font-medium">Default</th>
                                <th className="pb-1 font-medium">Constraints</th>
                              </tr>
                            </thead>
                            <tbody className="text-gray-700">
                              {table.columns.map((col) => (
                                <tr key={col.name} className="border-t border-violet-100">
                                  <td className="py-1 pr-4 font-mono font-medium text-gray-900">
                                    {col.name}
                                  </td>
                                  <td className="py-1 pr-4 font-mono text-violet-700">
                                    {col.type}
                                  </td>
                                  <td className="py-1 pr-4">
                                    {col.nullable ? (
                                      <span className="text-gray-400">YES</span>
                                    ) : (
                                      <span className="text-orange-600 font-medium">NOT NULL</span>
                                    )}
                                  </td>
                                  <td className="py-1 pr-4 font-mono text-gray-500 max-w-[120px] truncate" title={col.default || ""}>
                                    {col.default || <span className="text-gray-300">&mdash;</span>}
                                  </td>
                                  <td className="py-1 space-x-1">
                                    {col.isPrimaryKey && (
                                      <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                        PK
                                      </span>
                                    )}
                                    {col.isUnique && (
                                      <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                                        UNIQUE
                                      </span>
                                    )}
                                    {col.foreignKey && (
                                      <span
                                        className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                                        title={`References ${col.foreignKey.table}.${col.foreignKey.column}`}
                                      >
                                        FK &rarr; {col.foreignKey.table}.{col.foreignKey.column}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <hr className="border-gray-200" />

          {/* Section 4: Mapping Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                4
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Mapping Configuration
              </h3>
            </div>
            <p className="text-xs text-gray-500">
              Generate an R2RML mapping that links data sources (ontology) to the physical database schema.
              Both data source content and database schema must be fetched first.
            </p>

            {/* Check Alignment Button */}
            {!alignmentResult && !isCheckingAlignment && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCheckAlignment}
                  disabled={!fetchedContent || !schemaData}
                  className="flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    !fetchedContent && !schemaData
                      ? "Fetch data source content and database schema first"
                      : !fetchedContent
                      ? "Fetch data source content first (Section 2)"
                      : !schemaData
                      ? "Fetch database schema first (Section 3)"
                      : "Check if data sources and database are from the same domain"
                  }
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Check Alignment
                </button>
                {!fetchedContent && !schemaData && (
                  <span className="text-xs text-amber-600">
                    Requires data source content and database schema
                  </span>
                )}
                {fetchedContent && !schemaData && (
                  <span className="text-xs text-amber-600">
                    Requires database schema (Section 3)
                  </span>
                )}
                {!fetchedContent && schemaData && (
                  <span className="text-xs text-amber-600">
                    Requires data source content (Section 2)
                  </span>
                )}
              </div>
            )}

            {/* Alignment Check Status */}
            {isCheckingAlignment && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <svg className="h-4 w-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-blue-700">Checking domain alignment between data sources and database...</span>
              </div>
            )}

            {alignmentError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">Alignment check failed: {alignmentError}</p>
                <button
                  type="button"
                  onClick={handleCheckAlignment}
                  className="mt-1 text-xs font-medium text-red-600 underline hover:text-red-800"
                >
                  Retry
                </button>
              </div>
            )}

            {alignmentResult && (
              <div
                className={`rounded-lg border px-4 py-3 space-y-3 ${
                  alignmentResult.recommendation === "proceed"
                    ? "border-green-200 bg-green-50"
                    : alignmentResult.recommendation === "warning"
                    ? "border-amber-200 bg-amber-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                {/* Score header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {alignmentResult.recommendation === "proceed" ? (
                      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : alignmentResult.recommendation === "warning" ? (
                      <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span
                      className={`text-sm font-semibold ${
                        alignmentResult.recommendation === "proceed"
                          ? "text-green-800"
                          : alignmentResult.recommendation === "warning"
                          ? "text-amber-800"
                          : "text-red-800"
                      }`}
                    >
                      Domain Alignment: {alignmentResult.score}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckAlignment}
                    disabled={isCheckingAlignment}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                    title="Re-check alignment"
                  >
                    Re-check
                  </button>
                </div>

                {/* Domain comparison */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-white/60 px-2 py-0.5 font-medium text-gray-700">
                    {alignmentResult.ontologyDomain}
                  </span>
                  <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span className="rounded bg-white/60 px-2 py-0.5 font-medium text-gray-700">
                    {alignmentResult.databaseDomain}
                  </span>
                </div>

                {/* Summary */}
                {alignmentResult.summary && (
                  <p
                    className={`text-xs ${
                      alignmentResult.recommendation === "proceed"
                        ? "text-green-700"
                        : alignmentResult.recommendation === "warning"
                        ? "text-amber-700"
                        : "text-red-700"
                    }`}
                  >
                    {alignmentResult.summary}
                  </p>
                )}

                {/* Matched / Unmatched concepts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-gray-600">Matched:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {alignmentResult.matchedConcepts.length > 0 ? (
                        alignmentResult.matchedConcepts.map((c, i) => (
                          <span key={i} className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 italic">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Ontology only:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {alignmentResult.unmatchedOntology.length > 0 ? (
                        alignmentResult.unmatchedOntology.map((c, i) => (
                          <span key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 italic">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Database only:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {alignmentResult.unmatchedDatabase.length > 0 ? (
                        alignmentResult.unmatchedDatabase.map((c, i) => (
                          <span key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 italic">None</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mismatch notice */}
                {alignmentResult.recommendation === "mismatch" && (
                  <p className="text-xs font-medium text-red-700 pt-1">
                    Mapping generation is disabled due to domain mismatch. Use matching data sources and database to proceed.
                  </p>
                )}
              </div>
            )}

            {/* Mapping action buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleGenerateR2rml}
                disabled={
                  !fetchedContent ||
                  !schemaData ||
                  isGeneratingMapping ||
                  isCheckingAlignment ||
                  alignmentResult?.recommendation === "mismatch"
                }
                className="flex items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !fetchedContent && !schemaData
                    ? "Fetch data source content and database schema first"
                    : !fetchedContent
                    ? "Fetch data source content first (Section 2)"
                    : !schemaData
                    ? "Fetch database schema first (Section 3)"
                    : isCheckingAlignment
                    ? "Waiting for alignment check..."
                    : alignmentResult?.recommendation === "mismatch"
                    ? "Domain mismatch detected. Use matching data sources and database to proceed."
                    : isGeneratingMapping
                    ? "Generating mapping..."
                    : "Generate R2RML mapping from data sources and database schema"
                }
              >
                {isGeneratingMapping ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating R2RML Mapping...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Generate R2RML Mapping
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => r2rmlFileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                title="Upload an existing R2RML mapping file (.ttl, .rml, .n3, .txt)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload R2RML
              </button>
              <input
                ref={r2rmlFileInputRef}
                type="file"
                accept=".ttl,.rml,.n3,.txt,.rdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (evt) => {
                    const text = evt.target?.result;
                    if (typeof text === "string") {
                      setR2rmlMapping(text);
                      setMappingError("");
                    }
                  };
                  reader.onerror = () => {
                    setMappingError("Failed to read the uploaded file.");
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }}
              />

            </div>

            {mappingError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{mappingError}</p>
              </div>
            )}

            {r2rmlMapping !== null && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    R2RML Mapping (Turtle)
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400">Editable</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(r2rmlMapping);
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 transition-colors"
                    >
                      Copy to clipboard
                    </button>
                  </div>
                </div>
                <textarea
                  value={r2rmlMapping}
                  onChange={(e) => {
                    setR2rmlMapping(e.target.value);
                    setValidationResult(null);
                  }}
                  rows={14}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleValidateR2rml}
                    disabled={!r2rmlMapping?.trim() || isValidating}
                    className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isValidating ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Validating...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Validate Mapping
                      </>
                    )}
                  </button>

                  {validationResult && (
                    <span className={`text-sm font-medium ${validationResult.valid ? "text-green-600" : "text-red-600"}`}>
                      {validationResult.valid ? "Valid" : "Invalid"}
                    </span>
                  )}
                </div>

                {validationResult && (
                  <div className={`rounded-lg border p-3 space-y-2 ${validationResult.valid ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    {/* Stats */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span>{validationResult.stats.tripleCount} triples</span>
                      <span>{validationResult.stats.triplesMaps.length} TriplesMap(s)</span>
                      <span>{validationResult.stats.referencedTables.length} table(s)</span>
                      <span>{validationResult.stats.referencedColumns.length} column(s)</span>
                    </div>

                    {/* Issues */}
                    {validationResult.issues.length > 0 ? (
                      <ul className="space-y-1">
                        {validationResult.issues.map((issue, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            {issue.level === "error" ? (
                              <svg className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4 flex-shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            )}
                            <span className={issue.level === "error" ? "text-red-700" : "text-amber-700"}>
                              {issue.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-green-700">
                        No issues found. The mapping is syntactically valid and structurally correct.
                        {schemaData ? " All referenced tables and columns match the database schema." : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <svg
                  className="h-5 w-5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Create Project"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
