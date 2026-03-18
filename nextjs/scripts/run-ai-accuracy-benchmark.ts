import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSqlText,
  detectResponseSuccess,
  extractMarkdownTableSignature,
  evaluateRun,
  evaluateToolSelection,
  computeCaseMetrics,
  buildSummary,
  renderReport,
} from "../lib/benchmarking/evaluator.ts";
import type { BenchmarkCase, BenchmarkConfig, BenchmarkRunArtifact } from "../lib/benchmarking/types.ts";

interface CliOptions {
  baseUrl?: string;
  casesPath?: string;
  configPath?: string;
  strict: boolean;
  cookie?: string;
  delayMs: number;
  concurrency: number;
  modelTemperature?: number;
  modelSeed?: number;
}

interface ChatApiResponse {
  response?: string;
  toolsUsed?: Array<{ tool?: string; observation?: string }>;
  error?: string;
}

interface ChatStreamDoneEvent {
  type: "done";
  response: string;
  toolsUsed?: Array<{ tool?: string; observation?: string }>;
}

interface ChatStreamErrorEvent {
  type: "error";
  message: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const BENCHMARK_PROMPT_SUFFIX = "\n\nDo not include suggested follow-up topics in your response.";

async function main(): Promise<void> {
  await loadDotEnvFromProjectRoot();
  const options = parseCli(process.argv.slice(2));
  const config = await loadConfig(options.configPath);
  const cases = await loadCases(options.casesPath);
  const { modelProvider, modelName, modelTemperature, modelSeed } = resolveModelMetadata(options);

  const baseUrl = options.baseUrl ?? process.env.BENCHMARK_BASE_URL ?? config.baseUrl;
  const cookie = options.cookie ?? process.env.BENCHMARK_AUTH_COOKIE;

  if (!cookie) {
    throw new Error(
      "Missing auth cookie. Set BENCHMARK_AUTH_COOKIE in nextjs/.env or shell env, or pass --cookie to call /api/chat as an authenticated user."
    );
  }

  await runPreflight({ baseUrl, endpointPath: config.endpointPath, cookie, timeoutMs: config.timeoutMs });

  const startedAt = new Date().toISOString();
  const caseRuns = await runWithConcurrency(cases, options.concurrency, async (benchmarkCase) =>
    executeBenchmarkCase({
      benchmarkCase,
      baseUrl,
      endpointPath: config.endpointPath,
      cookie,
      timeoutMs: config.timeoutMs,
      delayMs: options.delayMs,
    })
  );
  const runs = caseRuns.flat();

  const finishedAt = new Date().toISOString();
  const caseMetrics = computeCaseMetrics(cases, runs);
  const summary = buildSummary({
    startedAt,
    finishedAt,
    runs,
    caseMetrics,
    config,
    modelProvider,
    modelName,
    modelTemperature,
    modelSeed,
  });
  const report = renderReport(summary, caseMetrics);

  const outputDir = path.join(
    projectRoot,
    "benchmarks/ai-accuracy/results",
    new Date().toISOString().replace(/[:.]/g, "-")
  );
  await mkdir(outputDir, { recursive: true });

  await writeFile(path.join(outputDir, "raw-runs.json"), JSON.stringify(runs, null, 2), "utf8");
  await writeFile(path.join(outputDir, "case-metrics.json"), JSON.stringify(caseMetrics, null, 2), "utf8");
  await writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(path.join(outputDir, "report.md"), report, "utf8");

  process.stdout.write(`${report}\n\n`);
  process.stdout.write(`Artifacts written to: ${outputDir}\n`);

  if (options.strict && !summary.pass) {
    process.exitCode = 1;
  }
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = { strict: false, delayMs: 500, concurrency: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") options.strict = true;
    if (arg === "--base-url") options.baseUrl = argv[index + 1];
    if (arg === "--cases") options.casesPath = argv[index + 1];
    if (arg === "--config") options.configPath = argv[index + 1];
    if (arg === "--cookie") options.cookie = argv[index + 1];
    if (arg === "--delay-ms") options.delayMs = Number(argv[index + 1] ?? "0");
    if (arg === "--concurrency") options.concurrency = Number(argv[index + 1] ?? "1");
    if (arg === "--model-temperature") options.modelTemperature = normalizeOptionNumber(argv[index + 1]);
    if (arg === "--model-seed") options.modelSeed = normalizeOptionNumber(argv[index + 1]);
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
    options.concurrency = 1;
  }
  return options;
}

function resolveModelMetadata(options: CliOptions): {
  modelProvider?: string;
  modelName?: string;
  modelTemperature?: number;
  modelSeed?: number;
} {
  const provider = process.env.LLM_PROVIDER?.trim();
  if (!provider) {
    return {
      modelTemperature: resolveModelTemperature(options),
      modelSeed: resolveModelSeed(options),
    };
  }

  const providerLower = provider.toLowerCase();
  const modelNameByProvider: Record<string, string | undefined> = {
    google: process.env.GOOGLE_MODEL,
    anthropic: process.env.ANTHROPIC_MODEL,
    openai: process.env.OPENAI_MODEL,
  };

  return {
    modelProvider: providerLower,
    modelName: modelNameByProvider[providerLower]?.trim(),
    modelTemperature: resolveModelTemperature(options),
    modelSeed: resolveModelSeed(options),
  };
}

function resolveModelTemperature(options: CliOptions): number | undefined {
  if (options.modelTemperature !== undefined) return options.modelTemperature;
  const raw = process.env.BENCHMARK_MODEL_TEMPERATURE ?? process.env.LLM_TEMPERATURE;
  return normalizeOptionNumber(raw);
}

function resolveModelSeed(options: CliOptions): number | undefined {
  if (options.modelSeed !== undefined) return options.modelSeed;
  const raw = process.env.BENCHMARK_MODEL_SEED;
  return normalizeOptionNumber(raw);
}

async function loadDotEnvFromProjectRoot(): Promise<void> {
  const envPath = path.join(projectRoot, ".env");

  let envRaw = "";
  try {
    envRaw = await readFile(envPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw error;
  }

  const lines = envRaw.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = withoutExport.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = withoutExport.slice(separatorIndex + 1).trim();
    const hasDoubleQuotes = value.startsWith("\"") && value.endsWith("\"");
    const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
    if (hasDoubleQuotes || hasSingleQuotes) {
      value = value.slice(1, -1);
    }

    // Keep explicit shell environment values highest priority.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function loadConfig(configPathArg?: string): Promise<BenchmarkConfig> {
  const configPath =
    configPathArg ??
    path.join(projectRoot, "benchmarks/ai-accuracy/config.json");
  const configRaw = await readFile(configPath, "utf8");
  return JSON.parse(configRaw) as BenchmarkConfig;
}

async function loadCases(casesPathArg?: string): Promise<BenchmarkCase[]> {
  const casesPath =
    casesPathArg ??
    path.join(projectRoot, "benchmarks/ai-accuracy/dvd-rental-cases.json");
  const casesRaw = await readFile(casesPath, "utf8");
  return JSON.parse(casesRaw) as BenchmarkCase[];
}

async function runPreflight(params: {
  baseUrl: string;
  endpointPath: string;
  timeoutMs: number;
  cookie: string;
}): Promise<void> {
  const response = await postChat({
    baseUrl: params.baseUrl,
    endpointPath: params.endpointPath,
    cookie: params.cookie,
    timeoutMs: params.timeoutMs,
    payload: {
      message: "Preflight check for AI benchmark. Reply with a short confirmation.",
      history: [],
    },
  });

  if (response.statusCode === 401) {
    throw new Error("Preflight failed with 401 Unauthorized. BENCHMARK_AUTH_COOKIE is invalid.");
  }
  if (response.statusCode >= 500) {
    throw new Error(`Preflight failed with status ${response.statusCode}. Check local services before benchmarking.`);
  }
}

async function executeBenchmarkCase(params: {
  benchmarkCase: BenchmarkCase;
  baseUrl: string;
  endpointPath: string;
  cookie: string;
  timeoutMs: number;
  delayMs: number;
}): Promise<BenchmarkRunArtifact[]> {
  const runs: BenchmarkRunArtifact[] = [];
  const { benchmarkCase } = params;

  for (let iteration = 1; iteration <= benchmarkCase.repeat; iteration += 1) {
    const started = Date.now();
    let statusCode = 0;
    let responseText = "";
    let sqlText = "";
    let resultSignature: string | null = null;
    let responseSuccess = false;
    let accuracyPass = false;
    let toolSelectionPass: boolean | null = null;
    let toolCallCount = 0;
    let toolNames: string[] = [];
    let runError: string | undefined;
    let timeoutLike = false;

    try {
      const response = await postChat({
        baseUrl: params.baseUrl,
        endpointPath: params.endpointPath,
        cookie: params.cookie,
        timeoutMs: params.timeoutMs,
        payload: {
          message: benchmarkCase.prompt + BENCHMARK_PROMPT_SUFFIX,
          history: [],
        },
      });

      statusCode = response.statusCode;
      responseText = response.body.response ?? response.body.error ?? "";
      const toolEntries = response.body.toolsUsed ?? [];
      const toolObservations = toolEntries
        .map((toolEntry) => toolEntry.observation ?? "")
        .filter(Boolean);
      toolCallCount = toolEntries.length;
      toolNames = toolEntries.map((toolEntry) => toolEntry.tool ?? "").filter(Boolean);

      sqlText = extractSqlText(responseText, toolObservations);
      resultSignature = extractMarkdownTableSignature(responseText);
      responseSuccess = detectResponseSuccess(responseText, resultSignature, statusCode);
    } catch (error) {
      runError = error instanceof Error ? error.message : String(error);
      timeoutLike = /aborted|abort|timeout/i.test(runError);
    }

    accuracyPass = evaluateRun({
      benchmarkCase,
      responseText,
      sqlText,
      resultSignature,
      responseSuccess,
      toolCallCount,
      error: runError,
      timeoutLike,
    });
    toolSelectionPass = evaluateToolSelection(benchmarkCase.expectation.expectedTools, toolNames);

    runs.push({
      caseId: benchmarkCase.id,
      iteration,
      startedAt: new Date(started).toISOString(),
      latencyMs: Date.now() - started,
      statusCode,
      responseText,
      sqlText,
      resultSignature,
      responseSuccess,
      accuracyPass,
      toolCallCount,
      toolNames,
      toolSelectionPass,
      timeoutLike,
      error: runError,
    });

    if (params.delayMs > 0) {
      await sleep(params.delayMs);
    }
  }

  return runs;
}

async function postChat(params: {
  baseUrl: string;
  endpointPath: string;
  cookie: string;
  timeoutMs: number;
  payload: Record<string, unknown>;
}): Promise<{ statusCode: number; body: ChatApiResponse }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await fetch(`${params.baseUrl}${params.endpointPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: params.cookie,
      },
      body: JSON.stringify(params.payload),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const body = parseChatResponse(rawBody);
    return { statusCode: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function parseChatResponse(rawBody: string): ChatApiResponse {
  const trimmed = rawBody.trim();
  if (!trimmed) return {};

  // Try plain JSON first for backwards compatibility.
  try {
    return JSON.parse(trimmed) as ChatApiResponse;
  } catch {}

  // /api/chat currently streams NDJSON. Parse line-by-line and use final done/error event.
  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  let parsed: ChatApiResponse = {};

  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (isDoneEvent(event)) {
      parsed = {
        response: event.response,
        toolsUsed: event.toolsUsed ?? [],
      };
    } else if (isErrorEvent(event) && !parsed.response) {
      parsed = { error: event.message };
    }
  }

  return parsed;
}

function isDoneEvent(value: unknown): value is ChatStreamDoneEvent {
  if (!value || typeof value !== "object") return false;
  const maybeEvent = value as Partial<ChatStreamDoneEvent>;
  return maybeEvent.type === "done" && typeof maybeEvent.response === "string";
}

function isErrorEvent(value: unknown): value is ChatStreamErrorEvent {
  if (!value || typeof value !== "object") return false;
  const maybeEvent = value as Partial<ChatStreamErrorEvent>;
  return maybeEvent.type === "error" && typeof maybeEvent.message === "string";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptionNumber(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return undefined;
  return normalized;
}

async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) return [];
  const results = new Array<TResult>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex] as TItem);
    }
  });

  await Promise.all(workers);
  return results;
}

main().catch((error) => {
  process.stderr.write(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
