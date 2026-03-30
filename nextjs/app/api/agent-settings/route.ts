import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getRuntimeConfig, setRuntimeModel, setRuntimeApiKey } from "@/lib/langchain/model";
import { resetAgent } from "@/lib/langchain/agent";
import { getUserAgentConfig, upsertUserAgentConfig } from "@/lib/db/agent-config";
import type { ModelProvider } from "@/lib/langchain/types";

const VALID_PROVIDERS: ModelProvider[] = ["google", "anthropic", "openai", "groq"];

/**
 * GET /api/agent-settings
 * Returns the agent config for the authenticated user.
 * On cold start (runtime is default) it reads from the DB and rehydrates the runtime.
 */
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { provider: rp } = getRuntimeConfig();
    const isDefault = !rp || rp === (process.env.LLM_PROVIDER ?? "google");
    if (isDefault) {
      // Cold start — rehydrate from DB
      const saved = await getUserAgentConfig(userId);
      if (saved) {
        setRuntimeModel(saved.provider as ModelProvider, saved.model);
        if (saved.api_key) setRuntimeApiKey(saved.provider as ModelProvider, saved.api_key);
        resetAgent();
      }
    }
  } catch (err) {
    console.warn("[AgentSettings] Could not load user agent config:", err);
  }

  return NextResponse.json(getRuntimeConfig());
}

/**
 * PUT /api/agent-settings
 * Updates provider, model, and optional API key in both the runtime and the DB.
 */
export async function PUT(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { provider, model, apiKey } = body as {
    provider?: string;
    model?: string;
    apiKey?: string;
  };

  if (!provider || !VALID_PROVIDERS.includes(provider as ModelProvider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!model || typeof model !== "string" || !model.trim()) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }

  const cleanModel = model.trim();
  const cleanKey = apiKey?.trim() || undefined;

  // 1. Update runtime immediately
  setRuntimeModel(provider as ModelProvider, cleanModel);
  if (cleanKey) setRuntimeApiKey(provider as ModelProvider, cleanKey);
  resetAgent();

  // 2. Persist to the agent_configs table (upsert)
  try {
    await upsertUserAgentConfig(userId, {
      provider,
      model: cleanModel,
      api_key: cleanKey ?? null,
    });
    console.log(`[AgentSettings] Saved for user ${userId}: provider=${provider}, model=${cleanModel}, apiKey=${cleanKey ? "[set]" : "[env]"}`);
  } catch (err) {
    console.error("[AgentSettings] Failed to persist to DB:", err);
    // Runtime was already updated — still return success
  }

  return NextResponse.json({
    success: true,
    provider,
    model: cleanModel,
    hasRuntimeKey: !!cleanKey || getRuntimeConfig().hasRuntimeKey,
  });
}
