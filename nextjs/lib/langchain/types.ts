import { HumanMessage, AIMessage } from "@langchain/core/messages";

export interface ChatMessage {
  role: "user" | "assistant";
  content: unknown;
  attachments?: Attachment[];
}

export interface Attachment {
  name?: string;
  type?: string;
  size?: number;
  content?: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface AgentMessage {
  content: unknown;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface McpToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  structuredContent?: unknown;
}

export type LangChainMessage = HumanMessage | AIMessage;

export type ModelProvider = "google" | "anthropic" | "openai" | "groq";

