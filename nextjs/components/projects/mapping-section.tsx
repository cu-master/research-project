"use client";

import { Spinner } from "./spinner";
import {
  prerequisiteMessage,
  type AlignmentResult,
  type SchemaData,
  type ValidationResult,
} from "./project-form";

interface MappingSectionProps {
  fetchedContent: string | null;
  schemaData: SchemaData | null;
  alignmentResult: AlignmentResult | null;
  isCheckingAlignment: boolean;
  alignmentError: string;
  handleCheckAlignment: () => void;
  r2rmlMapping: string | null;
  setR2rmlMapping: React.Dispatch<React.SetStateAction<string | null>>;
  setValidationResult: React.Dispatch<React.SetStateAction<ValidationResult | null>>;
  isGeneratingMapping: boolean;
  handleGenerateR2rml: () => void;
  mappingError: string;
  r2rmlFileInputRef: React.RefObject<HTMLInputElement>;
  handleR2rmlFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDownloadR2rmlMapping: () => void;
  isValidating: boolean;
  validationResult: ValidationResult | null;
  handleValidateR2rml: () => void;
}

// Section 4: Mapping configuration — domain alignment check, R2RML generation/upload, and validation.
export function MappingSection({
  fetchedContent,
  schemaData,
  alignmentResult,
  isCheckingAlignment,
  alignmentError,
  handleCheckAlignment,
  r2rmlMapping,
  setR2rmlMapping,
  setValidationResult,
  isGeneratingMapping,
  handleGenerateR2rml,
  mappingError,
  r2rmlFileInputRef,
  handleR2rmlFileUpload,
  handleDownloadR2rmlMapping,
  isValidating,
  validationResult,
  handleValidateR2rml,
}: MappingSectionProps) {
  return (
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
              prerequisiteMessage(!!fetchedContent, !!schemaData) ??
              "Check if data sources and database are from the same domain"
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
          <Spinner className="h-4 w-4 text-blue-600" />
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
            prerequisiteMessage(!!fetchedContent, !!schemaData) ??
            (isCheckingAlignment
              ? "Waiting for alignment check..."
              : alignmentResult?.recommendation === "mismatch"
              ? "Domain mismatch detected. Use matching data sources and database to proceed."
              : isGeneratingMapping
              ? "Generating mapping..."
              : "Generate R2RML mapping from data sources and database schema")
          }
        >
          {isGeneratingMapping ? (
            <>
              <Spinner className="h-4 w-4" />
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

        <button
          type="button"
          onClick={handleDownloadR2rmlMapping}
          disabled={!r2rmlMapping?.trim()}
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Download the current R2RML mapping as a .ttl file"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
            />
          </svg>
          Download mapping
        </button>

        <input
          ref={r2rmlFileInputRef}
          type="file"
          accept=".ttl,.rml,.n3,.txt,.rdf"
          className="hidden"
          onChange={handleR2rmlFileUpload}
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
                  <Spinner className="h-4 w-4" />
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
  );
}
