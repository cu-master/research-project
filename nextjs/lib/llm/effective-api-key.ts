import { getUserAgentConfig } from "@/lib/db/agent-config";
import type { ModelProvider } from "@/lib/langchain/types";

// Per-user override when saved config matches provider, else env.
export async function getEffectiveApiKeyForProvider(
  userId: string,
  provider: ModelProvider
): Promise<string | undefined> {
  const saved = await getUserAgentConfig(userId);
  if (saved?.provider === provider && saved.api_key?.trim()) {
    return saved.api_key.trim();
  }
  const env: Record<ModelProvider, string | undefined> = {
    google: process.env.GOOGLE_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };
  return env[provider]?.trim() || undefined;
}
