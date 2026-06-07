import prisma from "@/lib/db/prisma";

// NFR-06: Token Budgeting & Cost Control. Three caps from the spec: per-request 4k tokens (input+output), max 5 consecutive tool calls, 50k cumulative session quota.
// Tokens are estimated at ~4 chars/token (accuracy ~15%) to avoid a model-specific tokenizer dep; on-the-fly estimation means no schema migration is needed to persist counts.

export const MAX_REQUEST_TOKENS = 4_000;
export const MAX_SESSION_TOKENS = 50_000;
export const MAX_TOOL_CALLS = 5;

// Max estimated tokens allowed for a single user message (input side). Kept
// independent of MAX_OUTPUT_TOKENS so raising the output/reply cap can never
// shrink (or negate) the input allowance — that coupling rejected every message.
export const MAX_INPUT_TOKENS = 2_000;

// Upper bound for `max_tokens` on the LLM output side of a single chat request.
export const MAX_OUTPUT_TOKENS = 8_000;

// R2RML generation is a one-shot, non-conversational call (POST
// /api/projects/generate-r2rml) that is NOT subject to the chat session budget,
// and a full mapping easily exceeds 2k output tokens — so it gets a larger cap
// to avoid the document being truncated mid-mapping.
export const R2RML_MAX_OUTPUT_TOKENS = 12_000;

// User-facing message for budget overflow. Spec calls this "Graceful Termination": explain the query is too complex rather than silently failing.
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

// Rough token estimator: ~4 chars per token (standard heuristic for English text, close enough for guardrails).
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Sum estimated tokens across an array of message-like records.
export function estimateMessageTokens(
  messages: Array<{ content: string | null | undefined }>
): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content ?? "");
  }
  return total;
}

// Falls back to 0 if the session doesn't exist yet (created on first message send).
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

// Pre-flight budget check: `request_too_large` if the user message alone exceeds the input cap; `session_quota_exceeded` if adding it pushes the session past 50k.
export async function checkRequestBudget(
  sessionId: string | undefined,
  userMessage: string
): Promise<BudgetVerdict> {
  const inputTokens = estimateTokens(userMessage);
  if (inputTokens > MAX_INPUT_TOKENS) {
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
