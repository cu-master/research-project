import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMConfig } from "../types.js";

// ============================================================================
// AI Client Instances (Singleton Pattern)
// ============================================================================

let anthropicClient: Anthropic | null = null;
let googleClient: GoogleGenerativeAI | null = null;

// ============================================================================
// Client Getters
// ============================================================================

function getAnthropicClient(apiKey: string | undefined): Anthropic {
  if (!anthropicClient) {
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable is required."
      );
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function getGoogleClient(apiKey: string | undefined): GoogleGenerativeAI {
  if (!googleClient) {
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is required.");
    }
    googleClient = new GoogleGenerativeAI(apiKey);
  }
  return googleClient;
}

// ============================================================================
// AI Call Functions
// ============================================================================

async function callAnthropic(
  config: LLMConfig,
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const client = getAnthropicClient(config.anthropicKey);
  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
    temperature,
  });

  const firstContent = response.content[0];
  if (firstContent && "text" in firstContent) {
    return firstContent.text;
  }
  return "Unexpected response structure from Anthropic API.";
}

async function callGoogle(
  config: LLMConfig,
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const client = getGoogleClient(config.googleKey);
  const model = client.getGenerativeModel({
    model: config.googleModel,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason;

  // Check for safety/blocking issues first (even if there's partial text)
  if (finishReason === "SAFETY") {
    console.error("Google AI blocked due to safety filters");
    return "The AI was unable to generate a response due to content safety filters.";
  }

  // Log if response is empty
  if (!text || text.trim().length === 0) {
    console.error("Google AI returned empty response");
    console.error("Prompt length:", prompt.length);
    console.error("Finish reason:", finishReason);

    if (finishReason === "MAX_TOKENS") {
      return "The response was cut off due to token limits. Try requesting fewer examples or specific entities.";
    }

    return "The AI returned an empty response. Try a more specific request.";
  }

  // If we got text but hit MAX_TOKENS, log but return what we have
  if (finishReason === "MAX_TOKENS") {
    console.log(
      `Response was truncated at ${text.length} chars due to MAX_TOKENS`
    );
  }

  return text;
}

async function callGroq(
  config: LLMConfig,
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  if (!config.groqKey) {
    throw new Error("GROQ_API_KEY environment variable is required.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.groqModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Groq API request failed with HTTP ${response.status}: ${errorBody}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    return "Unexpected response structure from Groq API.";
  }
  return text;
}

async function callOpenAI(
  config: LLMConfig,
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  if (!config.openaiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required.");
  }

  const basePayload = {
    model: config.openaiModel,
    messages: [{ role: "user" as const, content: prompt }],
    temperature,
  };

  // Newer OpenAI models (including GPT-5 family) expect max_completion_tokens.
  // Keep a fallback to max_tokens for older compatibility.
  let response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...basePayload,
      max_completion_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const firstErrorBody = await response.text();
    const shouldRetryWithLegacyMaxTokens =
      response.status === 400 &&
      firstErrorBody.includes("max_completion_tokens") &&
      firstErrorBody.includes("Use 'max_tokens' instead");

    if (!shouldRetryWithLegacyMaxTokens) {
      throw new Error(
        `OpenAI API request failed with HTTP ${response.status}: ${firstErrorBody}`
      );
    }

    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...basePayload,
        max_tokens: maxTokens,
      }),
    });
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI API request failed with HTTP ${response.status}: ${errorBody}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    return "Unexpected response structure from OpenAI API.";
  }
  return text;
}

// ============================================================================
// AI Provider Factory
// ============================================================================

interface CallAIOptions {
  maxTokens?: number;
  temperature?: number;
}

/**
 * Creates an AI caller function bound to a specific configuration.
 * This allows each server to have its own configuration while sharing the implementation.
 */
export function createAICaller(config: LLMConfig) {
  return async function callAI(
    prompt: string,
    options: CallAIOptions = {}
  ): Promise<string> {
    const { maxTokens = 4000, temperature = 0.2 } = options;

    if (config.provider === "google") {
      return callGoogle(config, prompt, maxTokens, temperature);
    }
    if (config.provider === "groq") {
      return callGroq(config, prompt, maxTokens, temperature);
    }
    if (config.provider === "openai") {
      return callOpenAI(config, prompt, maxTokens, temperature);
    }
    return callAnthropic(config, prompt, maxTokens, temperature);
  };
}


