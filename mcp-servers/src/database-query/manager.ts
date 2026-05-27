import type { DatabaseAdapter } from "./adapters/index.js";
import { PostgreSQLAdapter } from "./adapters/index.js";
import type { DatabaseConfig, DatabaseType } from "./types.js";

interface DatabaseConnection {
  id: string;
  name: string;
  config: DatabaseConfig;
  adapter: DatabaseAdapter;
}

class DatabaseManager {
  private connections: Map<string, DatabaseConnection> = new Map();
  private defaultConnectionId: string | null = null;

  hasDatabase(id: string): boolean {
    return this.connections.has(id);
  }

  // Skips if a connection with this id is already registered.
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
    });

    if (this.connections.size === 1) {
      this.defaultConnectionId = id;
    }
  }

  private createAdapter(config: DatabaseConfig): DatabaseAdapter {
    switch (config.type) {
      case "postgresql":
        return new PostgreSQLAdapter(config);
      default:
        throw new Error(`Unknown database type: ${(config as DatabaseConfig).type}`);
    }
  }

  async connectDatabase(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Database "${id}" not found`);
    }

    await connection.adapter.connect();
  }

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

  getAdapter(id?: string): DatabaseAdapter {
    return this.getConnection(id).adapter;
  }

  setDefaultConnection(id: string): void {
    if (!this.connections.has(id)) {
      throw new Error(`Database "${id}" not found`);
    }
    this.defaultConnectionId = id;
  }

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

export const dbManager = new DatabaseManager();

