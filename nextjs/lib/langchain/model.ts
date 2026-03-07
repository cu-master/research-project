import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { ModelProvider } from "./types";
import { LLM_PROVIDER } from "./config";

export interface CreateModelOptions {
  provider?: ModelProvider;
  model?: string;
  temperature?: number;
}

export function createModel(options?: CreateModelOptions): BaseChatModel {
  const provider = options?.provider || LLM_PROVIDER;

  switch (provider) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      const modelName = options?.model || process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
      if (!apiKey) {
        throw new Error("Missing ANTHROPIC_API_KEY for Anthropic provider.");
      }
      console.log(`Using Anthropic model: ${modelName}`);
      return new ChatAnthropic({
        apiKey,
        model: modelName,
        temperature: options?.temperature,
      });
    }

    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      const modelName = options?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
      if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY for OpenAI provider.");
      }
      console.log(`Using OpenAI model: ${modelName}`);
      return new ChatOpenAI({
        apiKey,
        model: modelName,
        temperature: options?.temperature,
      });
    }

    case "groq": {
      const apiKey = process.env.GROQ_API_KEY;
      const modelName =
        options?.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      if (!apiKey) {
        throw new Error("Missing GROQ_API_KEY for Groq provider.");
      }
      console.log(`Using Groq model: ${modelName}`);
      return new ChatOpenAI({
        apiKey,
        model: modelName,
        configuration: {
          baseURL: "https://api.groq.com/openai/v1",
        },
        temperature: options?.temperature,
      });
    }

    case "google":
    default: {
      const apiKey = process.env.GOOGLE_API_KEY;
      const modelName = options?.model || process.env.GOOGLE_MODEL || "gemini-1.5-flash";
      if (!apiKey) {
        throw new Error("Missing GOOGLE_API_KEY for Google provider.");
      }
      console.log(`Using Google model: ${modelName}`);
      return new ChatGoogleGenerativeAI({
        apiKey,
        model: modelName,
        temperature: options?.temperature,
      });
    }
  }
}
