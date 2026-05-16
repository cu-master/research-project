import prisma from "./prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-store";

interface AgentConfigData {
  provider: string;
  model: string;
  /** Optional API key override — stored per user, takes priority over .env */
  api_key?: string | null;
}

export async function getUserAgentConfig(userId: string): Promise<AgentConfigData | null> {
  const config = await prisma.agentConfig.findUnique({
    where: { user_id: userId },
  });
  if (!config) return null;

  let apiKey: string | null = config.api_key;
  if (apiKey) {
    try {
      apiKey = decryptSecret(apiKey);
    } catch (err) {
      console.error(`[AgentConfig] Failed to decrypt api_key for user ${userId}:`, err);
      apiKey = null;
    }
  }

  return {
    provider: config.provider,
    model: config.model,
    api_key: apiKey,
  };
}

export async function upsertUserAgentConfig(
  userId: string,
  config: AgentConfigData
): Promise<void> {
  const encryptedKey =
    config.api_key === undefined
      ? undefined
      : config.api_key === null || config.api_key === ""
        ? null
        : encryptSecret(config.api_key);

  await prisma.agentConfig.upsert({
    where: { user_id: userId },
    update: {
      provider: config.provider,
      model: config.model,
      ...(encryptedKey !== undefined ? { api_key: encryptedKey } : {}),
    },
    create: {
      user_id: userId,
      provider: config.provider,
      model: config.model,
      api_key: encryptedKey ?? null,
    },
  });
}
