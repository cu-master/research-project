import prisma from "@/lib/db/prisma";

/**
 * NFR-06: Token Budgeting & Cost Control.
 *
 * Implements the three caps the spec requires:
 *   1. Per-request limit: 4,000 tokens (input + output combined).
 *   2. Recursive-loop protection: max 5 consecutive tool calls per request.
 *   3. Session quota: 50,000 cumulative tokens per session id.
 *
 * Token counts are estimated rather than measured. We use ~4 characters per
 * token (the rule of thumb for English text on GPT/Claude/Gemini tokenizers);
 * accuracy is within ~15% which is plenty for budgeting decisions and avoids
 * pulling in a model-specific tokenizer dependency. The on-the-fly approach
 * also means we don't need a schema migration to persist per-message token
 * counts — the same `content` text the chat already stores is the source of
 * truth.
 */

export const MAX_REQUEST_TOKENS = 4_000;
export const MAX_SESSION_TOKENS = 50_000;
export const MAX_TOOL_CALLS = 5;

/** Upper bound for `max_tokens` on the LLM output side of a single request. */
export const MAX_OUTPUT_TOKENS = 2_000;

/**
 * User-facing message returned when a budget is exceeded. The spec calls this
 * "Graceful Termination": the system should explain that the query is too
 * complex rather than silently failing.
 */
export const TOKEN_BUDGET_EXCEEDED_MESSAGE =
  "I can't process this query right now because it exceeds the configured " +
  "complexity budget for this conversation. This usually means either the " +
  "current message is very large or the chat history has grown too long. " +
  "Try shortening your question, or start a new chat to reset the budget.";

export const TOOL_LOOP_EXCEEDED_MESSAGE =
  "I had to stop because answering this request required more than " +
  `${MAX_TOOL_CALLS} consecutive tool calls. This usually indicates the ` +
  "question is too complex or the tools are looping. Try rephrasing your " +
  "question more specifically, or break it into smaller steps.";

/**
 * Rough token estimator. ~4 chars per token is the standard heuristic for
 * English text and is close enough for guardrails.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Sum estimated tokens across an array of message-like records. */
export function estimateMessageTokens(
  messages: Array<{ content: string | null | undefined }>
): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content ?? "");
  }
  return total;
}

/**
 * Returns the cumulative token estimate for a session by reading all
 * persisted messages. Falls back to 0 if the session doesn't exist yet (it
 * gets created on first message send).
 */
export async function getSessionTokenUsage(sessionId: string): Promise<number> {
  try {
    const rows = await prisma.message.findMany({
      where: { session_id: sessionId },
      select: { content: true },
    });
    return estimateMessageTokens(rows);
  } catch {
    return 0;
  }
}

export type BudgetVerdict =
  | { ok: true }
  | { ok: false; reason: "request_too_large" | "session_quota_exceeded"; message: string };

/**
 * Pre-flight budget check before invoking the agent.
 *
 *  - request_too_large: the incoming user message alone would already exceed
 *    the 4k per-request budget (we reserve ~half for model output).
 *  - session_quota_exceeded: adding this message would push the session past
 *    the 50k cumulative cap.
 */
export async function checkRequestBudget(
  sessionId: string | undefined,
  userMessage: string
): Promise<BudgetVerdict> {
  const inputTokens = estimateTokens(userMessage);
  const requestBudget = MAX_REQUEST_TOKENS - MAX_OUTPUT_TOKENS;
  if (inputTokens > requestBudget) {
    return {
      ok: false,
      reason: "request_too_large",
      message: TOKEN_BUDGET_EXCEEDED_MESSAGE,
    };
  }

  if (sessionId) {
    const sessionTokens = await getSessionTokenUsage(sessionId);
    if (sessionTokens + inputTokens > MAX_SESSION_TOKENS) {
      return {
        ok: false,
        reason: "session_quota_exceeded",
        message: TOKEN_BUDGET_EXCEEDED_MESSAGE,
      };
    }
  }

  return { ok: true };
}
