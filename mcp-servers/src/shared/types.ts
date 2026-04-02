// ============================================================================
// MCP Response Types
// ============================================================================

export interface McpResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<McpResponse>;
}

// ============================================================================
// LLM Configuration Types
// ============================================================================

export type LLMProvider = "anthropic" | "google" | "groq" | "openai";

export interface LLMConfig {
  provider: LLMProvider;
  anthropicKey: string | undefined;
  googleKey: string | undefined;
  groqKey: string | undefined;
  openaiKey: string | undefined;
  anthropicModel: string;
  googleModel: string;
  groqModel: string;
  openaiModel: string;
}

export interface BaseAppConfig extends LLMConfig {
  port: number;
}

