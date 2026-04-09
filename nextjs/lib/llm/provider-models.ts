import type { ModelProvider } from "@/lib/langchain/types";

const FALLBACK_MODELS: Record<ModelProvider, { value: string; label: string }[]> = {
  google: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
    { value: "claude-3-opus-latest", label: "Claude 3 Opus" },
  ],
  openai: [
    { value: "o3-mini", label: "o3-mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
};

type ListModelsSource = "api" | "fallback";

interface ListModelsResult {
  models: { value: string; label: string }[];
  source: ListModelsSource;
  /** Present when source is fallback due to error or empty API response */
  warning?: string;
}

/** Higher = newer; used for ordering (newest first). */
type ModelRow = { value: string; label: string; sortKey: number };

function dedupeByValuePreferNewest(rows: ModelRow[]): ModelRow[] {
  const map = new Map<string, ModelRow>();
  for (const row of rows) {
    if (!row.value) continue;
    const existing = map.get(row.value);
    if (!existing || row.sortKey > existing.sortKey) map.set(row.value, row);
  }
  return [...map.values()].sort(
    (a, b) => b.sortKey - a.sortKey || a.value.localeCompare(b.value)
  );
}

function rowsToPublic(rows: ModelRow[]): { value: string; label: string }[] {
  return rows.map(({ value, label }) => ({ value, label }));
}

/** Gemini IDs: higher score ≈ newer family (2.5 > 2.0 > 1.5). */
function googleModelRecencySortKey(id: string, apiVersion?: string): number {
  const lower = id.toLowerCase();
  let score = 0;
  const xy = lower.match(/gemini-(\d+)\.(\d+)/);
  if (xy) {
    score = parseInt(xy[1], 10) * 10_000 + parseInt(xy[2], 10) * 100;
  } else {
    const digits = lower.match(/(\d+)\.(\d+)/);
    if (digits) {
      score = parseInt(digits[1], 10) * 10_000 + parseInt(digits[2], 10) * 100;
    }
  }
  if (/(?:^|-)exp(?:erimental)?|preview|preview-|latest/i.test(id)) score += 500;
  if (/\d{6,8}/.test(id)) score += 10;
  if (apiVersion && /^\d+$/.test(apiVersion)) {
    score += Math.min(parseInt(apiVersion, 10), 999) / 1000;
  }
  return score;
}

function isOpenAIChatModelId(id: string): boolean {
  if (/(embedding|whisper|tts|dall|moderation|davinci|curie|babbage|text-search|code-search)/i.test(id)) {
    return false;
  }
  if (/^gpt-|^o[0-9]|^chatgpt-/i.test(id)) return true;
  return false;
}

async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string,
  filter: (id: string) => boolean
): Promise<ModelRow[]> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${res.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as { data?: { id: string; created?: number }[] };
  const rows: ModelRow[] = [];
  let index = 0;
  for (const d of json.data ?? []) {
    if (!filter(d.id)) continue;
    const created = typeof d.created === "number" && d.created > 0 ? d.created : 0;
    const sortKey = created * 1_000_000 + (1_000_000 - Math.min(index, 999_999));
    rows.push({ value: d.id, label: d.id, sortKey });
    index++;
  }
  rows.sort((a, b) => b.sortKey - a.sortKey || a.value.localeCompare(b.value));
  return rows;
}

async function fetchGoogleModels(apiKey: string): Promise<ModelRow[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${res.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      version?: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  const out: ModelRow[] = [];
  let index = 0;
  for (const m of json.models ?? []) {
    const name = m.name ?? "";
    if (!name.startsWith("models/")) continue;
    const methods = m.supportedGenerationMethods ?? [];
    if (!methods.includes("generateContent")) continue;
    const value = name.replace(/^models\//, "");
    if (/embedding|deprecated|text-/i.test(value)) continue;
    const label = (m.displayName?.trim() || value).replace(/^models\//, "");
    const base = googleModelRecencySortKey(value, m.version);
    const sortKey = base * 1_000_000 + (1_000_000 - Math.min(index, 999_999));
    out.push({ value, label, sortKey });
    index++;
  }
  out.sort((a, b) => b.sortKey - a.sortKey || a.value.localeCompare(b.value));
  return out;
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelRow[]> {
  const all: ModelRow[] = [];
  let afterId: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ limit: "100" });
    if (afterId) params.set("after_id", afterId);
    const res = await fetch(`https://api.anthropic.com/v1/models?${params}`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`${res.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; display_name?: string; created_at?: string }>;
      has_more?: boolean;
      last_id?: string;
    };
    const data = json.data ?? [];
    let index = 0;
    for (const item of data) {
      if (!item.id) continue;
      const t = item.created_at ? Date.parse(item.created_at) : NaN;
      const createdMs = Number.isFinite(t) ? t : 0;
      const sortKey = createdMs * 1_000 + (1_000 - Math.min(index, 999));
      all.push({
        value: item.id,
        label: item.display_name?.trim() || item.id,
        sortKey,
      });
      index++;
    }
    if (!json.has_more || !data.length) break;
    afterId = json.last_id;
    if (!afterId) break;
  }
  all.sort((a, b) => b.sortKey - a.sortKey || a.value.localeCompare(b.value));
  return all;
}

/**
 * Fetches chat-capable models from the provider API, or falls back to a static list.
 */
export async function listModelsForProvider(
  provider: ModelProvider,
  apiKey: string | undefined
): Promise<ListModelsResult> {
  const fallback = FALLBACK_MODELS[provider];

  if (!apiKey) {
    return {
      models: fallback,
      source: "fallback",
      warning: "No API key configured — showing a short default list. Set your key in .env or save one below, then refresh.",
    };
  }

  try {
    let raw: ModelRow[] = [];
    switch (provider) {
      case "openai":
        raw = await fetchOpenAICompatibleModels("https://api.openai.com/v1", apiKey, isOpenAIChatModelId);
        break;
      case "groq":
        raw = await fetchOpenAICompatibleModels("https://api.groq.com/openai/v1", apiKey, () => true);
        break;
      case "google":
        raw = await fetchGoogleModels(apiKey);
        break;
      case "anthropic":
        raw = await fetchAnthropicModels(apiKey);
        break;
      default:
        raw = [];
    }

    const models = rowsToPublic(dedupeByValuePreferNewest(raw));
    if (!models.length) {
      return {
        models: fallback,
        source: "fallback",
        warning: "Provider returned no usable models — showing defaults.",
      };
    }
    return { models, source: "api" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return {
      models: fallback,
      source: "fallback",
      warning: `Could not load models from provider (${msg}). Showing defaults.`,
    };
  }
}
