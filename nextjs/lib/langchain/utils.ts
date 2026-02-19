import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatMessage, LangChainMessage } from "./types";

export function extractText(payload: unknown): string {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;

  if (Array.isArray(payload)) {
    return payload
      .map(extractText)
      .filter((chunk) => chunk.length > 0)
      .join("\n\n");
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (record.content !== undefined) return extractText(record.content);
    if (record.output !== undefined) return extractText(record.output);
    return JSON.stringify(payload);
  }

  return String(payload);
}


export function serializeToolInput(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function buildMessageContent(text: string): string {
  return text.trim();
}

export function convertToLangChainMessage(msg: ChatMessage): LangChainMessage | null {
  const content = buildMessageContent(extractText(msg.content).trim());

  if (!content) return null;

  if (msg.role === "user") {
    return new HumanMessage(content);
  }

  return new AIMessage({ content });
}

