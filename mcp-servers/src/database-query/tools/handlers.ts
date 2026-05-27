import type { McpResponse } from "../../shared/types.js";
import { dbManager } from "../manager.js";
import {
  createMcpResponse,
  formatApiError,
} from "../utils.js";
import {
  getTableSchemaSchema,
  listTablesSchema,
} from "./schemas.js";

export async function handleListTables(args: Record<string, unknown>): Promise<McpResponse> {
  try {
    const { includeViews = true, schemaName = "public", databaseId } = listTablesSchema.parse(args);

    const connection = dbManager.getConnection(databaseId);

    if (!connection.adapter.isConnected()) {
      return createMcpResponse(
        `# Database Not Connected\n\n` +
        `**Database:** ${connection.name} (${connection.id})\n\n` +
        `The database is registered but not currently connected. ` +
        `Please ensure the database server is running and accessible.`,
        true
      );
    }

    const adapter = dbManager.getAdapter(databaseId);
    const tables = await adapter.listTables(schemaName, includeViews);

    let output = `# Database Tables\n\n`;
    output += `**Database:** ${connection.name} (${connection.id})\n`;
    output += `**Schema:** ${schemaName}\n\n`;
    output += `| Table Name | Type |\n`;
    output += `|------------|------|\n`;

    for (const table of tables) {
      output += `| ${table.table_name} | ${table.table_type} |\n`;
    }

    output += `\n**Total: ${tables.length} table(s)**`;
    return createMcpResponse(output);
  } catch (error) {
    return createMcpResponse(`Error listing tables: ${formatApiError(error)}`, true);
  }
}

export async function handleGetTableSchema(args: Record<string, unknown>): Promise<McpResponse> {
  try {
    const {
      tableName,
      includeConstraints = true,
      includeForeignKeys = true,
      databaseId,
    } = getTableSchemaSchema.parse(args);

    const adapter = dbManager.getAdapter(databaseId);
    const connection = dbManager.getConnection(databaseId);
    const columns = await adapter.getTableColumns(tableName);

    if (columns.length === 0) {
      return createMcpResponse(`Table "${tableName}" not found or has no columns.`, true);
    }

    let output = `# Table Schema: ${tableName}\n\n`;
    output += `**Database:** ${connection.name} (${connection.id})\n\n`;
    output += `## Columns\n\n`;
    output += `| Column | Type | Nullable | Default |\n`;
    output += `|--------|------|----------|--------|\n`;

    for (const col of columns) {
      const nullable = col.is_nullable === "YES" ? "Yes" : "No";
      const defaultVal = col.column_default || "-";
      let typeStr = col.data_type;
      if (col.character_maximum_length) {
        typeStr += `(${col.character_maximum_length})`;
      }
      output += `| ${col.column_name} | ${typeStr} | ${nullable} | ${defaultVal} |\n`;
    }

    if (includeConstraints) {
      const constraints = await adapter.getTableConstraints(tableName);
      if (constraints.length > 0) {
        output += `\n## Constraints\n\n`;
        output += `| Constraint | Type | Column |\n`;
        output += `|------------|------|--------|\n`;
        for (const con of constraints) {
          output += `| ${con.constraint_name} | ${con.constraint_type} | ${con.column_name} |\n`;
        }
      }
    }

    if (includeForeignKeys) {
      const fks = await adapter.getTableForeignKeys(tableName);
      if (fks.length > 0) {
        output += `\n## Foreign Keys\n\n`;
        output += `| Column | References |\n`;
        output += `|--------|------------|\n`;
        for (const fk of fks) {
          output += `| ${fk.column_name} | ${fk.foreign_table_name}.${fk.foreign_column_name} |\n`;
        }
      }
    }

    return createMcpResponse(output);
  } catch (error) {
    return createMcpResponse(`Error getting table schema: ${formatApiError(error)}`, true);
  }
}
