import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { ModelProvider } from "./types";
import { LLM_PROVIDER } from "./config";
import { MAX_OUTPUT_TOKENS } from "./token-budget";

interface CreateModelOptions {
  provider?: ModelProvider;
  model?: string;
  temperature?: number;
  /** Override the output-token cap. Defaults to MAX_OUTPUT_TOKENS (chat budget). */
  maxTokens?: number;
}

/** Returns the API key for a provider from env vars, or undefined when unset. */
function getApiKey(provider: ModelProvider): string | undefined {
  return {
    google: process.env.GOOGLE_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    groq: process.env.GROQ_API_KEY,
  }[provider];
}

/** Resolves the active provider/model purely from env configuration. */
export function getActiveModelConfig(): { provider: ModelProvider; model: string } {
  const provider = LLM_PROVIDER;
  const model =
    provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest"
      : provider === "openai"
      ? process.env.OPENAI_MODEL ?? "gpt-4o-mini"
      : provider === "groq"
      ? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"
      : process.env.GOOGLE_MODEL ?? "gemini-1.5-flash";
  return { provider, model };
}

export function createModel(options?: CreateModelOptions): BaseChatModel {
  const provider = options?.provider ?? LLM_PROVIDER;
  const maxTokens = options?.maxTokens ?? MAX_OUTPUT_TOKENS;

  switch (provider) {
    // NFR-06: cap output tokens per request so a single response can't blow
    // through the 4k/request budget. Input side is gated separately in
    // checkRequestBudget() before this model is even invoked.
    case "anthropic": {
      const apiKey = getApiKey("anthropic");
      const modelName =
        options?.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
      if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY for Anthropic provider.");
      console.log(`Using Anthropic model: ${modelName}`);
      return new ChatAnthropic({
        apiKey,
        model: modelName,
        temperature: options?.temperature,
        maxTokens,
      });
    }

    case "openai": {
      const apiKey = getApiKey("openai");
      const modelName =
        options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      if (!apiKey) throw new Error("Missing OPENAI_API_KEY for OpenAI provider.");
      console.log(`Using OpenAI model: ${modelName}`);
      return new ChatOpenAI({
        apiKey,
        model: modelName,
        temperature: options?.temperature,
        maxTokens,
      });
    }

    case "groq": {
      const apiKey = getApiKey("groq");
      const modelName =
        options?.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
      if (!apiKey) throw new Error("Missing GROQ_API_KEY for Groq provider.");
      console.log(`Using Groq model: ${modelName}`);
      return new ChatOpenAI({
        apiKey,
        model: modelName,
        configuration: { baseURL: "https://api.groq.com/openai/v1" },
        temperature: options?.temperature,
        maxTokens,
      });
    }

    case "google":
    default: {
      const apiKey = getApiKey("google");
      const modelName =
        options?.model ?? process.env.GOOGLE_MODEL ?? "gemini-1.5-flash";
      if (!apiKey) throw new Error("Missing GOOGLE_API_KEY for Google provider.");
      console.log(`Using Google model: ${modelName}`);
      return new ChatGoogleGenerativeAI({
        apiKey,
        model: modelName,
        temperature: options?.temperature,
        maxOutputTokens: maxTokens,
      });
    }
  }
}
