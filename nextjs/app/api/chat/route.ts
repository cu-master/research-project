import { NextResponse } from "next/server";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import {
  ChatMessage,
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
import { getUserAgentConfig } from "@/lib/db/agent-config";
import { getRuntimeConfig, setRuntimeModel, setRuntimeApiKey } from "@/lib/langchain/model";
import { resetAgent } from "@/lib/langchain/agent";
import type { ModelProvider } from "@/lib/langchain/types";
import {
  MAX_TOOL_CALLS,
  TOOL_LOOP_EXCEEDED_MESSAGE,
  checkRequestBudget,
} from "@/lib/langchain/token-budget";

type StreamToolCall = {
  tool: string;
  input: string;
  log: string;
  observation: string;
};

type ChatStreamEvent =
  | { type: "tool_start"; tool: string; label: string }
  | { type: "tool_end"; tool: string; result: string }
  | { type: "text_chunk"; content: string }
  | { type: "done"; response: string; toolsUsed: StreamToolCall[]; latency: number }
  | { type: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  obda_query_with_ontop: "Running ontology query",
  generate_r2rml_mapping: "Generating ontology mapping",
  answer_query: "Searching project content",
  summarize_content: "Summarizing project context",
  explain_mapping: "Interpreting ontology mapping",
  database_list_tables: "Inspecting database tables",
  database_get_table_schema: "Inspecting table schema",
};

// Multi-word patterns whose first word already appears as a single-word pattern
// (drop table, alter table, delete all, update record) are omitted as redundant —
// the broader \bdrop\b / \balter\b / \bdelete\b / \bupdate\b already match them.
const MUTATION_INTENT_PATTERNS: RegExp[] = [
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\binsert\b/i,
  /\bupdate\b/i,
  /\btruncate\b/i,
  /\balter\b/i,
  /\bcreate\s+table\b/i,
  /\bremove\s+all\b/i,
  /\badd\s+a\s+record\b/i,
];

function isMutationIntent(message: string): boolean {
  return MUTATION_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

function toToolLabel(toolName: string): string {
  if (TOOL_LABELS[toolName]) return TOOL_LABELS[toolName];
  const prettyName = toolName.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const titled = prettyName.replace(/\b\w/g, (c) => c.toUpperCase());
  return `Working with ${titled}`;
}

function truncateForProgress(text: string, max = 400): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function buildKnownTablesLines(schemaValue: unknown): string[] {
  if (!schemaValue || typeof schemaValue !== "object" || Array.isArray(schemaValue)) {
    return [];
  }

  const tables = (schemaValue as { tables?: unknown }).tables;
  if (!Array.isArray(tables)) return [];

  return tables
    .map((table) => {
      if (!table || typeof table !== "object" || Array.isArray(table)) return null;
      const tableName = (table as { name?: unknown }).name;
      if (typeof tableName !== "string" || tableName.trim().length === 0) return null;

      const columnsRaw = (table as { columns?: unknown }).columns;
      const columns = Array.isArray(columnsRaw)
        ? columnsRaw
            .map((column) => {
              if (!column || typeof column !== "object" || Array.isArray(column)) return null;
              const columnName = (column as { name?: unknown }).name;
              return typeof columnName === "string" && columnName.trim().length > 0
                ? columnName.trim()
                : null;
            })
            .filter((name): name is string => Boolean(name))
        : [];

      const columnList = columns.length > 0 ? columns.join(", ") : "no columns";
      return `- ${tableName} (${columnList})`;
    })
    .filter((line): line is string => Boolean(line));
}

// Maps a thrown error to a user-facing message. Shared by the in-stream error event and the
// outer catch; `isRecursionLimit` lets the outer catch return a 400 instead of a 500.
function classifyChatError(error: unknown): { message: string; isRecursionLimit: boolean } {
  if (error instanceof Error) {
    if (
      (error as Error & { lc_error_code?: string }).lc_error_code === "GRAPH_RECURSION_LIMIT" ||
      error.message.includes("GRAPH_RECURSION_LIMIT") ||
      error.message.includes("Recursion limit")
    ) {
      return {
        message:
          "I'm sorry, but I wasn't able to complete your request. " +
          "The query required too many processing steps. This can happen when the generated query fails validation repeatedly. " +
          "Please try rephrasing your question or simplifying your request.",
        isRecursionLimit: true,
      };
    }
    if (error.message.includes("invalid_request_error")) {
      return {
        message: "There was an issue with the AI service. Please try starting a new conversation.",
        isRecursionLimit: false,
      };
    }
    if (error.message.includes("ECONNREFUSED")) {
      return {
        message: "Cannot connect to required services. Please ensure all servers are running.",
        isRecursionLimit: false,
      };
    }
    if (error.message.includes("reduce") || error.message.includes("Cannot read properties")) {
      return {
        message: "There was a compatibility issue with the AI model. Please try your request again.",
        isRecursionLimit: false,
      };
    }
  }
  return {
    message: "An error occurred while processing your request.",
    isRecursionLimit: false,
  };
}

// NFR-02/NFR-06 fast-path: stream a single "graceful termination" message in the same ndjson
// shape as a normal assistant reply, persisting both messages so the UI history stays correct.
function streamGracefulMessage(
  responseMessage: string,
  sessionId: string | undefined,
  userMessage: string
): Response {
  const startTime = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      void (async () => {
        const latency = (Date.now() - startTime) / 1000;
        if (sessionId) {
          try {
            await saveMessage(sessionId, "user", userMessage);
            await saveMessage(sessionId, "assistant", responseMessage, undefined, [], latency);
          } catch (dbErr) {
            console.warn("[DB] Graceful fast-path: failed to save messages:", dbErr);
          }
        }
        const doneEvent: ChatStreamEvent = {
          type: "done",
          response: responseMessage,
          toolsUsed: [],
          latency,
        };
        controller.enqueue(encoder.encode(`${JSON.stringify(doneEvent)}\n`));
        controller.close();
      })();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

type ProjectContextResult =
  | { sessionNotFound: true }
  | { sessionNotFound: false; projectContext: string; projectIdToUse: string | null };

// Verifies the session (if any) and assembles the [PROJECT CONTEXT] block: prefers the session's
// project, falling back to the user's default. Returns sessionNotFound so the route can 404.
async function buildProjectContext(
  userId: string,
  sessionId: string | undefined
): Promise<ProjectContextResult> {
  let sessionProjectId: string | null = null;
  if (sessionId) {
    try {
      const session = await getSession(sessionId, userId);
      if (!session) {
        return { sessionNotFound: true };
      }
      sessionProjectId = session.project_id || null;
    } catch (error) {
      console.warn("[Context] Could not verify session:", error);
    }
  }

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
        let knownTablesLines: string[] = [];
        if (project.content && project.content.trim()) {
          capabilities.push("URL Content (use 'answer_query' or 'summarize_content' tools to access)");
        }
        if (project.db_schema && Object.keys(project.db_schema).length > 0) {
          capabilities.push("Database Schema (use database tools to query)");
          knownTablesLines = buildKnownTablesLines(project.db_schema);
        }
        if (project.r2rml_mapping && project.r2rml_mapping.trim()) {
          capabilities.push("R2RML Mapping (use 'obda_query_with_ontop' for queries or 'explain_mapping' to understand it)");
        }

        if (capabilities.length > 0) {
          contextParts.push(`\nAvailable project data:\n- ${capabilities.join("\n- ")}`);
        } else {
          contextParts.push(`\nThis project has no data configured yet.`);
        }
        if (knownTablesLines.length > 0) {
          contextParts.push(`\nKnown tables:\n${knownTablesLines.join("\n")}`);
        }

        projectContext = contextParts.join("\n");
        console.log(`[Context] Project "${project.name}" loaded for session ${sessionId || "(new)"}`);
      }
    }
  } catch (error) {
    console.warn("[Context] Could not load project:", error);
  }

  return { sessionNotFound: false, projectContext, projectIdToUse };
}

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
    const validSessionId =
      typeof sessionId === "string" && sessionId.trim() !== "" ? sessionId : undefined;

    // NFR-06: enforce per-request + per-session token budget BEFORE we spend any
    // model/tool credits. Returns a streamed graceful-termination message.
    const budgetVerdict = await checkRequestBudget(validSessionId, safeMessage);
    if (!budgetVerdict.ok) {
      console.log(
        `[NFR-06] Budget rejected (${budgetVerdict.reason}) for session=${validSessionId ?? "(none)"}`
      );
      return streamGracefulMessage(budgetVerdict.message, validSessionId, safeMessage);
    }

    // NFR-02 fast-path: block write intent before invoking model/tools.
    if (isMutationIntent(safeMessage)) {
      console.log("Processing message:", safeMessage, "| LLM: (skipped — read-only guard)");
      const refusalResponse =
        "I'm sorry, but I cannot perform that operation. Deleting, inserting, or modifying data is not permitted — this system only allows read-only SELECT queries for data safety.\n\n" +
        "I can, however, help you find information with a read-only query. If you'd like, ask for a report, list, or summary from the database.";
      return streamGracefulMessage(refusalResponse, validSessionId, safeMessage);
    }

    // Verify the session (if provided) and assemble project context.
    const ctx = await buildProjectContext(userId, validSessionId);
    if (ctx.sessionNotFound) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const { projectContext, projectIdToUse } = ctx;

    const safeHistory = Array.isArray(history) ? history : [];
    const chatHistory = safeHistory
      .map((msg: ChatMessage) => convertToLangChainMessage(msg))
      .filter((msg: HumanMessage | AIMessage | null): msg is HumanMessage | AIMessage => msg !== null);

    // Rehydrate agent config from the DB (user-scoped) if runtime is still on defaults.
    // This ensures the saved provider/model is used after a server restart.
    try {
      const { provider: rp } = getRuntimeConfig();
      const isDefault = !rp || rp === (process.env.LLM_PROVIDER ?? "google");
      if (isDefault) {
        const savedConfig = await getUserAgentConfig(userId);
        if (savedConfig) {
          setRuntimeModel(savedConfig.provider as ModelProvider, savedConfig.model);
          if (savedConfig.api_key) {
            setRuntimeApiKey(savedConfig.provider as ModelProvider, savedConfig.api_key);
          }
          resetAgent();
        }
      }
    } catch (err) {
      console.warn("[Chat] Could not rehydrate agent config:", err);
    }

    const { provider: llmProvider, model: llmModel } = getRuntimeConfig();
    console.log("Processing message:", safeMessage, "| LLM:", `${llmProvider}/${llmModel}`);

    const messageContent = buildMessageContent(safeMessage);

    const agent = await getAgent();

    // Append default project context to the message if available
    const messagesToSend = projectContext
      ? [...chatHistory, new HumanMessage(messageContent + "\n\n" + projectContext)]
      : [...chatHistory, new HumanMessage(messageContent)];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const emit = (event: ChatStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        void (async () => {
          const startTime = Date.now();
          let responseText = "";
          const toolCalls: StreamToolCall[] = [];
          const toolIndexByRunId = new Map<string, number>();
          // NFR-06: hoisted so the post-stream override can read it.
          let toolLoopExceeded = false;

          try {
            await runWithLangChainRequestContext(
              {
                sessionId: validSessionId,
                projectId: projectIdToUse ?? undefined,
                userId,
              },
              async () => {
                // NFR-06: 5-step recursion ceiling. recursionLimit on the
                // LangGraph runtime counts graph steps (LLM call + tool call
                // ≈ 2 steps each), so we set it generously here and enforce
                // the explicit 5-tool-call ceiling in the loop below — that
                // matches the spec wording "5 consecutive tool calls" rather
                // than internal graph nodes.
                const eventStream = agent.streamEvents(
                  { messages: messagesToSend },
                  { recursionLimit: 25, version: "v2" }
                );

                for await (const event of eventStream) {
                  if (event.event === "on_tool_start") {
                    const toolName = event.name;
                    const toolInput = serializeToolInput(event.data?.input ?? {});
                    toolIndexByRunId.set(event.run_id, toolCalls.length);
                    toolCalls.push({
                      tool: toolName,
                      input: toolInput,
                      log: "",
                      observation: "",
                    });
                    emit({
                      type: "tool_start",
                      tool: toolName,
                      label: toToolLabel(toolName),
                    });

                    // NFR-06 (Recursive Loop Protection): bail out as soon as
                    // a 6th tool call is initiated. We let the in-flight tool
                    // finish so the partial state is consistent, then break.
                    if (toolCalls.length > MAX_TOOL_CALLS) {
                      console.warn(
                        `[NFR-06] Aborting agent: exceeded ${MAX_TOOL_CALLS} tool calls (got ${toolCalls.length})`
                      );
                      toolLoopExceeded = true;
                    }
                  } else if (event.event === "on_tool_end") {
                    const idx = toolIndexByRunId.get(event.run_id);
                    const outputText = extractText(event.data?.output ?? "");
                    const toolName =
                      idx !== undefined ? toolCalls[idx].tool : event.name;

                    if (idx !== undefined) {
                      toolCalls[idx].observation = outputText;
                    } else {
                      toolCalls.push({
                        tool: toolName,
                        input: "",
                        log: "",
                        observation: outputText,
                      });
                    }

                    emit({
                      type: "tool_end",
                      tool: toolName,
                      result: truncateForProgress(outputText),
                    });

                    // NFR-06: stop draining the event stream once we've
                    // recorded the last allowed tool's result. The graceful-
                    // termination message replaces the model's natural reply
                    // below.
                    if (toolLoopExceeded) break;
                  } else if (event.event === "on_chat_model_stream") {
                    const chunkText = extractText(event.data?.chunk ?? "");
                    if (chunkText) {
                      responseText += chunkText;
                      emit({ type: "text_chunk", content: chunkText });
                    }
                  }
                }
              }
            );

            // NFR-06: when the tool-call ceiling was hit, override whatever
            // partial text the model produced with the spec-mandated graceful
            // termination message so the user knows the chain was capped.
            if (toolLoopExceeded) {
              responseText = TOOL_LOOP_EXCEEDED_MESSAGE;
            }

            // Fallback: use last tool result if response is still empty
            if (!responseText.trim() && toolCalls.length > 0) {
              const lastToolResult = toolCalls[toolCalls.length - 1];
              if (lastToolResult.observation) {
                responseText = lastToolResult.observation;
              }
            }

            const endTime = Date.now();
            const latency = (endTime - startTime) / 1000;
            const finalResponse =
              responseText.trim() ||
              "I wasn't able to process your request. Please try rephrasing your question.";

            // Save messages to database if sessionId is provided
            if (validSessionId) {
              try {
                await saveMessage(validSessionId, "user", safeMessage);
                await saveMessage(
                  validSessionId,
                  "assistant",
                  finalResponse,
                  undefined,
                  toolCalls.length > 0 ? toolCalls : undefined,
                  latency || undefined
                );
              } catch (dbError) {
                console.error("[DB] Failed to save messages to database:", dbError);
                console.error("[DB] Error details:", {
                  name: dbError instanceof Error ? dbError.name : "Unknown",
                  message: dbError instanceof Error ? dbError.message : String(dbError),
                  stack: dbError instanceof Error ? dbError.stack : undefined,
                });

                if (dbError instanceof Error) {
                  if (
                    dbError.message.includes("DATABASE_URL") ||
                    dbError.message.includes("connection")
                  ) {
                    console.error(
                      "[DB] Database connection issue - check DATABASE_URL environment variable"
                    );
                  }
                }
              }
            }

            emit({
              type: "done",
              response: finalResponse,
              toolsUsed: toolCalls,
              latency,
            });
            controller.close();
          } catch (error) {
            console.error("Error processing request stream:", error);
            const { message: errorMessage } = classifyChatError(error);
            emit({ type: "error", message: errorMessage });
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Expose the model that actually served this request (after DB rehydration),
        // so observability/benchmarks report the true model, not a stale .env label.
        "x-llm-provider": llmProvider,
        "x-llm-model": llmModel,
      },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    console.error("Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const { message, isRecursionLimit } = classifyChatError(error);
    // NFR-02: a rejected mutating query that exhausts the retry loop surfaces as a
    // recursion-limit error — return a clean 400 rather than a 500.
    if (isRecursionLimit) {
      return NextResponse.json(
        { response: message, error: "Processing limit reached" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { response: message, error: "Internal server error" },
      { status: 500 }
    );
  }
}
