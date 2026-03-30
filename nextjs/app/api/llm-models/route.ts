import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getEffectiveApiKeyForProvider } from "@/lib/llm/effective-api-key";
import { listModelsForProvider } from "@/lib/llm/provider-models";
import type { ModelProvider } from "@/lib/langchain/types";

const VALID_PROVIDERS: ModelProvider[] = ["google", "anthropic", "openai", "groq"];

/**
 * GET /api/llm-models?provider=openai
 * Lists models from the provider API when an API key is available (env or saved per-user), else returns a small fallback list.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") as ModelProvider | null;
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { error: `Invalid or missing provider. Use one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  const apiKey = await getEffectiveApiKeyForProvider(userId, provider);
  const result = await listModelsForProvider(provider, apiKey);

  return NextResponse.json({
    provider,
    models: result.models,
    source: result.source,
    ...(result.warning ? { warning: result.warning } : {}),
  });
}
