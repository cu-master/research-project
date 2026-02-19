import { z } from "zod";
import type { McpResponse } from "./types.js";

// ============================================================================
// MCP Response Utilities
// ============================================================================

export function createMcpResponse(text: string, isError = false): McpResponse {
  return { content: [{ type: "text", text }], isError };
}

// ============================================================================
// Error Formatting
// ============================================================================

export function formatApiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const isApiKeyError =
    message.includes("API_KEY") ||
    message.includes("ANTHROPIC") ||
    message.includes("GOOGLE") ||
    message.includes("SUPABASE");

  if (isApiKeyError) {
    return `Configuration error: ${message}\n\nPlease ensure all required environment variables are set.`;
  }
  return message;
}

// ============================================================================
// Zod to JSON Schema Converter
// ============================================================================

export function zodToJsonSchema(
  schema: z.ZodObject<z.ZodRawShape>
): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    const description = zodType._def.description || "";

    let type = "string";
    let enumValues: string[] | undefined;
    let minimum: number | undefined;
    let maximum: number | undefined;

    // Handle optional wrapper
    let innerType = zodType;
    let isOptional = false;
    if (zodType._def.typeName === "ZodOptional") {
      isOptional = true;
      innerType = zodType._def.innerType;
    }

    // Determine the actual type
    const typeName = innerType._def.typeName;
    switch (typeName) {
      case "ZodString":
        type = "string";
        break;
      case "ZodNumber":
        type = "number";
        if (innerType._def.checks) {
          for (const check of innerType._def.checks) {
            if (check.kind === "min") minimum = check.value;
            if (check.kind === "max") maximum = check.value;
            if (check.kind === "int") type = "integer";
          }
        }
        break;
      case "ZodBoolean":
        type = "boolean";
        break;
      case "ZodEnum":
        type = "string";
        enumValues = innerType._def.values;
        break;
      case "ZodObject":
        type = "object";
        break;
    }

    const prop: Record<string, unknown> = { type, description };
    if (enumValues) prop.enum = enumValues;
    if (minimum !== undefined) prop.minimum = minimum;
    if (maximum !== undefined) prop.maximum = maximum;

    properties[key] = prop;
    if (!isOptional) required.push(key);
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

