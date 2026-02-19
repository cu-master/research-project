import { MODEL_INTERPRETATION_BASE_URL } from "../config";
import { McpToolResponse } from "../types";

export async function callModelInterpretationTool(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const url = `${MODEL_INTERPRETATION_BASE_URL}/mcp/call-tool`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: toolName, arguments: args }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const result = (await response.json()) as McpToolResponse;

    if (result.isError) {
      const message = result.content?.[0]?.text || `Model Interpretation tool "${toolName}" failed`;
      throw new Error(message);
    }

    if (Array.isArray(result.content) && result.content.length > 0) {
      return result.content
        .map((item) => {
          if (item?.type === "text" && typeof item.text === "string") {
            return item.text;
          }
          return JSON.stringify(item);
        })
        .join("\n\n");
    }

    if (result.structuredContent) {
      return typeof result.structuredContent === "string"
        ? result.structuredContent
        : JSON.stringify(result.structuredContent, null, 2);
    }

    return "Tool executed successfully but returned no content.";
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to Model Interpretation MCP server at ${MODEL_INTERPRETATION_BASE_URL}. Make sure the server is running.`
        );
      }
      throw error;
    }
    throw new Error(`Unknown error calling tool "${toolName}": ${error}`);
  }
}

