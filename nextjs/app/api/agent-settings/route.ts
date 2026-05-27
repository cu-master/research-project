import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getRuntimeConfig, setRuntimeModel, setRuntimeApiKey } from "@/lib/langchain/model";
import { resetAgent } from "@/lib/langchain/agent";
import { getUserAgentConfig, upsertUserAgentConfig } from "@/lib/db/agent-config";
import type { ModelProvider } from "@/lib/langchain/types";

const VALID_PROVIDERS: ModelProvider[] = ["google", "anthropic", "openai", "groq"];

// GET /api/agent-settings — returns the user's agent config; rehydrates runtime from DB on cold start.
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { provider: rp } = getRuntimeConfig();
    const isDefault = !rp || rp === (process.env.LLM_PROVIDER ?? "google");
    if (isDefault) {
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

// PUT /api/agent-settings — updates provider/model/apiKey in both runtime and DB.
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

  setRuntimeModel(provider as ModelProvider, cleanModel);
  if (cleanKey) setRuntimeApiKey(provider as ModelProvider, cleanKey);
  resetAgent();

  try {
    await upsertUserAgentConfig(userId, {
      provider,
      model: cleanModel,
      api_key: cleanKey ?? null,
    });
    console.log(`[AgentSettings] Saved for user ${userId}: provider=${provider}, model=${cleanModel}, apiKey=${cleanKey ? "[set]" : "[env]"}`);
  } catch (err) {
    // Runtime was already updated — DB failure is non-fatal.
    console.error("[AgentSettings] Failed to persist to DB:", err);
  }

  return NextResponse.json({
    success: true,
    provider,
    model: cleanModel,
    hasRuntimeKey: !!cleanKey || getRuntimeConfig().hasRuntimeKey,
  });
}
