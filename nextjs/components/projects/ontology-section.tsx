"use client";

import { Spinner } from "./spinner";
import { inputClass, labelClass, type UploadedFile } from "./project-form";

interface OntologySectionProps {
  urls: string[];
  addUrlField: () => void;
  removeUrlField: (index: number) => void;
  updateUrl: (index: number, value: string) => void;
  handleGetContent: () => void;
  isFetchingContent: boolean;
  uploadFileInputRef: React.RefObject<HTMLInputElement>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadedFiles: UploadedFile[];
  uploadStatus: string;
  contentStatus: string;
  fetchedContent: string | null;
  setFetchedContent: React.Dispatch<React.SetStateAction<string | null>>;
  onClearContent: () => void;
}

// Section 2: Domain ontology — URL list, content fetch, file upload, and the editable
// merged content textarea.
export function OntologySection({
  urls,
  addUrlField,
  removeUrlField,
  updateUrl,
  handleGetContent,
  isFetchingContent,
  uploadFileInputRef,
  handleFileUpload,
  uploadedFiles,
  uploadStatus,
  contentStatus,
  fetchedContent,
  setFetchedContent,
  onClearContent,
}: OntologySectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
          2
        </div>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Domain Ontology
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
        <div className="flex flex-wrap items-center gap-3">
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
                <Spinner className="h-4 w-4" />
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

          {/* File upload button */}
          <input
            ref={uploadFileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.json,.ttl"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => uploadFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Upload File
          </button>
        </div>

        {/* Uploaded files list */}
        {uploadedFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {uploadedFiles.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 border border-violet-200"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {f.name}
                <span className="text-violet-400">({(f.size / 1024).toFixed(1)} KB)</span>
              </span>
            ))}
          </div>
        )}

        {uploadStatus && (
          <p className="text-xs text-violet-600 mt-1">{uploadStatus}</p>
        )}

        {contentStatus && (
          <p className="text-xs text-emerald-600 mt-1">{contentStatus}</p>
        )}

        {/* Fetched content — editable */}
        {fetchedContent !== null && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass + " mb-0"}>
                Fetched Content
                <span className="ml-1.5 font-normal text-gray-400">
                  ({fetchedContent.length.toLocaleString()} chars)
                </span>
              </label>
              <button
                type="button"
                onClick={onClearContent}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Clear
              </button>
            </div>
            <textarea
              value={fetchedContent}
              onChange={(e) => setFetchedContent(e.target.value)}
              rows={8}
              className={`${inputClass} resize-y font-mono text-xs leading-relaxed text-gray-700 bg-gray-50`}
              placeholder="Content will appear here after fetching URLs or uploading files. You can also type or paste content directly."
            />
          </div>
        )}
      </div>
    </div>
  );
}
