// Re-export shared types
export type {
  McpResponse,
  ToolDefinition,
  LLMProvider,
  LLMConfig,
  BaseAppConfig,
} from "../shared/types.js";

// ============================================================================
// App Configuration (extends shared config)
// ============================================================================

export interface AppConfig {
  provider: import("../shared/types.js").LLMProvider;
  anthropicKey: string | undefined;
  googleKey: string | undefined;
  groqKey: string | undefined;
  openaiKey: string | undefined;
  anthropicModel: string;
  googleModel: string;
  groqModel: string;
  openaiModel: string;
  port: number;
}
