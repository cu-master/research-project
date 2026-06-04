"use client";

import { Spinner } from "./spinner";
import {
  DB_TYPES,
  downloadBlob,
  inputClass,
  labelClass,
  type ConnectionStatus,
  type SchemaData,
} from "./project-form";

interface DatabaseSectionProps {
  dbType: string;
  setDbType: (value: string) => void;
  dbName: string;
  setDbName: (value: string) => void;
  dbHost: string;
  setDbHost: (value: string) => void;
  dbPort: string;
  setDbPort: (value: string) => void;
  dbDatabase: string;
  setDbDatabase: (value: string) => void;
  dbUser: string;
  setDbUser: (value: string) => void;
  dbPassword: string;
  setDbPassword: (value: string) => void;
  dbSsl: boolean;
  setDbSsl: (value: boolean) => void;
  handleTestConnection: () => void;
  isTestingConnection: boolean;
  connectionStatus: ConnectionStatus | null;
  handleGetSchema: () => void;
  isFetchingSchema: boolean;
  schemaData: SchemaData | null;
  setSchemaData: React.Dispatch<React.SetStateAction<SchemaData | null>>;
  schemaError: string;
}

// Section 3: Database connection — credential fields, test connection, fetch + display schema.
export function DatabaseSection({
  dbType,
  setDbType,
  dbName,
  setDbName,
  dbHost,
  setDbHost,
  dbPort,
  setDbPort,
  dbDatabase,
  setDbDatabase,
  dbUser,
  setDbUser,
  dbPassword,
  setDbPassword,
  dbSsl,
  setDbSsl,
  handleTestConnection,
  isTestingConnection,
  connectionStatus,
  handleGetSchema,
  isFetchingSchema,
  schemaData,
  setSchemaData,
  schemaError,
}: DatabaseSectionProps) {
  return (
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
              <Spinner className="h-4 w-4" />
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
              <Spinner className="h-4 w-4" />
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

        {/* Download Schema — only visible once schema is fetched */}
        {schemaData && (
          <button
            type="button"
            onClick={() =>
              downloadBlob(
                JSON.stringify(schemaData, null, 2),
                `${dbDatabase || "schema"}-schema.json`,
                "application/json"
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Schema
          </button>
        )}

        {connectionStatus && (
          <p
            className={`text-xs ${
              connectionStatus.type === "success"
                ? "text-emerald-600"
                : "text-red-600"
            }`}
          >
            {connectionStatus.type === "success" ? "✓ " : "✗ "}
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
  );
}
