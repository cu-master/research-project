"use client";

import { useState, useEffect, useRef } from "react";
import { Spinner } from "./spinner";
import {
  downloadBlob,
  type AlignmentResult,
  type ConnectionStatus,
  type SchemaData,
  type UploadedFile,
  type ValidationResult,
} from "./project-form";
import { ProjectDetailsSection } from "./project-details-section";
import { OntologySection } from "./ontology-section";
import { DatabaseSection } from "./database-section";
import { MappingSection } from "./mapping-section";

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
  alignment_result?: AlignmentResult;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  project?: ProjectData | null;
}

export default function ProjectModal({
  isOpen,
  onClose,
  onSaved,
  project,
}: ProjectModalProps) {
  const r2rmlFileInputRef = useRef<HTMLInputElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
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

  // Uploaded files state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");

  // Form state
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [contentStatus, setContentStatus] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isFetchingSchema, setIsFetchingSchema] = useState(false);
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [schemaError, setSchemaError] = useState("");

  // Section 4: Alignment Check & R2RML Mapping
  const [alignmentResult, setAlignmentResult] = useState<AlignmentResult | null>(null);
  const [isCheckingAlignment, setIsCheckingAlignment] = useState(false);
  const [alignmentError, setAlignmentError] = useState("");

  const [r2rmlMapping, setR2rmlMapping] = useState<string | null>(null);
  const [isGeneratingMapping, setIsGeneratingMapping] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

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
        setSchemaData(project.db_schema ? (project.db_schema as unknown as SchemaData) : null);
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
        setAlignmentResult(null);
      }
      setError("");
      setContentStatus("");
      setConnectionStatus(null);
      setSchemaError("");
      setAlignmentError("");
      setIsCheckingAlignment(false);
      setMappingError("");
      setValidationResult(null);
      // Restore saved content (null when the project has none) so the textarea matches the DB.
      setFetchedContent(project?.content ?? null);
      setUploadedFiles([]);
      setUploadStatus("");
    }
  }, [isOpen, project]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadStatus("");
    setError("");

    const readers = files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(`--- ${file.name} ---\n${reader.result as string}`);
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        })
    );

    Promise.all(readers)
      .then((texts) => {
        const combined = texts.join("\n\n");
        setFetchedContent((prev) => (prev ? `${prev}\n\n${combined}` : combined));
        setUploadedFiles((prev) => [
          ...prev,
          ...files.map((f) => ({ name: f.name, size: f.size })),
        ]);
        setUploadStatus(
          `${files.length} file${files.length > 1 ? "s" : ""} loaded successfully.`
        );
        setAlignmentResult(null);
        setAlignmentError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to read files");
      })
      .finally(() => {
        // Reset input so the same file can be re-uploaded
        if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
      });
  };

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
          } catch (err) {
            // Non-blocking: the value is re-sent on the next full save.
            console.warn("Failed to auto-save alignment result:", err);
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

  const handleClearContent = () => {
    // Persist a cleared state by saving an empty string.
    setFetchedContent("");
    setUploadedFiles([]);
    setUploadStatus("");
    setContentStatus("");
    setAlignmentResult(null);
    setAlignmentError("");
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

      // Merge URL-fetched content with any previously uploaded file content
      if (data.mergedContent) {
        setFetchedContent((prev) =>
          prev ? `${prev}\n\n${data.mergedContent}` : data.mergedContent
        );
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
          } catch (err) {
            // Non-blocking: schema is still shown in the UI and is included in the next full save.
            console.warn("Failed to auto-save database schema:", err);
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

  const handleR2rmlFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") {
        setR2rmlMapping(text);
        setMappingError("");
        // Uploaded mapping is unvalidated — clear any stale Valid/Invalid badge.
        setValidationResult(null);
      }
    };
    reader.onerror = () => {
      setMappingError("Failed to read the uploaded file.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDownloadR2rmlMapping = () => {
    if (!r2rmlMapping) return;

    const safeBase =
      (name && name.trim().length > 0 ? name : "r2rml-mapping")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    downloadBlob(
      r2rmlMapping,
      `${safeBase || "r2rml-mapping"}.ttl`,
      "text/turtle; charset=utf-8"
    );
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
    // Important: send empty string too, otherwise the server keeps the previous DB value.
    if (fetchedContent !== null) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
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

          <ProjectDetailsSection name={name} setName={setName} />

          <hr className="border-gray-200" />

          <OntologySection
            urls={urls}
            addUrlField={addUrlField}
            removeUrlField={removeUrlField}
            updateUrl={updateUrl}
            handleGetContent={handleGetContent}
            isFetchingContent={isFetchingContent}
            uploadFileInputRef={uploadFileInputRef}
            handleFileUpload={handleFileUpload}
            uploadedFiles={uploadedFiles}
            uploadStatus={uploadStatus}
            contentStatus={contentStatus}
            fetchedContent={fetchedContent}
            setFetchedContent={setFetchedContent}
            onClearContent={handleClearContent}
          />

          <hr className="border-gray-200" />

          <DatabaseSection
            dbType={dbType}
            setDbType={setDbType}
            dbName={dbName}
            setDbName={setDbName}
            dbHost={dbHost}
            setDbHost={setDbHost}
            dbPort={dbPort}
            setDbPort={setDbPort}
            dbDatabase={dbDatabase}
            setDbDatabase={setDbDatabase}
            dbUser={dbUser}
            setDbUser={setDbUser}
            dbPassword={dbPassword}
            setDbPassword={setDbPassword}
            dbSsl={dbSsl}
            setDbSsl={setDbSsl}
            handleTestConnection={handleTestConnection}
            isTestingConnection={isTestingConnection}
            connectionStatus={connectionStatus}
            handleGetSchema={handleGetSchema}
            isFetchingSchema={isFetchingSchema}
            schemaData={schemaData}
            setSchemaData={setSchemaData}
            schemaError={schemaError}
          />

          <hr className="border-gray-200" />

          <MappingSection
            fetchedContent={fetchedContent}
            schemaData={schemaData}
            alignmentResult={alignmentResult}
            isCheckingAlignment={isCheckingAlignment}
            alignmentError={alignmentError}
            handleCheckAlignment={handleCheckAlignment}
            r2rmlMapping={r2rmlMapping}
            setR2rmlMapping={setR2rmlMapping}
            setValidationResult={setValidationResult}
            isGeneratingMapping={isGeneratingMapping}
            handleGenerateR2rml={handleGenerateR2rml}
            mappingError={mappingError}
            r2rmlFileInputRef={r2rmlFileInputRef}
            handleR2rmlFileUpload={handleR2rmlFileUpload}
            handleDownloadR2rmlMapping={handleDownloadR2rmlMapping}
            isValidating={isValidating}
            validationResult={validationResult}
            handleValidateR2rml={handleValidateR2rml}
          />

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
                <Spinner className="h-5 w-5 text-white" />
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
