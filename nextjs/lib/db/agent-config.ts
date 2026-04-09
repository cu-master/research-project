import prisma from "./prisma";

interface AgentConfigData {
  provider: string;
  model: string;
  /** Optional API key override — stored per user, takes priority over .env */
  api_key?: string | null;
}

/**
 * Get the agent config for a user.
 * Returns null if the user has not saved a config yet.
 */
export async function getUserAgentConfig(userId: string): Promise<AgentConfigData | null> {
  const config = await prisma.agentConfig.findUnique({
    where: { user_id: userId },
  });
  if (!config) return null;
  return {
    provider: config.provider,
    model: config.model,
    api_key: config.api_key,
  };
}

/**
 * Upsert the agent config for a user (create on first save, update thereafter).
 */
export async function upsertUserAgentConfig(
  userId: string,
  config: AgentConfigData
): Promise<void> {
  await prisma.agentConfig.upsert({
    where: { user_id: userId },
    update: {
      provider: config.provider,
      model: config.model,
      ...(config.api_key !== undefined
        ? { api_key: config.api_key }
        : {}),
    },
    create: {
      user_id: userId,
      provider: config.provider,
      model: config.model,
      api_key: config.api_key ?? null,
    },
  });
}
