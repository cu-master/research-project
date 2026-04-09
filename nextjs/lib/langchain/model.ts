import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { ModelProvider } from "./types";
import { LLM_PROVIDER } from "./config";

interface CreateModelOptions {
  provider?: ModelProvider;
  model?: string;
  temperature?: number;
}

// ---------------------------------------------------------------------------
// Runtime overrides — updated by PUT /api/agent-settings without server restart
// ---------------------------------------------------------------------------
let runtimeProvider: ModelProvider | null = null;
let runtimeModel: string | null = null;

// Per-provider runtime API keys (take priority over env vars when set)
const runtimeApiKeys: Partial<Record<ModelProvider, string>> = {};

export function setRuntimeModel(provider: ModelProvider, model: string) {
  runtimeProvider = provider;
  runtimeModel = model;
}

export function setRuntimeApiKey(provider: ModelProvider, apiKey: string) {
  runtimeApiKeys[provider] = apiKey;
}

/** Returns the effective API key for a provider: runtime override → env var → undefined */
function getApiKey(provider: ModelProvider): string | undefined {
  return (
    runtimeApiKeys[provider] ||
    {
      google: process.env.GOOGLE_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      groq: process.env.GROQ_API_KEY,
    }[provider]
  );
}

export function getRuntimeConfig(): {
  provider: ModelProvider;
  model: string;
  /** true = a runtime API key is stored (overriding .env), false = using .env */
  hasRuntimeKey: boolean;
} {
  const provider = runtimeProvider ?? LLM_PROVIDER;
  const model =
    runtimeModel ??
    (provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest"
      : provider === "openai"
      ? process.env.OPENAI_MODEL ?? "gpt-4o-mini"
      : provider === "groq"
      ? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"
      : process.env.GOOGLE_MODEL ?? "gemini-1.5-flash");
  return { provider, model, hasRuntimeKey: !!runtimeApiKeys[provider] };
}

export function createModel(options?: CreateModelOptions): BaseChatModel {
  const provider = options?.provider ?? runtimeProvider ?? LLM_PROVIDER;

  switch (provider) {
    case "anthropic": {
      const apiKey = getApiKey("anthropic");
      const modelName =
        options?.model ?? runtimeModel ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
      if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY for Anthropic provider.");
      console.log(`Using Anthropic model: ${modelName}`);
      return new ChatAnthropic({ apiKey, model: modelName, temperature: options?.temperature });
    }

    case "openai": {
      const apiKey = getApiKey("openai");
      const modelName =
        options?.model ?? runtimeModel ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      if (!apiKey) throw new Error("Missing OPENAI_API_KEY for OpenAI provider.");
      console.log(`Using OpenAI model: ${modelName}`);
      return new ChatOpenAI({ apiKey, model: modelName, temperature: options?.temperature });
    }

    case "groq": {
      const apiKey = getApiKey("groq");
      const modelName =
        options?.model ?? runtimeModel ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
      if (!apiKey) throw new Error("Missing GROQ_API_KEY for Groq provider.");
      console.log(`Using Groq model: ${modelName}`);
      return new ChatOpenAI({
        apiKey,
        model: modelName,
        configuration: { baseURL: "https://api.groq.com/openai/v1" },
        temperature: options?.temperature,
      });
    }

    case "google":
    default: {
      const apiKey = getApiKey("google");
      const modelName =
        options?.model ?? runtimeModel ?? process.env.GOOGLE_MODEL ?? "gemini-1.5-flash";
      if (!apiKey) throw new Error("Missing GOOGLE_API_KEY for Google provider.");
      console.log(`Using Google model: ${modelName}`);
      return new ChatGoogleGenerativeAI({ apiKey, model: modelName, temperature: options?.temperature });
    }
  }
}
