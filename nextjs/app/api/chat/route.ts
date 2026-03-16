import { NextResponse } from "next/server";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import {
  ChatMessage,
  AgentMessage,
  extractText,
  serializeToolInput,
  buildMessageContent,
  convertToLangChainMessage,
  getAgent,
} from "@/lib/langchain";
import { saveMessage, getSession } from "@/lib/db/sessions";
import { runWithLangChainRequestContext } from "@/lib/langchain/request-context";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getDefaultProjectId } from "@/lib/db/users";
import { getProject } from "@/lib/db/projects";

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let parsedBody: {
      message?: unknown;
      history?: unknown;
      sessionId?: unknown;
    };
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          response: "Invalid JSON body. Please send a valid JSON payload.",
          error: "Bad request",
        },
        { status: 400 }
      );
    }

    const { message, history, sessionId } = parsedBody;
    const safeMessage = typeof message === "string" ? message : "";

    console.log("Processing message:", safeMessage);

    // Verify session exists if sessionId is provided, and load its project_id
    let sessionProjectId: string | null = null;
    if (sessionId && typeof sessionId === "string" && sessionId.trim() !== "") {
      try {
        const session = await getSession(sessionId, userId);
        if (!session) {
          return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }
        sessionProjectId = session.project_id || null;
      } catch (error) {
        console.warn("[Context] Could not verify session:", error);
      }
    }

    // Load project context: prefer session's project, fall back to user's default
    let projectContext = "";
    let projectIdToUse: string | null = sessionProjectId;
    try {
      if (!projectIdToUse) {
        projectIdToUse = await getDefaultProjectId(userId);
      }
      if (projectIdToUse) {
        const project = await getProject(projectIdToUse, userId);
        if (project) {
          const contextParts: string[] = [];
          contextParts.push(`[PROJECT CONTEXT] Project: "${project.name}"`);

          // Only include capability flags — actual content is accessed via tools
          const capabilities: string[] = [];
          if (project.content && project.content.trim()) {
            capabilities.push("URL Content (use 'answer_query' or 'summarize_content' tools to access)");
          }
          if (project.db_schema && Object.keys(project.db_schema).length > 0) {
            capabilities.push("Database Schema (use database tools to query)");
          }
          if (project.r2rml_mapping && project.r2rml_mapping.trim()) {
            capabilities.push("R2RML Mapping (use 'obda_query_with_ontop' for queries or 'explain_mapping' to understand it)");
          }

          if (capabilities.length > 0) {
            contextParts.push(`\nAvailable project data:\n- ${capabilities.join("\n- ")}`);
          } else {
            contextParts.push(`\nThis project has no data configured yet.`);
          }

          projectContext = contextParts.join("\n");
          console.log(`[Context] Project "${project.name}" loaded for session ${sessionId || "(new)"}`);
        }
      }
    } catch (error) {
      console.warn("[Context] Could not load project:", error);
    }

    const safeHistory = Array.isArray(history) ? history : [];
    const chatHistory = safeHistory
      .map((msg: ChatMessage) => convertToLangChainMessage(msg))
      .filter((msg: HumanMessage | AIMessage | null): msg is HumanMessage | AIMessage => msg !== null);

    const messageContent = buildMessageContent(safeMessage);

    const agent = await getAgent();
    const startTime = Date.now();

    // Append default project context to the message if available
    const messagesToSend = projectContext
      ? [...chatHistory, new HumanMessage(messageContent + "\n\n" + projectContext)]
      : [...chatHistory, new HumanMessage(messageContent)];

    const result = await runWithLangChainRequestContext(
      {
        sessionId: typeof sessionId === "string" ? sessionId : undefined,
        projectId: projectIdToUse ?? undefined,
        userId,
      },
      async () =>
        agent.invoke(
          { messages: messagesToSend },
          { recursionLimit: 25 }
        )
    );
    const endTime = Date.now();
    const latency = (endTime - startTime) / 1000;

    const messages = result.messages as AgentMessage[];
    const lastMessage = messages[messages.length - 1];
    let responseText = extractText(lastMessage.content);

    const toolCalls = messages
      .filter((msg) => msg.tool_calls && msg.tool_calls.length > 0)
      .flatMap((msg) =>
        (msg.tool_calls || [])
          .filter((toolCall) => toolCall.args !== undefined && toolCall.args !== null)
          .map((toolCall) => {
            const toolResult = messages.find((m) => m.tool_call_id === toolCall.id);
            return {
              tool: toolCall.name,
              input: serializeToolInput(toolCall.args),
              log: "",
              observation: toolResult ? extractText(toolResult.content) : "",
            };
          })
      );

    // Fallback: use last tool result if response is still empty
    if (!responseText.trim() && toolCalls.length > 0) {
      const lastToolResult = toolCalls[toolCalls.length - 1];
      if (lastToolResult.observation) {
        responseText = lastToolResult.observation;
        console.log("Using tool result as response");
      }
    }

    console.log("Response text:", responseText || "(empty)");
    console.log("Tool calls count:", toolCalls.length);

    const finalResponse =
      responseText.trim() ||
      "I wasn't able to process your request. Please try rephrasing your question.";

    // Save messages to database if sessionId is provided
    if (sessionId && typeof sessionId === "string" && sessionId.trim() !== "") {
      try {
        console.log(`[DB] Saving messages to database for session: ${sessionId}`);
        console.log(`[DB] User message length: ${safeMessage.length}, Assistant response length: ${finalResponse.length}`);

        const session = await getSession(sessionId, userId);
        if (!session) {
          console.error(`[DB] Session ${sessionId} does not exist or not owned by user!`);
          // Don't throw - just log the error
        } else {
          console.log(`[DB] Session ${sessionId} verified, saving messages...`);
        }

        // Save user message
        const userMsg = await saveMessage(
          sessionId,
          "user",
          safeMessage
        );
        console.log(`[DB] ✓ User message saved with ID: ${userMsg.id}`);

        // Save assistant message
        const assistantMsg = await saveMessage(
          sessionId,
          "assistant",
          finalResponse,
          undefined,
          toolCalls.length > 0 ? toolCalls : undefined,
          latency || undefined
        );
        console.log(`[DB] ✓ Assistant message saved with ID: ${assistantMsg.id}`);
        console.log(`[DB] ✓ Both messages saved successfully for session: ${sessionId}`);
      } catch (dbError) {
        // Log but don't fail the request if database save fails
        console.error("[DB] ✗ Failed to save messages to database:", dbError);
        console.error("[DB] Error details:", {
          name: dbError instanceof Error ? dbError.name : "Unknown",
          message: dbError instanceof Error ? dbError.message : String(dbError),
          stack: dbError instanceof Error ? dbError.stack : undefined,
        });

        // Check if it's a connection error
        if (dbError instanceof Error) {
          if (dbError.message.includes("DATABASE_URL") || dbError.message.includes("connection")) {
            console.error("[DB] Database connection issue - check DATABASE_URL environment variable");
          }
        }
      }
    } else {
      console.warn("[DB] No valid sessionId provided, messages will not be saved to database");
      console.log("[DB] SessionId value:", sessionId, "Type:", typeof sessionId);
    }

    return NextResponse.json({
      response: finalResponse,
      toolsUsed: toolCalls,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    console.error("Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    let errorMessage = "An error occurred while processing your request.";
    if (error instanceof Error) {
      // NFR-02: Agent tried to retry a rejected mutating SQL query and hit the loop limit.
      // Return a clean 400 with an explanation instead of a 500.
      if (
        (error as Error & { lc_error_code?: string }).lc_error_code === "GRAPH_RECURSION_LIMIT" ||
        error.message.includes("GRAPH_RECURSION_LIMIT") ||
        error.message.includes("Recursion limit")
      ) {
        return NextResponse.json(
          {
            response:
              "I'm sorry, but I wasn't able to complete your request. " +
              "The query required too many processing steps. This can happen when the generated query fails validation repeatedly. " +
              "Please try rephrasing your question or simplifying your request.",
            error: "Processing limit reached",
          },
          { status: 400 }
        );
      }
      if (error.message.includes("invalid_request_error")) {
        errorMessage =
          "There was an issue with the AI service. Please try starting a new conversation.";
      } else if (error.message.includes("ECONNREFUSED")) {
        errorMessage =
          "Cannot connect to required services. Please ensure all servers are running.";
      } else if (error.message.includes("reduce") || error.message.includes("Cannot read properties")) {
        errorMessage =
          "There was a compatibility issue with the AI model. Please try your request again.";
      }
    }

    return NextResponse.json(
      {
        response: errorMessage,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
