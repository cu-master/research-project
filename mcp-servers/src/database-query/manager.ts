import type { DatabaseAdapter } from "./adapters/index.js";
import { PostgreSQLAdapter, SupabaseAdapter } from "./adapters/index.js";
import type { DatabaseConfig, DatabaseType, SchemaCache } from "./types.js";

// ============================================================================
// Database Connection Type
// ============================================================================

interface DatabaseConnection {
  id: string;
  name: string;
  config: DatabaseConfig;
  adapter: DatabaseAdapter;
  schemaCache: SchemaCache | null;
}

// ============================================================================
// Database Manager
// ============================================================================

/**
 * Manages multiple database connections.
 * Allows registering, connecting, and querying different databases.
 */
class DatabaseManager {
  private connections: Map<string, DatabaseConnection> = new Map();
  private defaultConnectionId: string | null = null;

  /**
   * Check if a database is already registered
   */
  hasDatabase(id: string): boolean {
    return this.connections.has(id);
  }

  /**
   * Register a new database connection (skips if already registered)
   */
  registerDatabase(id: string, name: string, config: DatabaseConfig): void {
    if (this.connections.has(id)) {
      return;
    }

    const adapter = this.createAdapter(config);

    this.connections.set(id, {
      id,
      name,
      config,
      adapter,
      schemaCache: null,
    });

    // Set as default if it's the first connection
    if (this.connections.size === 1) {
      this.defaultConnectionId = id;
    }
  }

  /**
   * Create appropriate adapter based on config type
   */
  private createAdapter(config: DatabaseConfig): DatabaseAdapter {
    switch (config.type) {
      case "postgresql":
        return new PostgreSQLAdapter(config);
      case "supabase":
        return new SupabaseAdapter(config);
      default:
        throw new Error(`Unknown database type: ${(config as DatabaseConfig).type}`);
    }
  }

  /**
   * Connect to a specific database
   */
  async connectDatabase(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Database "${id}" not found`);
    }

    await connection.adapter.connect();
  }

  /**
   * Unregister a database
   */
  async unregisterDatabase(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Database "${id}" not found`);
    }

    await connection.adapter.disconnect();
    this.connections.delete(id);

    if (this.defaultConnectionId === id) {
      this.defaultConnectionId =
        this.connections.size > 0 ? this.connections.keys().next().value ?? null : null;
    }
  }

  /**
   * Get a specific database connection
   */
  getConnection(id?: string): DatabaseConnection {
    const connectionId = id || this.defaultConnectionId;
    if (!connectionId) {
      throw new Error("No database connection available. Register a database first.");
    }

    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Database "${connectionId}" not found`);
    }

    return connection;
  }

  /**
   * Get the adapter for a specific database
   */
  getAdapter(id?: string): DatabaseAdapter {
    return this.getConnection(id).adapter;
  }

  /**
   * Set the default database connection
   */
  setDefaultConnection(id: string): void {
    if (!this.connections.has(id)) {
      throw new Error(`Database "${id}" not found`);
    }
    this.defaultConnectionId = id;
  }

  /**
   * List all registered databases
   */
  listDatabases(): Array<{
    id: string;
    name: string;
    type: DatabaseType;
    connected: boolean;
    isDefault: boolean;
  }> {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.id,
      name: conn.name,
      type: conn.config.type,
      connected: conn.adapter.isConnected(),
      isDefault: conn.id === this.defaultConnectionId,
    }));
  }

}

// Global database manager instance
export const dbManager = new DatabaseManager();

