"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  CpuChipIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

type Provider = "google" | "anthropic" | "openai" | "groq";

interface ProviderMeta {
  label: string;
  color: string;
  apiKeyPlaceholder: string;
  apiKeyLabel: string;
  apiKeyEnvVar: string;
}

const PROVIDERS: Record<Provider, ProviderMeta> = {
  google: {
    label: "Google Gemini",
    color: "from-blue-500 to-cyan-400",
    apiKeyLabel: "Google API Key",
    apiKeyPlaceholder: "AIza...",
    apiKeyEnvVar: "GOOGLE_API_KEY",
  },
  anthropic: {
    label: "Anthropic Claude",
    color: "from-orange-500 to-amber-400",
    apiKeyLabel: "Anthropic API Key",
    apiKeyPlaceholder: "sk-ant-api03-...",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  openai: {
    label: "OpenAI GPT",
    color: "from-emerald-500 to-teal-400",
    apiKeyLabel: "OpenAI API Key",
    apiKeyPlaceholder: "sk-proj-...",
    apiKeyEnvVar: "OPENAI_API_KEY",
  },
  groq: {
    label: "Groq",
    color: "from-purple-500 to-violet-400",
    apiKeyLabel: "Groq API Key",
    apiKeyPlaceholder: "gsk_...",
    apiKeyEnvVar: "GROQ_API_KEY",
  },
};

type Status = "idle" | "loading" | "saving" | "success" | "error";

export default function AgentSettingsCard() {
  const [provider, setProvider] = useState<Provider>("google");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasRuntimeKey, setHasRuntimeKey] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [modelsList, setModelsList] = useState<{ value: string; label: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const modelsReqId = useRef(0);

  const loadModelsForProvider = useCallback(async (p: Provider): Promise<{ value: string; label: string }[]> => {
    const id = ++modelsReqId.current;
    setModelsLoading(true);
    setModelsNote(null);
    try {
      const mRes = await fetch(`/api/llm-models?provider=${encodeURIComponent(p)}`);
      const mData = (await mRes.json()) as {
        models?: { value: string; label: string }[];
        warning?: string;
        error?: string;
      };
      if (id !== modelsReqId.current) return mData.models ?? [];
      if (!mRes.ok) {
        setModelsList([]);
        setModelsNote(mData.error ?? "Could not load models");
        return [];
      }
      const list = mData.models ?? [];
      setModelsList(list);
      if (mData.warning) setModelsNote(mData.warning);
      return list;
    } catch {
      if (id === modelsReqId.current) {
        setModelsList([]);
        setModelsNote("Network error loading models");
      }
      return [];
    } finally {
      if (id === modelsReqId.current) setModelsLoading(false);
    }
  }, []);

  const fetchCurrent = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/agent-settings");
      if (res.ok) {
        const data = await res.json();
        const p = data.provider as Provider;
        setProvider(p);
        setHasRuntimeKey(!!data.hasRuntimeKey);
        const list = await loadModelsForProvider(p);
        const knownIds = list.map((m) => m.value);
        if (knownIds.includes(data.model)) {
          setModel(data.model);
          setUseCustom(false);
        } else {
          setCustomModel(data.model);
          setUseCustom(true);
        }
      }
    } catch {
      // silently ignore
    } finally {
      setStatus("idle");
    }
  }, [loadModelsForProvider]);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setModel("");
    setUseCustom(false);
    setCustomModel("");
    setApiKey("");
    setShowKey(false);
    setHasRuntimeKey(false);
    setStatus("idle");
    setMessage("");
    void loadModelsForProvider(p).then((list) => {
      if (list.length) {
        setModel(list[0].value);
        setUseCustom(false);
      }
    });
  };

  const handleSave = async () => {
    const selectedModel = useCustom ? customModel.trim() : model;
    if (!selectedModel) {
      setStatus("error");
      setMessage("Please select or enter a model name.");
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch("/api/agent-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: selectedModel,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setHasRuntimeKey(!!data.hasRuntimeKey);
        setApiKey(""); // clear field after save (key is stored server-side)
        if (apiKey.trim()) {
          void loadModelsForProvider(provider);
        }
        setStatus("success");
        setMessage(
          `Agent updated → ${PROVIDERS[provider].label} · ${selectedModel}${data.hasRuntimeKey ? " · Custom API key active" : " · Using .env key"}`
        );
        setTimeout(() => setStatus("idle"), 4000);
      } else {
        const err = await res.json();
        setStatus("error");
        setMessage(err.error ?? "Failed to update agent settings.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error — could not save settings.");
    }
  };

  const meta = PROVIDERS[provider];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={`h-10 w-10 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center shadow-md`}
        >
          <CpuChipIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Agent Configuration</h1>
          <p className="text-sm text-gray-500">
            Choose the LLM provider, model, and API key for your LangChain agent.
          </p>
        </div>
      </div>

      {/* Provider selector */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <label className="block text-sm font-medium text-gray-700">LLM Provider</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => {
            const isActive = provider === p;
            return (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? `border-transparent bg-gradient-to-br ${PROVIDERS[p].color} text-white shadow-md scale-[1.03]`
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-white"
                }`}
              >
                <span className="text-xs leading-tight text-center">{PROVIDERS[p].label}</span>
                {isActive && (
                  <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-white ring-2 ring-green-400">
                    <span className="absolute inset-0.5 rounded-full bg-green-400" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model selector */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="block text-sm font-medium text-gray-700">Model</label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={modelsLoading}
              onClick={() => void loadModelsForProvider(provider)}
              className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50"
              title="Reload models from provider"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${modelsLoading ? "animate-spin" : ""}`} />
              Refresh list
            </button>
            <button
              type="button"
              onClick={() => {
                setUseCustom((v) => !v);
                setMessage("");
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              {useCustom ? "← Back to list" : "Enter custom model name"}
            </button>
          </div>
        </div>

        {modelsNote && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {modelsNote}
          </p>
        )}

        {useCustom ? (
          <input
            type="text"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="e.g. gemini-2.5-pro-exp-03-25"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        ) : modelsLoading && modelsList.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading models from provider…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 max-h-[min(24rem,50vh)] overflow-y-auto pr-1">
            {modelsList.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-100 ${
                  model === m.value
                    ? `border-transparent bg-gradient-to-r ${meta.color} text-white shadow-sm`
                    : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  value={m.value}
                  checked={model === m.value}
                  onChange={() => setModel(m.value)}
                  className="sr-only"
                />
                <span className="flex-1 font-medium min-w-0 truncate">{m.label}</span>
                <span
                  className={`font-mono text-xs shrink-0 max-w-[45%] truncate ${model === m.value ? "text-white/80" : "text-gray-400"}`}
                  title={m.value}
                >
                  {m.value}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* API Key */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyIcon className="h-4 w-4 text-gray-500" />
            <label className="block text-sm font-medium text-gray-700">{meta.apiKeyLabel}</label>
          </div>
          {hasRuntimeKey ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
              <CheckCircleIcon className="h-3 w-3" />
              Custom key active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
              Using <code className="font-mono">{meta.apiKeyEnvVar}</code>
            </span>
          )}
        </div>

        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasRuntimeKey
                ? "Enter new key to replace current override…"
                : `Leave blank to use ${meta.apiKeyEnvVar} from .env`
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showKey ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Runtime keys override <code className="font-mono">.env</code> without a server restart
          and are stored in memory only — they reset when the server restarts.
        </p>
      </div>

      {/* Status feedback */}
      {(status === "success" || status === "error") && message && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
            status === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {status === "success" ? (
            <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
          ) : (
            <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0" />
          )}
          {message}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={status === "saving" || status === "loading"}
        className={`w-full rounded-xl bg-gradient-to-r ${meta.color} px-6 py-3 text-sm font-semibold text-white shadow-md transition-all duration-150 hover:opacity-90 hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {status === "saving" ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Saving…
          </span>
        ) : (
          "Save Agent Settings"
        )}
      </button>

      <p className="text-center text-xs text-gray-400">
        Changes take effect on the next chat message — no restart required.
      </p>
    </div>
  );
}
