import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import {
  DEFAULT_CHECKOUT_URL_COP,
  DEFAULT_CHECKOUT_URL_USD,
  DEFAULT_TRIAL_CREDITS,
  isAllowedCheckoutUrl,
  sanitizeCheckoutUrl,
} from "@/lib/quota";
import { resolveSharedRedisRestConfig } from "@/lib/rate-limit";
import {
  isDedicatedSigningSecretConfigured,
  resolveApiKey,
  type EntitlementRole,
} from "@/lib/server-secrets";
import type {
  AdminTelemetrySnapshot,
  CircuitBreakerRecord,
  GeminiResourceUsage,
  GradiumVoiceUsage,
  HardCapWindow,
  PaidResource,
  PublicAdvisoryCode,
  PublicQuotaAdvisory,
  PublicQuotaSnapshot,
  PublicResourceQuota,
  QuotaStatusLevel,
  ServerBusinessConfig,
  StockProvider,
  StockRateLimitSnapshot,
} from "@/lib/budget-types";

export type {
  AdminTelemetrySnapshot,
  CircuitBreakerRecord,
  GeminiResourceUsage,
  GradiumVoiceUsage,
  HardCapWindow,
  PaidResource,
  PublicAdvisoryCode,
  PublicQuotaAdvisory,
  PublicQuotaSnapshot,
  PublicResourceQuota,
  QuotaStatusLevel,
  ServerBusinessConfig,
  StockProvider,
  StockRateLimitSnapshot,
};

const DEFAULT_LEDGER_FILENAME = ".vokaloom-budget-ledger.json";
const REDIS_REST_TIMEOUT_MS = 3_000;
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const MAX_PRO_DAILY_ENTRIES = 5_000;

const DEFAULT_LOW_QUOTA_WARN_RATIO = 0.2;
const DEFAULT_PRO_DAILY_IMAGE_LIMIT = 25;
const DEFAULT_PRO_DAILY_AUDIO_LIMIT = 100;
const DEFAULT_PRO_DAILY_VISION_LIMIT = 50;

export const DEFAULT_GRADIUM_API_BASE_URL = "https://api.gradium.ai/api";

export function resolveGradiumApiBaseUrl(): string {
  const raw = process.env.GRADIUM_API_BASE_URL?.trim();
  const base = raw || DEFAULT_GRADIUM_API_BASE_URL;
  return base.replace(/\/+$/, "");
}

export const DEFAULT_GEMINI_VISION_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.8-flash-lite-tts";

export function resolveGeminiVisionModel(): string {
  return process.env.GEMINI_VISION_MODEL?.trim() || DEFAULT_GEMINI_VISION_MODEL;
}

export function resolveGeminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
}

export function resolveGeminiTtsModel(): string {
  return process.env.GEMINI_TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL;
}

const GEMINI_RATES_USD_PER_1M: Record<
  PaidResource,
  { inputPer1M: number; outputPer1M: number; minCallFloorUsd: number }
> = {
  vision: { inputPer1M: 0.3, outputPer1M: 2.5, minCallFloorUsd: 0 },
  image: { inputPer1M: 0.3, outputPer1M: 30.0, minCallFloorUsd: 0.039 },
  audio: { inputPer1M: 0.5, outputPer1M: 10.0, minCallFloorUsd: 0.002 },
};

interface ResourceCounterRecord {
  used: number;
  resetAt: number | null;
  window: HardCapWindow;
}

interface ProDailyBucket {
  used: number;
  resetAt: number;
}

interface BudgetLedgerData {
  version: 1;
  epoch: number;
  emergencyPause: boolean;
  counters: Record<PaidResource, ResourceCounterRecord>;
  proDailyUsage: Record<string, ProDailyBucket>;
  circuitBreakers: {
    gemini?: CircuitBreakerRecord;
    gradium?: CircuitBreakerRecord;
  };
  gradiumUsage: GradiumVoiceUsage;
  stockRateLimits: {
    pexels?: StockRateLimitSnapshot;
    unsplash?: StockRateLimitSnapshot;
  };
  geminiUsage: Record<PaidResource, GeminiResourceUsage>;
  businessConfig?: ServerBusinessConfig;
  revokedProSubjects?: Record<string, number>;
}

export interface GeminiUsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  responseTokenCount?: number;
  totalTokenCount?: number;
}

export type BlockReason =
  | "hard_cap"
  | "pro_daily_cap"
  | "emergency_pause"
  | "circuit_breaker"
  | "durable_store_unavailable";

export interface ReserveSlotOptions {
  role?: EntitlementRole | "guest";
  userKey?: string;
  providers?: Array<"gemini" | "gradium">;
  requireAllProviders?: boolean;
  skipProDailyCap?: boolean;
  providerUnavailableReason?: "circuit_breaker";
}

export interface ReserveSlotResult {
  allowed: boolean;
  resource: PaidResource;
  used: number;
  limit: number | null;
  remaining: number | null;
  status: QuotaStatusLevel;
  reason?: BlockReason;
  resetAt?: number | null;
  statusCode?: 429 | 503;
}

const globalForBudget = globalThis as typeof globalThis & {
  __vokaloomBudgetFileLock?: Promise<void>;
  __vokaloomBudgetMemLock?: Promise<void>;
  __vokaloomBudgetMemLedger?: BudgetLedgerData;
};

function isTruthyEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  const val = raw.trim().toLowerCase();
  return val === "1" || val === "true" || val === "yes";
}

function isFalsyEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  const val = raw.trim().toLowerCase();
  return val === "0" || val === "false" || val === "no";
}

function parseOptionalNonNegativeInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function parsePositiveInt(raw: string | undefined, defaultVal: number): number {
  if (raw === undefined) return defaultVal;
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return defaultVal;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : defaultVal;
}

function parseNumberInRange(
  raw: string | undefined,
  min: number,
  max: number,
  defaultVal: number
): number {
  if (raw === undefined) return defaultVal;
  const trimmed = raw.trim();
  if (!trimmed) return defaultVal;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return defaultVal;
  }
  return parsed;
}

export function resolveHardCapLimit(resource: PaidResource): number | null {
  switch (resource) {
    case "image":
      return parseOptionalNonNegativeInt(process.env.HARD_CAP_IMAGE_LIMIT);
    case "audio":
      return parseOptionalNonNegativeInt(process.env.HARD_CAP_AUDIO_LIMIT);
    case "vision":
      return parseOptionalNonNegativeInt(process.env.HARD_CAP_VISION_LIMIT);
  }
}

export function resolveHardCapWindow(): HardCapWindow {
  const raw = process.env.HARD_CAP_WINDOW?.trim().toLowerCase();
  if (raw === "lifetime" || raw === "24h" || raw === "30d") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "24h" : "lifetime";
}

function getWindowDurationMs(windowMode: HardCapWindow): number | null {
  if (windowMode === "24h") return DAY_MS;
  if (windowMode === "30d") return MONTH_MS;
  return null;
}

export function isPaidModelFallbackDisabled(): boolean {
  const raw = process.env.DISABLE_PAID_MODEL_FALLBACK;
  if (isTruthyEnv(raw)) return true;
  if (isFalsyEnv(raw)) return false;

  return (
    resolveHardCapLimit("image") !== null ||
    resolveHardCapLimit("audio") !== null ||
    resolveHardCapLimit("vision") !== null
  );
}

export function resolveLowQuotaWarnRatio(): number {
  return parseNumberInRange(
    process.env.LOW_QUOTA_WARN_RATIO,
    0,
    1,
    DEFAULT_LOW_QUOTA_WARN_RATIO
  );
}

export function resolveProClientDailyLimit(
  resource: PaidResource
): number | null {
  if (resource === "image") {
    return parsePositiveInt(
      process.env.PRO_CLIENT_DAILY_IMAGE_LIMIT,
      DEFAULT_PRO_DAILY_IMAGE_LIMIT
    );
  }
  if (resource === "audio") {
    return parsePositiveInt(
      process.env.PRO_CLIENT_DAILY_AUDIO_LIMIT,
      DEFAULT_PRO_DAILY_AUDIO_LIMIT
    );
  }
  if (resource === "vision") {
    return parsePositiveInt(
      process.env.PRO_CLIENT_DAILY_VISION_LIMIT,
      DEFAULT_PRO_DAILY_VISION_LIMIT
    );
  }
  return null;
}

export function isEnvEmergencyPaused(): boolean {
  return isTruthyEnv(process.env.PAID_AI_EMERGENCY_PAUSE);
}

export function isDurableStoreRequired(): boolean {
  return isTruthyEnv(process.env.BUDGET_REQUIRE_DURABLE_STORE);
}

function resolveLedgerFilePath(): string {
  const override = process.env.VOKALOOM_BUDGET_LEDGER_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(process.cwd(), DEFAULT_LEDGER_FILENAME);
}

function resolveStorageBackend(): "redis" | "file" | "memory" {
  if (resolveSharedRedisRestConfig()) {
    return "redis";
  }
  if (process.env.NODE_ENV !== "production") {
    return "file";
  }
  return "memory";
}

function createEmptyCounter(
  windowMode: HardCapWindow
): ResourceCounterRecord {
  return {
    used: 0,
    resetAt: null,
    window: windowMode,
  };
}

function createEmptyGeminiUsage(): GeminiResourceUsage {
  return {
    calls: 0,
    promptTokens: 0,
    candidatesTokens: 0,
    totalTokens: 0,
    estimatedUsd: 0,
    lastCallAt: null,
  };
}

function createEmptyGradiumUsage(): GradiumVoiceUsage {
  return {
    calls: 0,
    characters: 0,
    clonedVoicesCreated: 0,
    lastCallAt: null,
  };
}

function createDefaultLedgerData(
  windowMode = resolveHardCapWindow()
): BudgetLedgerData {
  return {
    version: 1,
    epoch: 1,
    emergencyPause: false,
    counters: {
      image: createEmptyCounter(windowMode),
      audio: createEmptyCounter(windowMode),
      vision: createEmptyCounter(windowMode),
    },
    proDailyUsage: {},
    circuitBreakers: {},
    gradiumUsage: createEmptyGradiumUsage(),
    stockRateLimits: {},
    geminiUsage: {
      image: createEmptyGeminiUsage(),
      audio: createEmptyGeminiUsage(),
      vision: createEmptyGeminiUsage(),
    },
    revokedProSubjects: {},
  };
}

function normalizeCounterRecord(
  raw: unknown,
  activeWindow: HardCapWindow,
  now: number
): ResourceCounterRecord {
  if (!raw || typeof raw !== "object") {
    return createEmptyCounter(activeWindow);
  }
  const obj = raw as Partial<ResourceCounterRecord>;
  const used =
    typeof obj.used === "number" && Number.isFinite(obj.used) && obj.used >= 0
      ? Math.floor(obj.used)
      : 0;
  let resetAt =
    typeof obj.resetAt === "number" && Number.isFinite(obj.resetAt)
      ? obj.resetAt
      : null;

  if (resetAt !== null && now >= resetAt) {
    return createEmptyCounter(activeWindow);
  }

  const durationMs = getWindowDurationMs(activeWindow);
  if (activeWindow === "lifetime") {
    resetAt = null;
  } else if (used > 0 && resetAt === null && durationMs !== null) {
    resetAt = now + durationMs;
  }

  return {
    used,
    resetAt,
    window: activeWindow,
  };
}

function normalizeGeminiUsageRecord(raw: unknown): GeminiResourceUsage {
  if (!raw || typeof raw !== "object") {
    return createEmptyGeminiUsage();
  }
  const obj = raw as Partial<GeminiResourceUsage>;
  return {
    calls:
      typeof obj.calls === "number" && Number.isFinite(obj.calls) && obj.calls >= 0
        ? Math.floor(obj.calls)
        : 0,
    promptTokens:
      typeof obj.promptTokens === "number" &&
      Number.isFinite(obj.promptTokens) &&
      obj.promptTokens >= 0
        ? Math.floor(obj.promptTokens)
        : 0,
    candidatesTokens:
      typeof obj.candidatesTokens === "number" &&
      Number.isFinite(obj.candidatesTokens) &&
      obj.candidatesTokens >= 0
        ? Math.floor(obj.candidatesTokens)
        : 0,
    totalTokens:
      typeof obj.totalTokens === "number" &&
      Number.isFinite(obj.totalTokens) &&
      obj.totalTokens >= 0
        ? Math.floor(obj.totalTokens)
        : 0,
    estimatedUsd:
      typeof obj.estimatedUsd === "number" &&
      Number.isFinite(obj.estimatedUsd) &&
      obj.estimatedUsd >= 0
        ? obj.estimatedUsd
        : 0,
    lastCallAt:
      typeof obj.lastCallAt === "number" && Number.isFinite(obj.lastCallAt)
        ? obj.lastCallAt
        : null,
  };
}

function normalizeGradiumUsageRecord(raw: unknown): GradiumVoiceUsage {
  if (!raw || typeof raw !== "object") {
    return createEmptyGradiumUsage();
  }
  const obj = raw as Partial<GradiumVoiceUsage>;
  return {
    calls:
      typeof obj.calls === "number" && Number.isFinite(obj.calls) && obj.calls >= 0
        ? Math.floor(obj.calls)
        : 0,
    characters:
      typeof obj.characters === "number" &&
      Number.isFinite(obj.characters) &&
      obj.characters >= 0
        ? Math.floor(obj.characters)
        : 0,
    clonedVoicesCreated:
      typeof obj.clonedVoicesCreated === "number" &&
      Number.isFinite(obj.clonedVoicesCreated) &&
      obj.clonedVoicesCreated >= 0
        ? Math.floor(obj.clonedVoicesCreated)
        : 0,
    lastCallAt:
      typeof obj.lastCallAt === "number" && Number.isFinite(obj.lastCallAt)
        ? obj.lastCallAt
        : null,
  };
}

export function resolveDefaultBusinessConfig(): ServerBusinessConfig {
  const rawTrials = process.env.VOKALOOM_FREE_TRIALS?.trim();
  const maxTrialCredits =
    rawTrials && /^\d+$/.test(rawTrials)
      ? Math.min(100, Math.max(0, Number.parseInt(rawTrials, 10)))
      : DEFAULT_TRIAL_CREDITS;
  return {
    priceCop: process.env.NEXT_PUBLIC_PRICE_COP?.trim() || "$60,000 COP",
    priceUsd: process.env.NEXT_PUBLIC_PRICE_USD?.trim() || "$15 USD",
    maxTrialCredits,
    checkoutUrlCop: sanitizeCheckoutUrl(
      process.env.NEXT_PUBLIC_CHECKOUT_URL_COP,
      DEFAULT_CHECKOUT_URL_COP
    ),
    checkoutUrlUsd: sanitizeCheckoutUrl(
      process.env.NEXT_PUBLIC_CHECKOUT_URL_USD,
      DEFAULT_CHECKOUT_URL_USD
    ),
  };
}

function sanitizeStoredBusinessConfig(raw: unknown): ServerBusinessConfig {
  const defaults = resolveDefaultBusinessConfig();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  const obj = raw as Partial<ServerBusinessConfig>;
  const priceCop =
    typeof obj.priceCop === "string" &&
    obj.priceCop.trim().length > 0 &&
    obj.priceCop.trim().length <= 48
      ? obj.priceCop.trim()
      : defaults.priceCop;
  const priceUsd =
    typeof obj.priceUsd === "string" &&
    obj.priceUsd.trim().length > 0 &&
    obj.priceUsd.trim().length <= 48
      ? obj.priceUsd.trim()
      : defaults.priceUsd;
  const maxTrialCredits =
    typeof obj.maxTrialCredits === "number" &&
    Number.isInteger(obj.maxTrialCredits) &&
    obj.maxTrialCredits >= 0 &&
    obj.maxTrialCredits <= 100
      ? obj.maxTrialCredits
      : defaults.maxTrialCredits;
  return {
    priceCop,
    priceUsd,
    maxTrialCredits,
    checkoutUrlCop: sanitizeCheckoutUrl(
      typeof obj.checkoutUrlCop === "string" ? obj.checkoutUrlCop : undefined,
      defaults.checkoutUrlCop
    ),
    checkoutUrlUsd: sanitizeCheckoutUrl(
      typeof obj.checkoutUrlUsd === "string" ? obj.checkoutUrlUsd : undefined,
      defaults.checkoutUrlUsd
    ),
  };
}

function normalizeLedgerData(
  raw: unknown,
  now = Date.now()
): BudgetLedgerData {
  const activeWindow = resolveHardCapWindow();
  const base = createDefaultLedgerData(activeWindow);
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const obj = raw as Partial<BudgetLedgerData>;

  base.epoch =
    typeof obj.epoch === "number" &&
    Number.isInteger(obj.epoch) &&
    obj.epoch >= 1
      ? obj.epoch
      : 1;
  base.emergencyPause = Boolean(obj.emergencyPause);

  const rawCounters = obj.counters as
    | Partial<Record<PaidResource, unknown>>
    | undefined;
  base.counters = {
    image: normalizeCounterRecord(rawCounters?.image, activeWindow, now),
    audio: normalizeCounterRecord(rawCounters?.audio, activeWindow, now),
    vision: normalizeCounterRecord(rawCounters?.vision, activeWindow, now),
  };

  if (obj.proDailyUsage && typeof obj.proDailyUsage === "object") {
    const entries = Object.entries(obj.proDailyUsage);
    for (const [k, bucket] of entries) {
      if (
        bucket &&
        typeof bucket === "object" &&
        typeof bucket.used === "number" &&
        Number.isFinite(bucket.used) &&
        bucket.used >= 0 &&
        typeof bucket.resetAt === "number" &&
        Number.isFinite(bucket.resetAt) &&
        now < bucket.resetAt
      ) {
        base.proDailyUsage[k] = {
          used: Math.floor(bucket.used),
          resetAt: bucket.resetAt,
        };
      }
      if (Object.keys(base.proDailyUsage).length >= MAX_PRO_DAILY_ENTRIES) {
        break;
      }
    }
  }

  if (obj.circuitBreakers && typeof obj.circuitBreakers === "object") {
    const geminiCb = obj.circuitBreakers.gemini;
    if (
      geminiCb &&
      typeof geminiCb.blockedUntil === "number" &&
      now < geminiCb.blockedUntil
    ) {
      base.circuitBreakers.gemini = geminiCb;
    }
    const gradiumCb = obj.circuitBreakers.gradium;
    if (
      gradiumCb &&
      typeof gradiumCb.blockedUntil === "number" &&
      now < gradiumCb.blockedUntil
    ) {
      base.circuitBreakers.gradium = gradiumCb;
    }
  }

  base.gradiumUsage = normalizeGradiumUsageRecord(obj.gradiumUsage);

  if (obj.stockRateLimits && typeof obj.stockRateLimits === "object") {
    for (const provider of ["pexels", "unsplash"] as const) {
      const snap = obj.stockRateLimits[provider];
      if (snap && typeof snap === "object") {
        const resetAt =
          typeof snap.resetAt === "number" && Number.isFinite(snap.resetAt)
            ? snap.resetAt
            : null;
        const rateLimited =
          Boolean(snap.rateLimited) && (resetAt === null || now < resetAt);
        base.stockRateLimits[provider] = {
          provider,
          limit:
            typeof snap.limit === "number" && Number.isFinite(snap.limit)
              ? snap.limit
              : null,
          remaining:
            typeof snap.remaining === "number" &&
            Number.isFinite(snap.remaining)
              ? snap.remaining
              : null,
          resetAt,
          rateLimited,
          updatedAt:
            typeof snap.updatedAt === "number" &&
            Number.isFinite(snap.updatedAt)
              ? snap.updatedAt
              : now,
        };
      }
    }
  }

  const rawGeminiUsage = obj.geminiUsage as
    | Partial<Record<PaidResource, unknown>>
    | undefined;
  base.geminiUsage = {
    image: normalizeGeminiUsageRecord(rawGeminiUsage?.image),
    audio: normalizeGeminiUsageRecord(rawGeminiUsage?.audio),
    vision: normalizeGeminiUsageRecord(rawGeminiUsage?.vision),
  };

  if (obj.businessConfig && typeof obj.businessConfig === "object") {
    base.businessConfig = sanitizeStoredBusinessConfig(obj.businessConfig);
  }

  if (obj.revokedProSubjects && typeof obj.revokedProSubjects === "object") {
    const cleanRevoked: Record<string, number> = {};
    for (const [subKey, ts] of Object.entries(obj.revokedProSubjects)) {
      const cleanSub = subKey.trim().toLowerCase();
      if (
        /^[a-z0-9_-]{4,64}$/.test(cleanSub) &&
        typeof ts === "number" &&
        Number.isFinite(ts) &&
        ts > 0
      ) {
        cleanRevoked[cleanSub] = ts;
      }
      if (Object.keys(cleanRevoked).length >= MAX_PRO_DAILY_ENTRIES) {
        break;
      }
    }
    base.revokedProSubjects = cleanRevoked;
  }

  return base;
}

async function withFileLedgerLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalForBudget.__vokaloomBudgetFileLock ?? Promise.resolve();
  const run = prev.then(fn, fn);
  globalForBudget.__vokaloomBudgetFileLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function withMemLedgerLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = globalForBudget.__vokaloomBudgetMemLock ?? Promise.resolve();
  const run = prev.then(fn, fn);
  globalForBudget.__vokaloomBudgetMemLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readLocalFileLedger(now = Date.now()): Promise<BudgetLedgerData> {
  const ledgerPath = resolveLedgerFilePath();
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ ledgerPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeLedgerData(parsed, now);
  } catch {
    return createDefaultLedgerData();
  }
}

async function writeLocalFileLedger(data: BudgetLedgerData): Promise<void> {
  const ledgerPath = resolveLedgerFilePath();
  const dir = path.dirname(ledgerPath);
  const tempPath = path.join(
    dir,
    `${path.basename(ledgerPath)}.tmp-${process.pid}-${Date.now()}-${crypto.randomUUID()}`
  );
  try {
    await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
    await fs.writeFile(
      /*turbopackIgnore: true*/ tempPath,
      `${JSON.stringify(data, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      }
    );
    await fs.rename(/*turbopackIgnore: true*/ tempPath, /*turbopackIgnore: true*/ ledgerPath);
  } catch (err) {
    await fs.unlink(/*turbopackIgnore: true*/ tempPath).catch(() => undefined);
    throw err;
  }
}

async function mutateLocalOrMemLedger<T>(
  backend: "file" | "memory",
  mutator: (ledger: BudgetLedgerData, now: number) => T | Promise<T>,
  persist = true
): Promise<T> {
  if (backend === "file") {
    return withFileLedgerLock(async () => {
      const now = Date.now();
      const ledger = await readLocalFileLedger(now);
      const result = await mutator(ledger, now);
      if (persist) {
        await writeLocalFileLedger(ledger);
      }
      return result;
    });
  }

  return withMemLedgerLock(async () => {
    const now = Date.now();
    const existing =
      globalForBudget.__vokaloomBudgetMemLedger ?? createDefaultLedgerData();
    const ledger = normalizeLedgerData(existing, now);
    const result = await mutator(ledger, now);
    globalForBudget.__vokaloomBudgetMemLedger = ledger;
    return result;
  });
}

async function readLocalOrMemLedger(
  backend: "file" | "memory"
): Promise<BudgetLedgerData> {
  if (backend === "file") {
    return withFileLedgerLock(async () => readLocalFileLedger(Date.now()));
  }
  return withMemLedgerLock(() => {
    const existing =
      globalForBudget.__vokaloomBudgetMemLedger ?? createDefaultLedgerData();
    const normalized = normalizeLedgerData(existing, Date.now());
    globalForBudget.__vokaloomBudgetMemLedger = normalized;
    return normalized;
  });
}

// ============================================================================
// Redis REST Backend (Upstash / Vercel KV Compatible)
// ============================================================================

const REDIS_PREFIX = "vokaloom:{budget}:";
const REDIS_EPOCH_KEY = `${REDIS_PREFIX}epoch`;
const REDIS_PAUSE_KEY = `${REDIS_PREFIX}pause`;
const REDIS_GRADIUM_USAGE_KEY = `${REDIS_PREFIX}gradium_usage`;
const REDIS_BUSINESS_CONFIG_KEY = `${REDIS_PREFIX}business_config`;
const REDIS_REVOKED_PRO_KEY = `${REDIS_PREFIX}revoked_pro`;

function redisCapKey(
  epoch: number,
  windowMode: HardCapWindow,
  resource: PaidResource
): string {
  return `${REDIS_PREFIX}cap:${epoch}:${windowMode}:${resource}`;
}

function redisProKey(
  epoch: number,
  resource: PaidResource,
  userKey: string
): string {
  const digest = crypto.createHash("sha256").update(userKey).digest("hex").slice(0, 24);
  return `${REDIS_PREFIX}pro:${epoch}:${resource}:${digest}`;
}

function redisCircuitBreakerKey(provider: "gemini" | "gradium"): string {
  return `${REDIS_PREFIX}cb:${provider}`;
}

function redisStockKey(provider: StockProvider): string {
  return `${REDIS_PREFIX}stock:${provider}`;
}

function redisGeminiUsageKey(resource: PaidResource): string {
  return `${REDIS_PREFIX}gemini:${resource}`;
}

interface UpstashPipelineEntry {
  result?: unknown;
  error?: string;
}

async function runRedisPipeline(
  commands: Array<Array<string | number>>
): Promise<UpstashPipelineEntry[]> {
  const cfg = resolveSharedRedisRestConfig();
  if (!cfg) {
    throw new Error("Redis REST config is not available.");
  }
  const baseUrl = cfg.url.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REDIS_REST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Budget Redis store returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Invalid pipeline response from budget Redis store.");
  }
  return data as UpstashPipelineEntry[];
}

async function getRedisEpoch(): Promise<number> {
  const res = await runRedisPipeline([["GET", REDIS_EPOCH_KEY]]);
  const raw = res[0]?.result;
  const parsed = raw === null || raw === undefined ? 1 : Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

const RESERVE_BUDGET_SLOT_LUA = `
local pauseKey = KEYS[1]
local globalCapKey = KEYS[2]
local proCapKey = KEYS[3]
local cbKey1 = KEYS[4]
local cbKey2 = KEYS[5]

local globalLimit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local proLimit = tonumber(ARGV[3])
local proWindowMs = tonumber(ARGV[4])
local candidateCount = tonumber(ARGV[5])
local requireAll = tonumber(ARGV[6])

local currentGlobal = tonumber(redis.call('GET', globalCapKey) or '0')
local pttlGlobal = redis.call('PTTL', globalCapKey)

if redis.call('GET', pauseKey) == '1' then
  return {0, 'emergency_pause', currentGlobal, pttlGlobal}
end

if candidateCount == 1 then
  if redis.call('EXISTS', cbKey1) == 1 then
    local cbTtl = redis.call('PTTL', cbKey1)
    return {0, 'circuit_breaker', currentGlobal, cbTtl}
  end
elseif candidateCount == 2 then
  local b1 = redis.call('EXISTS', cbKey1)
  local b2 = redis.call('EXISTS', cbKey2)
  if requireAll == 1 then
    if b1 == 1 or b2 == 1 then
      local cbTtl = math.max(redis.call('PTTL', cbKey1), redis.call('PTTL', cbKey2))
      return {0, 'circuit_breaker', currentGlobal, cbTtl}
    end
  else
    if b1 == 1 and b2 == 1 then
      local cbTtl = math.min(redis.call('PTTL', cbKey1), redis.call('PTTL', cbKey2))
      return {0, 'circuit_breaker', currentGlobal, cbTtl}
    end
  end
end

local proCount = 0
local proTtl = -1
if proLimit >= 0 then
  proCount = tonumber(redis.call('GET', proCapKey) or '0')
  proTtl = redis.call('PTTL', proCapKey)
  if proCount >= proLimit then
    return {0, 'pro_daily_cap', currentGlobal, pttlGlobal, proCount, proTtl}
  end
end

if globalLimit >= 0 and currentGlobal >= globalLimit then
  return {0, 'hard_cap', currentGlobal, pttlGlobal}
end

local nextGlobal = currentGlobal + 1
if windowMs > 0 then
  if pttlGlobal > 0 then
    redis.call('SET', globalCapKey, tostring(nextGlobal), 'PX', pttlGlobal)
  else
    redis.call('SET', globalCapKey, tostring(nextGlobal), 'PX', windowMs)
    pttlGlobal = windowMs
  end
else
  redis.call('SET', globalCapKey, tostring(nextGlobal))
  pttlGlobal = -1
end

local nextPro = proCount
if proLimit >= 0 then
  nextPro = proCount + 1
  if proTtl > 0 then
    redis.call('SET', proCapKey, tostring(nextPro), 'PX', proTtl)
  else
    redis.call('SET', proCapKey, tostring(nextPro), 'PX', proWindowMs)
    proTtl = proWindowMs
  end
end

return {1, 'ok', nextGlobal, pttlGlobal, nextPro, proTtl}
`.trim();

function parseJsonSafe<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseRedisHashToGeminiUsage(
  rawHash: unknown
): GeminiResourceUsage {
  const usage = createEmptyGeminiUsage();
  if (!Array.isArray(rawHash)) return usage;
  for (let i = 0; i + 1 < rawHash.length; i += 2) {
    const field = String(rawHash[i]);
    const val = Number(rawHash[i + 1]);
    if (!Number.isFinite(val)) continue;
    switch (field) {
      case "calls":
        usage.calls = Math.max(0, Math.floor(val));
        break;
      case "promptTokens":
        usage.promptTokens = Math.max(0, Math.floor(val));
        break;
      case "candidatesTokens":
        usage.candidatesTokens = Math.max(0, Math.floor(val));
        break;
      case "totalTokens":
        usage.totalTokens = Math.max(0, Math.floor(val));
        break;
      case "estimatedUsd":
        usage.estimatedUsd = Math.max(0, val);
        break;
      case "lastCallAt":
        usage.lastCallAt = val > 0 ? val : null;
        break;
    }
  }
  return usage;
}

function parseRedisHashToGradiumUsage(
  rawHash: unknown
): GradiumVoiceUsage {
  const usage = createEmptyGradiumUsage();
  if (!Array.isArray(rawHash)) return usage;
  for (let i = 0; i + 1 < rawHash.length; i += 2) {
    const field = String(rawHash[i]);
    const val = Number(rawHash[i + 1]);
    if (!Number.isFinite(val)) continue;
    switch (field) {
      case "calls":
        usage.calls = Math.max(0, Math.floor(val));
        break;
      case "characters":
        usage.characters = Math.max(0, Math.floor(val));
        break;
      case "clonedVoicesCreated":
        usage.clonedVoicesCreated = Math.max(0, Math.floor(val));
        break;
      case "lastCallAt":
        usage.lastCallAt = val > 0 ? val : null;
        break;
    }
  }
  return usage;
}

async function readRedisLedgerSnapshot(): Promise<BudgetLedgerData> {
  const now = Date.now();
  const activeWindow = resolveHardCapWindow();
  const epoch = await getRedisEpoch();
  const results = await runRedisPipeline([
    ["GET", REDIS_PAUSE_KEY],
    ["GET", redisCapKey(epoch, activeWindow, "image")],
    ["PTTL", redisCapKey(epoch, activeWindow, "image")],
    ["GET", redisCapKey(epoch, activeWindow, "audio")],
    ["PTTL", redisCapKey(epoch, activeWindow, "audio")],
    ["GET", redisCapKey(epoch, activeWindow, "vision")],
    ["PTTL", redisCapKey(epoch, activeWindow, "vision")],
    ["GET", redisCircuitBreakerKey("gemini")],
    ["GET", redisCircuitBreakerKey("gradium")],
    ["HGETALL", REDIS_GRADIUM_USAGE_KEY],
    ["GET", redisStockKey("pexels")],
    ["GET", redisStockKey("unsplash")],
    ["HGETALL", redisGeminiUsageKey("image")],
    ["HGETALL", redisGeminiUsageKey("audio")],
    ["HGETALL", redisGeminiUsageKey("vision")],
    ["GET", REDIS_BUSINESS_CONFIG_KEY],
  ]);

  const toCounter = (valIdx: number, ttlIdx: number): ResourceCounterRecord => {
    const usedRaw = results[valIdx]?.result;
    const ttlRaw = Number(results[ttlIdx]?.result ?? -1);
    const used =
      usedRaw !== null && usedRaw !== undefined && Number.isFinite(Number(usedRaw))
        ? Math.max(0, Math.floor(Number(usedRaw)))
        : 0;
    const resetAt =
      activeWindow !== "lifetime" && Number.isFinite(ttlRaw) && ttlRaw > 0
        ? now + ttlRaw
        : null;
    return { used, resetAt, window: activeWindow };
  };

  const ledger = createDefaultLedgerData(activeWindow);
  ledger.epoch = epoch;
  ledger.emergencyPause = results[0]?.result === "1";
  ledger.counters = {
    image: toCounter(1, 2),
    audio: toCounter(3, 4),
    vision: toCounter(5, 6),
  };

  const geminiCb = parseJsonSafe<CircuitBreakerRecord>(results[7]?.result);
  if (geminiCb && now < geminiCb.blockedUntil) {
    ledger.circuitBreakers.gemini = geminiCb;
  }
  const gradiumCb = parseJsonSafe<CircuitBreakerRecord>(results[8]?.result);
  if (gradiumCb && now < gradiumCb.blockedUntil) {
    ledger.circuitBreakers.gradium = gradiumCb;
  }

  ledger.gradiumUsage = parseRedisHashToGradiumUsage(results[9]?.result);

  const pexelsStock = parseJsonSafe<StockRateLimitSnapshot>(results[10]?.result);
  if (pexelsStock) {
    ledger.stockRateLimits.pexels = pexelsStock;
  }
  const unsplashStock = parseJsonSafe<StockRateLimitSnapshot>(results[11]?.result);
  if (unsplashStock) {
    ledger.stockRateLimits.unsplash = unsplashStock;
  }

  ledger.geminiUsage = {
    image: parseRedisHashToGeminiUsage(results[12]?.result),
    audio: parseRedisHashToGeminiUsage(results[13]?.result),
    vision: parseRedisHashToGeminiUsage(results[14]?.result),
  };

  const bizConfig = parseJsonSafe<ServerBusinessConfig>(results[15]?.result);
  if (bizConfig) {
    ledger.businessConfig = sanitizeStoredBusinessConfig(bizConfig);
  }

  return normalizeLedgerData(ledger, now);
}

// ============================================================================
// Core Budget Status & Pre-Commit Reservation
// ============================================================================

export function computeQuotaStatusLevel(
  used: number,
  limit: number | null,
  warnRatio = resolveLowQuotaWarnRatio()
): { remaining: number | null; status: QuotaStatusLevel } {
  if (limit === null) {
    return { remaining: null, status: "healthy" };
  }
  const remaining = Math.max(0, limit - used);
  if (remaining <= 0) {
    return { remaining: 0, status: "exhausted" };
  }
  if ((remaining === 1 && limit >= 1) || remaining / limit <= warnRatio) {
    return { remaining, status: "low" };
  }
  return { remaining, status: "healthy" };
}

function buildResourceQuota(
  resource: PaidResource,
  counter: ResourceCounterRecord,
  warnRatio: number
): PublicResourceQuota {
  const limit = resolveHardCapLimit(resource);
  const { remaining, status } = computeQuotaStatusLevel(
    counter.used,
    limit,
    warnRatio
  );
  return {
    used: counter.used,
    limit,
    remaining,
    status,
    resetAt: limit === null ? null : counter.resetAt,
  };
}

function isStockSnapshotLow(
  snap: StockRateLimitSnapshot | undefined,
  warnRatio: number,
  now: number
): { low: boolean; rateLimited: boolean; resetAt: number | null } {
  if (!snap) return { low: false, rateLimited: false, resetAt: null };
  const resetAt = snap.resetAt ?? null;
  const isRateLimited =
    snap.rateLimited && (resetAt === null || now < resetAt);
  if (isRateLimited) {
    return { low: true, rateLimited: true, resetAt };
  }
  if (
    snap.limit !== null &&
    snap.limit > 0 &&
    snap.remaining !== null &&
    (snap.remaining <= 1 || snap.remaining / snap.limit <= warnRatio)
  ) {
    return { low: true, rateLimited: false, resetAt };
  }
  return { low: false, rateLimited: false, resetAt };
}

function projectPublicSnapshot(ledger: BudgetLedgerData): PublicQuotaSnapshot {
  const now = Date.now();
  const warnRatio = resolveLowQuotaWarnRatio();
  const activeWindow = resolveHardCapWindow();
  const paidAiPaused = isEnvEmergencyPaused() || ledger.emergencyPause;

  const resources: Record<PaidResource, PublicResourceQuota> = {
    image: buildResourceQuota("image", ledger.counters.image, warnRatio),
    audio: buildResourceQuota("audio", ledger.counters.audio, warnRatio),
    vision: buildResourceQuota("vision", ledger.counters.vision, warnRatio),
  };

  const hasAnyHardCap =
    resources.image.limit !== null ||
    resources.audio.limit !== null ||
    resources.vision.limit !== null;

  const advisories: PublicQuotaAdvisory[] = [];

  if (paidAiPaused) {
    advisories.push({
      code: "paid_ai_paused",
      severity: "critical",
    });
  }

  for (const resource of ["image", "audio", "vision"] as const) {
    const r = resources[resource];
    if (r.limit === null) continue;
    if (r.status === "exhausted") {
      advisories.push({
        code: `${resource}_cap_exhausted` as PublicAdvisoryCode,
        severity: "critical",
        resource,
        remaining: 0,
        limit: r.limit,
        resetAt: r.resetAt,
      });
    } else if (r.status === "low") {
      advisories.push({
        code: `${resource}_cap_low` as PublicAdvisoryCode,
        severity: "warning",
        resource,
        remaining: r.remaining,
        limit: r.limit,
        resetAt: r.resetAt,
      });
    }
  }

  const pexelsCheck = isStockSnapshotLow(
    ledger.stockRateLimits.pexels,
    warnRatio,
    now
  );
  const unsplashCheck = isStockSnapshotLow(
    ledger.stockRateLimits.unsplash,
    warnRatio,
    now
  );
  const stockRateLimited =
    pexelsCheck.rateLimited || unsplashCheck.rateLimited;
  const stockLow = pexelsCheck.low || unsplashCheck.low;

  if (stockRateLimited) {
    advisories.push({
      code: "stock_rate_limited",
      severity: "warning",
      resource: "stock",
      resetAt: pexelsCheck.resetAt ?? unsplashCheck.resetAt,
    });
  } else if (stockLow) {
    advisories.push({
      code: "stock_quota_low",
      severity: "warning",
      resource: "stock",
      resetAt: pexelsCheck.resetAt ?? unsplashCheck.resetAt,
    });
  }

  const geminiBroken =
    ledger.circuitBreakers.gemini &&
    now < ledger.circuitBreakers.gemini.blockedUntil
      ? ledger.circuitBreakers.gemini
      : null;
  const gradiumBroken =
    ledger.circuitBreakers.gradium &&
    now < ledger.circuitBreakers.gradium.blockedUntil
      ? ledger.circuitBreakers.gradium
      : null;
  if (geminiBroken || gradiumBroken) {
    advisories.push({
      code: "provider_circuit_broken",
      severity: "critical",
      resetAt: Math.max(
        geminiBroken?.blockedUntil ?? 0,
        gradiumBroken?.blockedUntil ?? 0
      ),
    });
  }

  return {
    window: activeWindow,
    paidAiPaused,
    stockLow,
    hasAnyHardCap,
    resources,
    advisories,
    updatedAt: now,
  };
}

async function readCurrentLedgerWithFallback(): Promise<{
  ledger: BudgetLedgerData;
  backend: "redis" | "file" | "memory";
  durableStoreWarning: boolean;
}> {
  const configuredBackend = resolveStorageBackend();
  if (configuredBackend === "redis") {
    try {
      const ledger = await readRedisLedgerSnapshot();
      return { ledger, backend: "redis", durableStoreWarning: false };
    } catch (err) {
      console.warn(
        "Budget guard Redis read failed, falling back to local store:",
        err
      );
      const fallbackBackend =
        process.env.NODE_ENV !== "production" ? "file" : "memory";
      const ledger = await readLocalOrMemLedger(fallbackBackend);
      return {
        ledger,
        backend: fallbackBackend,
        durableStoreWarning: true,
      };
    }
  }

  const ledger = await readLocalOrMemLedger(configuredBackend);
  return {
    ledger,
    backend: configuredBackend,
    durableStoreWarning: configuredBackend === "memory",
  };
}

export async function getPublicQuotaSnapshot(): Promise<PublicQuotaSnapshot> {
  const { ledger } = await readCurrentLedgerWithFallback();
  return projectPublicSnapshot(ledger);
}

export async function getServerBusinessConfig(): Promise<ServerBusinessConfig> {
  const { ledger } = await readCurrentLedgerWithFallback();
  if (ledger.businessConfig) {
    return sanitizeStoredBusinessConfig(ledger.businessConfig);
  }
  return resolveDefaultBusinessConfig();
}

export async function saveServerBusinessConfig(
  input: Partial<ServerBusinessConfig>
): Promise<
  | { ok: true; config: ServerBusinessConfig }
  | {
      ok: false;
      errorKey:
        | "api.admin.invalidBusinessConfig"
        | "api.budget.durableStoreUnavailable";
      statusCode: 400 | 503;
    }
> {
  const current = await getServerBusinessConfig();

  let priceCop = current.priceCop;
  if (input.priceCop !== undefined) {
    if (typeof input.priceCop !== "string") {
      return {
        ok: false,
        errorKey: "api.admin.invalidBusinessConfig",
        statusCode: 400,
      };
    }
    const trimmed = input.priceCop.trim();
    if (!trimmed || trimmed.length > 48) {
      return {
        ok: false,
        errorKey: "api.admin.invalidBusinessConfig",
        statusCode: 400,
      };
    }
    priceCop = trimmed;
  }

  let priceUsd = current.priceUsd;
  if (input.priceUsd !== undefined) {
    if (typeof input.priceUsd !== "string") {
      return {
        ok: false,
        errorKey: "api.admin.invalidBusinessConfig",
        statusCode: 400,
      };
    }
    const trimmed = input.priceUsd.trim();
    if (!trimmed || trimmed.length > 48) {
      return {
        ok: false,
        errorKey: "api.admin.invalidBusinessConfig",
        statusCode: 400,
      };
    }
    priceUsd = trimmed;
  }

  let maxTrialCredits = current.maxTrialCredits;
  if (input.maxTrialCredits !== undefined) {
    if (
      typeof input.maxTrialCredits !== "number" ||
      !Number.isInteger(input.maxTrialCredits) ||
      input.maxTrialCredits < 0 ||
      input.maxTrialCredits > 100
    ) {
      return {
        ok: false,
        errorKey: "api.admin.invalidBusinessConfig",
        statusCode: 400,
      };
    }
    maxTrialCredits = input.maxTrialCredits;
  }

  let checkoutUrlCop = current.checkoutUrlCop;
  if (input.checkoutUrlCop !== undefined) {
    if (
      typeof input.checkoutUrlCop !== "string" ||
      !isAllowedCheckoutUrl(input.checkoutUrlCop)
    ) {
      return {
        ok: false,
        errorKey: "api.admin.invalidBusinessConfig",
        statusCode: 400,
      };
    }
    checkoutUrlCop = new URL(input.checkoutUrlCop.trim()).toString();
  }

  let checkoutUrlUsd = current.checkoutUrlUsd;
  if (input.checkoutUrlUsd !== undefined) {
    if (
      typeof input.checkoutUrlUsd !== "string" ||
      !isAllowedCheckoutUrl(input.checkoutUrlUsd)
    ) {
      return {
        ok: false,
        errorKey: "api.admin.invalidBusinessConfig",
        statusCode: 400,
      };
    }
    checkoutUrlUsd = new URL(input.checkoutUrlUsd.trim()).toString();
  }

  const nextConfig: ServerBusinessConfig = {
    priceCop,
    priceUsd,
    maxTrialCredits,
    checkoutUrlCop,
    checkoutUrlUsd,
  };

  const requireDurable = isDurableStoreRequired();
  const configuredBackend = resolveStorageBackend();

  if (configuredBackend === "memory" && requireDurable) {
    return {
      ok: false,
      errorKey: "api.budget.durableStoreUnavailable",
      statusCode: 503,
    };
  }

  if (configuredBackend === "redis") {
    try {
      await runRedisPipeline([
        ["SET", REDIS_BUSINESS_CONFIG_KEY, JSON.stringify(nextConfig)],
      ]);
      return { ok: true, config: nextConfig };
    } catch (err) {
      if (requireDurable) {
        console.error(
          "Redis saveServerBusinessConfig failed with strict durability:",
          err
        );
        return {
          ok: false,
          errorKey: "api.budget.durableStoreUnavailable",
          statusCode: 503,
        };
      }
      console.warn(
        "Redis saveServerBusinessConfig failed, falling back to local store:",
        err
      );
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  await mutateLocalOrMemLedger(localBackend, (ledger) => {
    ledger.businessConfig = nextConfig;
  });

  return { ok: true, config: nextConfig };
}

/**
 * Read-only eligibility check that inspects emergency pause, durable store
 * availability, circuit breakers, pro daily fair-use limits,
 * and global hard caps WITHOUT mutating or reserving any quota slot.
 */
export async function checkPaidGenerationEligibility(
  resource: PaidResource,
  options: ReserveSlotOptions = {}
): Promise<ReserveSlotResult> {
  const globalLimit = resolveHardCapLimit(resource);
  const warnRatio = resolveLowQuotaWarnRatio();
  const isProClient =
    options.role === "pro_client" && !options.skipProDailyCap;
  const proLimit = isProClient ? resolveProClientDailyLimit(resource) : null;
  const effectiveProLimit = proLimit !== null ? proLimit : -1;
  const userKey = options.userKey?.trim() || "pro:anonymous";
  const providers = options.providers ?? [];
  const requireAll = options.requireAllProviders ?? false;
  const requireDurable = isDurableStoreRequired();
  const configuredBackend = resolveStorageBackend();

  if (configuredBackend === "memory" && requireDurable) {
    return {
      allowed: false,
      resource,
      used: 0,
      limit: globalLimit,
      remaining: globalLimit,
      status: "exhausted",
      reason: "durable_store_unavailable",
      resetAt: null,
      statusCode: 503,
    };
  }

  const { ledger, backend, durableStoreWarning } =
    await readCurrentLedgerWithFallback();

  if (durableStoreWarning && requireDurable) {
    return {
      allowed: false,
      resource,
      used: 0,
      limit: globalLimit,
      remaining: globalLimit,
      status: "exhausted",
      reason: "durable_store_unavailable",
      resetAt: null,
      statusCode: 503,
    };
  }

  const counter = ledger.counters[resource];
  const currentStatus = computeQuotaStatusLevel(
    counter.used,
    globalLimit,
    warnRatio
  );
  const now = Date.now();

  if (isEnvEmergencyPaused() || ledger.emergencyPause) {
    return {
      allowed: false,
      resource,
      used: counter.used,
      limit: globalLimit,
      remaining: currentStatus.remaining,
      status: currentStatus.status,
      reason: "emergency_pause",
      resetAt: counter.resetAt,
      statusCode: 429,
    };
  }

  if (options.providerUnavailableReason) {
    return {
      allowed: false,
      resource,
      used: counter.used,
      limit: globalLimit,
      remaining: currentStatus.remaining,
      status: currentStatus.status,
      reason: options.providerUnavailableReason,
      resetAt: counter.resetAt,
      statusCode: 429,
    };
  }

  if (providers.length > 0) {
    const brokenRecords = providers.map((p) => {
      const rec = ledger.circuitBreakers[p];
      return rec && now < rec.blockedUntil ? rec : null;
    });
    const isBlocked = requireAll
      ? brokenRecords.some((r) => r !== null)
      : brokenRecords.every((r) => r !== null);

    if (isBlocked) {
      const firstBlocked = brokenRecords.find((r) => r !== null);
      return {
        allowed: false,
        resource,
        used: counter.used,
        limit: globalLimit,
        remaining: currentStatus.remaining,
        status: currentStatus.status,
        reason: "circuit_breaker",
        resetAt: firstBlocked?.blockedUntil ?? null,
        statusCode: 429,
      };
    }
  }

  if (effectiveProLimit >= 0) {
    let proUsed = 0;
    let proResetAt: number | null = now + DAY_MS;

    if (backend === "redis") {
      try {
        const proKey = redisProKey(ledger.epoch, resource, userKey);
        const proRes = await runRedisPipeline([
          ["GET", proKey],
          ["PTTL", proKey],
        ]);
        const rawUsed = proRes[0]?.result;
        const rawTtl = Number(proRes[1]?.result ?? -1);
        proUsed =
          rawUsed !== null &&
          rawUsed !== undefined &&
          Number.isFinite(Number(rawUsed))
            ? Math.max(0, Math.floor(Number(rawUsed)))
            : 0;
        proResetAt =
          Number.isFinite(rawTtl) && rawTtl > 0 ? now + rawTtl : now + DAY_MS;
      } catch (err) {
        if (requireDurable) {
          console.error(
            "Redis pro eligibility check failed with strict durability:",
            err
          );
          return {
            allowed: false,
            resource,
            used: counter.used,
            limit: globalLimit,
            remaining: currentStatus.remaining,
            status: currentStatus.status,
            reason: "durable_store_unavailable",
            resetAt: null,
            statusCode: 503,
          };
        }
      }
    } else {
      const proKey = `pro:${resource}:${userKey}`;
      const existingPro = ledger.proDailyUsage[proKey];
      if (existingPro && now < existingPro.resetAt) {
        proUsed = existingPro.used;
        proResetAt = existingPro.resetAt;
      }
    }

    if (proUsed >= effectiveProLimit) {
      return {
        allowed: false,
        resource,
        used: proUsed,
        limit: effectiveProLimit,
        remaining: 0,
        status: "exhausted",
        reason: "pro_daily_cap",
        resetAt: proResetAt,
        statusCode: 429,
      };
    }
  }

  if (globalLimit !== null && counter.used >= globalLimit) {
    return {
      allowed: false,
      resource,
      used: counter.used,
      limit: globalLimit,
      remaining: 0,
      status: "exhausted",
      reason: "hard_cap",
      resetAt: counter.resetAt,
      statusCode: 429,
    };
  }

  return {
    allowed: true,
    resource,
    used: counter.used,
    limit: globalLimit,
    remaining: currentStatus.remaining,
    status: currentStatus.status,
    resetAt: globalLimit === null ? null : counter.resetAt,
  };
}

/**
 * Atomically checks emergency pause, provider circuit breakers, optional
 * `pro_client` daily fair-use limits, and role-agnostic global hard caps,
 * pre-committing 1 slot before any upstream paid SDK invocation.
 */
export async function reservePaidGenerationSlot(
  resource: PaidResource,
  options: ReserveSlotOptions = {}
): Promise<ReserveSlotResult> {
  const globalLimit = resolveHardCapLimit(resource);
  const windowMode = resolveHardCapWindow();
  const windowMs = getWindowDurationMs(windowMode) ?? 0;
  const warnRatio = resolveLowQuotaWarnRatio();

  const isProClient =
    options.role === "pro_client" && !options.skipProDailyCap;
  const proLimit = isProClient ? resolveProClientDailyLimit(resource) : null;
  const effectiveProLimit = proLimit !== null ? proLimit : -1;
  const userKey = options.userKey?.trim() || "pro:anonymous";

  const providers = options.providers ?? [];
  const requireAll = options.requireAllProviders ?? false;
  const requireDurable = isDurableStoreRequired();
  const configuredBackend = resolveStorageBackend();

  if (configuredBackend === "memory" && requireDurable) {
    return {
      allowed: false,
      resource,
      used: 0,
      limit: globalLimit,
      remaining: globalLimit,
      status: "exhausted",
      reason: "durable_store_unavailable",
      resetAt: null,
      statusCode: 503,
    };
  }

  if (isEnvEmergencyPaused()) {
    const snap = await getPublicQuotaSnapshot();
    const cur = snap.resources[resource];
    return {
      allowed: false,
      resource,
      used: cur.used,
      limit: cur.limit,
      remaining: cur.remaining,
      status: cur.status,
      reason: "emergency_pause",
      resetAt: cur.resetAt,
      statusCode: 429,
    };
  }

  if (options.providerUnavailableReason) {
    const snap = await getPublicQuotaSnapshot();
    const cur = snap.resources[resource];
    if (snap.paidAiPaused) {
      return {
        allowed: false,
        resource,
        used: cur.used,
        limit: cur.limit,
        remaining: cur.remaining,
        status: cur.status,
        reason: "emergency_pause",
        resetAt: cur.resetAt,
        statusCode: 429,
      };
    }
    return {
      allowed: false,
      resource,
      used: cur.used,
      limit: cur.limit,
      remaining: cur.remaining,
      status: cur.status,
      reason: options.providerUnavailableReason,
      resetAt: cur.resetAt,
      statusCode: 429,
    };
  }

  if (configuredBackend === "redis") {
    try {
      const epoch = await getRedisEpoch();
      const capKey = redisCapKey(epoch, windowMode, resource);
      const proKey = redisProKey(epoch, resource, userKey);
      const cbKey1 =
        providers[0] !== undefined
          ? redisCircuitBreakerKey(providers[0])
          : `${REDIS_PREFIX}cb:none1`;
      const cbKey2 =
        providers[1] !== undefined
          ? redisCircuitBreakerKey(providers[1])
          : `${REDIS_PREFIX}cb:none2`;

      const evalResult = await runRedisPipeline([
        [
          "EVAL",
          RESERVE_BUDGET_SLOT_LUA,
          "5",
          REDIS_PAUSE_KEY,
          capKey,
          proKey,
          cbKey1,
          cbKey2,
          String(globalLimit === null ? -1 : globalLimit),
          String(windowMs),
          String(effectiveProLimit),
          String(DAY_MS),
          String(Math.min(2, providers.length)),
          requireAll ? "1" : "0",
        ],
      ]);

      const entry = evalResult[0];
      if (entry?.error || !Array.isArray(entry?.result)) {
        throw new Error(entry?.error || "Unexpected Redis Lua reserve response");
      }

      const [allowedRaw, reasonRaw, usedRaw, ttlRaw, proUsedRaw, proTtlRaw] =
        entry.result;
      const allowed = Number(allowedRaw) === 1;
      const reason = String(reasonRaw) as BlockReason;
      const used = Math.max(0, Number(usedRaw ?? 0));
      const proUsed = Math.max(0, Number(proUsedRaw ?? 0));
      const ttlMs = Number(ttlRaw ?? -1);
      const proTtlMs = Number(proTtlRaw ?? -1);
      const now = Date.now();
      const resetAt =
        reason === "pro_daily_cap"
          ? proTtlMs > 0
            ? now + proTtlMs
            : now + DAY_MS
          : ttlMs > 0
            ? now + ttlMs
            : null;
      const { remaining, status } = computeQuotaStatusLevel(
        used,
        globalLimit,
        warnRatio
      );

      if (!allowed) {
        if (reason === "pro_daily_cap") {
          return {
            allowed: false,
            resource,
            used: proUsed,
            limit: effectiveProLimit,
            remaining: 0,
            status: "exhausted",
            reason,
            resetAt,
            statusCode: 429,
          };
        }
        return {
          allowed: false,
          resource,
          used,
          limit: globalLimit,
          remaining,
          status,
          reason: reason || "hard_cap",
          resetAt,
          statusCode: 429,
        };
      }

      return {
        allowed: true,
        resource,
        used,
        limit: globalLimit,
        remaining,
        status,
        resetAt: globalLimit === null ? null : resetAt,
      };
    } catch (err) {
      if (requireDurable) {
        console.error("Redis budget reservation failed with strict durability:", err);
        return {
          allowed: false,
          resource,
          used: 0,
          limit: globalLimit,
          remaining: globalLimit,
          status: "exhausted",
          reason: "durable_store_unavailable",
          resetAt: null,
          statusCode: 503,
        };
      }
      console.warn(
        "Redis budget reservation failed, falling back to local store:",
        err
      );
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";

  return mutateLocalOrMemLedger(localBackend, (ledger, now) => {
    const counter = ledger.counters[resource];
    const currentStatus = computeQuotaStatusLevel(
      counter.used,
      globalLimit,
      warnRatio
    );

    if (isEnvEmergencyPaused() || ledger.emergencyPause) {
      return {
        allowed: false,
        resource,
        used: counter.used,
        limit: globalLimit,
        remaining: currentStatus.remaining,
        status: currentStatus.status,
        reason: "emergency_pause" as const,
        resetAt: counter.resetAt,
        statusCode: 429 as const,
      };
    }

    if (providers.length > 0) {
      const brokenRecords = providers.map((p) => {
        const rec = ledger.circuitBreakers[p];
        return rec && now < rec.blockedUntil ? rec : null;
      });
      const isBlocked = requireAll
        ? brokenRecords.some((r) => r !== null)
        : brokenRecords.every((r) => r !== null);

      if (isBlocked) {
        const firstBlocked = brokenRecords.find((r) => r !== null);
        return {
          allowed: false,
          resource,
          used: counter.used,
          limit: globalLimit,
          remaining: currentStatus.remaining,
          status: currentStatus.status,
          reason: "circuit_breaker" as const,
          resetAt: firstBlocked?.blockedUntil ?? null,
          statusCode: 429 as const,
        };
      }
    }

    let proBucket: ProDailyBucket | undefined;
    const proKey = `pro:${resource}:${userKey}`;
    if (effectiveProLimit >= 0) {
      const existingPro = ledger.proDailyUsage[proKey];
      if (existingPro && now < existingPro.resetAt) {
        proBucket = existingPro;
      } else {
        proBucket = { used: 0, resetAt: now + DAY_MS };
      }

      if (proBucket.used >= effectiveProLimit) {
        return {
          allowed: false,
          resource,
          used: proBucket.used,
          limit: effectiveProLimit,
          remaining: 0,
          status: "exhausted" as const,
          reason: "pro_daily_cap" as const,
          resetAt: proBucket.resetAt,
          statusCode: 429 as const,
        };
      }
    }

    if (globalLimit !== null && counter.used >= globalLimit) {
      return {
        allowed: false,
        resource,
        used: counter.used,
        limit: globalLimit,
        remaining: 0,
        status: "exhausted" as const,
        reason: "hard_cap" as const,
        resetAt: counter.resetAt,
        statusCode: 429 as const,
      };
    }

    // Commit slot atomically before returning
    counter.used += 1;
    counter.window = windowMode;
    if (windowMs > 0 && counter.resetAt === null) {
      counter.resetAt = now + windowMs;
    } else if (windowMs === 0) {
      counter.resetAt = null;
    }

    if (effectiveProLimit >= 0 && proBucket) {
      proBucket.used += 1;
      ledger.proDailyUsage[proKey] = proBucket;
    }

    const nextStatus = computeQuotaStatusLevel(
      counter.used,
      globalLimit,
      warnRatio
    );
    return {
      allowed: true,
      resource,
      used: counter.used,
      limit: globalLimit,
      remaining: nextStatus.remaining,
      status: nextStatus.status,
      resetAt: globalLimit === null ? null : counter.resetAt,
    };
  });
}

export function getBudgetCapErrorMessage(
  locale: Locale,
  result: ReserveSlotResult
): string {
  const resourceLabel = translate(locale, `api.budget.resource.${result.resource}`);
  switch (result.reason) {
    case "durable_store_unavailable":
      return translate(locale, "api.budget.durableStoreUnavailable");
    case "emergency_pause":
      return translate(locale, "api.budget.emergencyPaused");
    case "circuit_breaker":
      return translate(locale, "api.budget.circuitBroken");
    case "pro_daily_cap":
      return translate(locale, "api.budget.proDailyCapReached", {
        resource: resourceLabel,
        used: result.used,
        limit: result.limit ?? 0,
      });
    case "hard_cap":
    default:
      return translate(locale, "api.budget.hardCapReached", {
        resource: resourceLabel,
        used: result.used,
        limit: result.limit ?? 0,
      });
  }
}

// ============================================================================
// Circuit Breakers & Upstream Exhaustion Tracking
// ============================================================================

function extractErrorStatusAndMessage(
  err: unknown,
  depth = 0
): { statusCode?: number; message: string } | null {
  if (depth > 4) return null;
  if (typeof err === "string") {
    return { message: err };
  }
  if (!err || typeof err !== "object") {
    return null;
  }

  const obj = err as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const numericStatus =
    typeof obj.status === "number"
      ? obj.status
      : typeof obj.statusCode === "number"
        ? obj.statusCode
        : typeof obj.code === "number"
          ? obj.code
          : undefined;
  const message = typeof obj.message === "string" ? obj.message : "";

  if (numericStatus !== undefined || message.length > 0) {
    return { statusCode: numericStatus, message };
  }
  if (obj.cause && obj.cause !== err) {
    return extractErrorStatusAndMessage(obj.cause, depth + 1);
  }
  return null;
}

export function isUpstreamExhaustionError(err: unknown): {
  exhausted: boolean;
  statusCode?: number;
  reason?: string;
} {
  const info = extractErrorStatusAndMessage(err);
  if (!info) {
    return { exhausted: false };
  }

  if (info.statusCode === 429 || info.statusCode === 402) {
    return {
      exhausted: true,
      statusCode: info.statusCode,
      reason: info.statusCode === 402 ? "payment_required" : "rate_limited",
    };
  }

  if (
    /\b429\b|RESOURCE_EXHAUSTED|too many requests|quota.?exceeded/i.test(
      info.message
    )
  ) {
    return { exhausted: true, statusCode: 429, reason: "RESOURCE_EXHAUSTED" };
  }
  if (
    /\b402\b|payment.?required|insufficient.?(?:credits|balance|funds)|credit balance/i.test(
      info.message
    )
  ) {
    return { exhausted: true, statusCode: 402, reason: "payment_required" };
  }

  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && cause !== err) {
      return isUpstreamExhaustionError(cause);
    }
  }

  return { exhausted: false };
}

export function isUpstreamConfigError(err: unknown): {
  isConfigError: boolean;
  statusCode?: number;
  reason?: string;
} {
  const info = extractErrorStatusAndMessage(err);
  if (!info) {
    return { isConfigError: false };
  }

  if (
    info.statusCode === 400 ||
    info.statusCode === 401 ||
    info.statusCode === 403 ||
    info.statusCode === 404
  ) {
    return {
      isConfigError: true,
      statusCode: info.statusCode,
      reason: `http_${info.statusCode}`,
    };
  }

  const configRegex =
    /(?:HTTP\s+|^|[\s{"':])(400|401|403|404)(?:\b|$)|INVALID_ARGUMENT|API_KEY_INVALID|API key not valid|PERMISSION_DENIED|NOT_FOUND/i;
  const match = configRegex.exec(info.message);
  if (match) {
    const parsedCode = match[1] ? Number(match[1]) : undefined;
    return {
      isConfigError: true,
      ...(parsedCode ? { statusCode: parsedCode } : {}),
      reason: "provider_config_error",
    };
  }

  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && cause !== err) {
      return isUpstreamConfigError(cause);
    }
  }

  return { isConfigError: false };
}

export async function isProviderCircuitBroken(
  provider: "gemini" | "gradium"
): Promise<boolean> {
  const { ledger } = await readCurrentLedgerWithFallback();
  const rec = ledger.circuitBreakers[provider];
  return Boolean(rec && Date.now() < rec.blockedUntil);
}

export async function recordProviderExhaustion(
  provider: "gemini" | "gradium",
  statusCode?: number,
  reason?: string
): Promise<CircuitBreakerRecord> {
  const now = Date.now();
  const cooldownMs = parsePositiveInt(
    process.env.CIRCUIT_BREAKER_COOLDOWN_MS,
    DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS
  );
  const record: CircuitBreakerRecord = {
    trippedAt: now,
    blockedUntil: now + Math.max(1_000, cooldownMs),
    ...(statusCode ? { statusCode } : {}),
    ...(reason ? { reason } : {}),
  };

  if (resolveStorageBackend() === "redis") {
    try {
      await runRedisPipeline([
        [
          "SET",
          redisCircuitBreakerKey(provider),
          JSON.stringify(record),
          "PX",
          String(Math.max(1_000, cooldownMs)),
        ],
      ]);
      return record;
    } catch (err) {
      console.warn("Redis circuit-breaker write failed, using fallback:", err);
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  await mutateLocalOrMemLedger(localBackend, (ledger) => {
    ledger.circuitBreakers[provider] = record;
  });
  return record;
}

// ============================================================================
// Upstream Telemetry Collectors: Gemini Usage, Gradium Usage, Stock Headers
// ============================================================================

export function estimateGeminiCallUsd(
  resource: PaidResource,
  promptTokens: number,
  candidatesTokens: number
): number {
  const rates = GEMINI_RATES_USD_PER_1M[resource];
  const tokenCost =
    (promptTokens / 1_000_000) * rates.inputPer1M +
    (candidatesTokens / 1_000_000) * rates.outputPer1M;
  if (candidatesTokens === 0 && rates.minCallFloorUsd > 0) {
    return Math.max(tokenCost, rates.minCallFloorUsd);
  }
  return tokenCost;
}

export async function recordGeminiUsage(
  resource: PaidResource,
  usageMetadata?: GeminiUsageMetadataLike | null
): Promise<void> {
  const now = Date.now();
  const promptTokens =
    typeof usageMetadata?.promptTokenCount === "number" &&
    Number.isFinite(usageMetadata.promptTokenCount) &&
    usageMetadata.promptTokenCount >= 0
      ? Math.floor(usageMetadata.promptTokenCount)
      : 0;
  const rawCandidates =
    usageMetadata?.candidatesTokenCount ?? usageMetadata?.responseTokenCount;
  const candidatesTokens =
    typeof rawCandidates === "number" &&
    Number.isFinite(rawCandidates) &&
    rawCandidates >= 0
      ? Math.floor(rawCandidates)
      : 0;
  const totalTokens =
    typeof usageMetadata?.totalTokenCount === "number" &&
    Number.isFinite(usageMetadata.totalTokenCount) &&
    usageMetadata.totalTokenCount >= 0
      ? Math.floor(usageMetadata.totalTokenCount)
      : promptTokens + candidatesTokens;

  const estimatedUsd = estimateGeminiCallUsd(
    resource,
    promptTokens,
    candidatesTokens
  );

  if (resolveStorageBackend() === "redis") {
    try {
      const key = redisGeminiUsageKey(resource);
      await runRedisPipeline([
        ["HINCRBY", key, "calls", "1"],
        ["HINCRBY", key, "promptTokens", String(promptTokens)],
        ["HINCRBY", key, "candidatesTokens", String(candidatesTokens)],
        ["HINCRBY", key, "totalTokens", String(totalTokens)],
        ["HINCRBYFLOAT", key, "estimatedUsd", estimatedUsd.toFixed(6)],
        ["HSET", key, "lastCallAt", String(now)],
      ]);
      return;
    } catch (err) {
      console.warn("Redis Gemini usage write failed, using fallback:", err);
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  await mutateLocalOrMemLedger(localBackend, (ledger) => {
    const slot = ledger.geminiUsage[resource];
    slot.calls += 1;
    slot.promptTokens += promptTokens;
    slot.candidatesTokens += candidatesTokens;
    slot.totalTokens += totalTokens;
    slot.estimatedUsd = Number((slot.estimatedUsd + estimatedUsd).toFixed(6));
    slot.lastCallAt = now;
  });
}

function parseHeaderNumber(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseStockResetHeaderMs(
  rawReset: string | null,
  now = Date.now()
): number | null {
  const numeric = parseHeaderNumber(rawReset);
  if (numeric === null) return null;
  if (numeric >= 1e12) {
    return Math.floor(numeric);
  }
  if (numeric >= 1e9) {
    return Math.floor(numeric * 1000);
  }
  if (numeric > 0) {
    return now + Math.floor(numeric * 1000);
  }
  return null;
}

export async function recordStockRateLimit(
  provider: StockProvider,
  data: {
    headers?: Headers;
    status?: number;
    limit?: number | null;
    remaining?: number | null;
    resetAt?: number | null;
    rateLimited?: boolean;
  }
): Promise<void> {
  const now = Date.now();
  const limit =
    data.limit !== undefined
      ? data.limit
      : parseHeaderNumber(data.headers?.get("x-ratelimit-limit") ?? null);
  const rawRemaining =
    data.remaining !== undefined
      ? data.remaining
      : parseHeaderNumber(data.headers?.get("x-ratelimit-remaining") ?? null);
  const rateLimited =
    data.rateLimited !== undefined
      ? data.rateLimited
      : data.status === 429 || rawRemaining === 0;
  const remaining = rateLimited ? 0 : rawRemaining;

  let resetAt =
    data.resetAt !== undefined
      ? data.resetAt
      : parseStockResetHeaderMs(
          data.headers?.get("x-ratelimit-reset") ?? null,
          now
        );

  if (rateLimited && resetAt === null) {
    resetAt = now + DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS;
  }

  // Only persist if we captured at least one real header or hit 429
  if (
    limit === null &&
    remaining === null &&
    resetAt === null &&
    !rateLimited
  ) {
    return;
  }

  const snapshot: StockRateLimitSnapshot = {
    provider,
    limit,
    remaining,
    resetAt,
    rateLimited,
    updatedAt: now,
  };

  if (resolveStorageBackend() === "redis") {
    try {
      await runRedisPipeline([
        ["SET", redisStockKey(provider), JSON.stringify(snapshot)],
      ]);
      return;
    } catch (err) {
      console.warn("Redis stock rate-limit write failed, using fallback:", err);
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  await mutateLocalOrMemLedger(localBackend, (ledger) => {
    ledger.stockRateLimits[provider] = snapshot;
  });
}

export async function isStockProviderRateLimited(
  provider: StockProvider
): Promise<boolean> {
  const { ledger } = await readCurrentLedgerWithFallback();
  const snap = ledger.stockRateLimits[provider];
  if (!snap || !snap.rateLimited) return false;
  const now = Date.now();
  if (snap.resetAt !== null) {
    return now < snap.resetAt;
  }
  return now - snap.updatedAt < DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS;
}

export async function recordGradiumUsage(data: {
  characters: number;
  isClone?: boolean;
}): Promise<void> {
  const now = Date.now();
  const characters =
    Number.isFinite(data.characters) && data.characters > 0
      ? Math.floor(data.characters)
      : 0;
  const clonedDelta = data.isClone ? 1 : 0;

  if (resolveStorageBackend() === "redis") {
    try {
      await runRedisPipeline([
        ["HINCRBY", REDIS_GRADIUM_USAGE_KEY, "calls", "1"],
        ["HINCRBY", REDIS_GRADIUM_USAGE_KEY, "characters", String(characters)],
        [
          "HINCRBY",
          REDIS_GRADIUM_USAGE_KEY,
          "clonedVoicesCreated",
          String(clonedDelta),
        ],
        ["HSET", REDIS_GRADIUM_USAGE_KEY, "lastCallAt", String(now)],
      ]);
      return;
    } catch (err) {
      console.warn("Redis Gradium usage write failed, using fallback:", err);
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  await mutateLocalOrMemLedger(localBackend, (ledger) => {
    const slot = ledger.gradiumUsage ?? createEmptyGradiumUsage();
    slot.calls += 1;
    slot.characters += characters;
    slot.clonedVoicesCreated += clonedDelta;
    slot.lastCallAt = now;
    ledger.gradiumUsage = slot;
  });
}

// ============================================================================
// Admin Telemetry Projection & Runtime Controls
// ============================================================================

export async function getAdminTelemetrySnapshot(options: {
  gradiumKey?: string;
  geminiKey?: string;
} = {}): Promise<AdminTelemetrySnapshot> {
  const gradiumKey =
    options.gradiumKey !== undefined
      ? options.gradiumKey
      : await resolveApiKey("GRADIUM_API_KEY");
  const geminiKey =
    options.geminiKey !== undefined
      ? options.geminiKey
      : await resolveApiKey("GEMINI_API_KEY");

  const { ledger, backend, durableStoreWarning } =
    await readCurrentLedgerWithFallback();
  const now = Date.now();
  const publicSnapshot = projectPublicSnapshot(ledger);

  const geminiTotals = {
    calls:
      ledger.geminiUsage.image.calls +
      ledger.geminiUsage.audio.calls +
      ledger.geminiUsage.vision.calls,
    promptTokens:
      ledger.geminiUsage.image.promptTokens +
      ledger.geminiUsage.audio.promptTokens +
      ledger.geminiUsage.vision.promptTokens,
    candidatesTokens:
      ledger.geminiUsage.image.candidatesTokens +
      ledger.geminiUsage.audio.candidatesTokens +
      ledger.geminiUsage.vision.candidatesTokens,
    totalTokens:
      ledger.geminiUsage.image.totalTokens +
      ledger.geminiUsage.audio.totalTokens +
      ledger.geminiUsage.vision.totalTokens,
    estimatedUsd: Number(
      (
        ledger.geminiUsage.image.estimatedUsd +
        ledger.geminiUsage.audio.estimatedUsd +
        ledger.geminiUsage.vision.estimatedUsd
      ).toFixed(6)
    ),
  };

  return {
    storage: {
      backend,
      durable: backend !== "memory",
      durableStoreWarning,
      requireDurableStore: isDurableStoreRequired(),
    },
    config: {
      window: resolveHardCapWindow(),
      disablePaidModelFallback: isPaidModelFallbackDisabled(),
      lowQuotaWarnRatio: resolveLowQuotaWarnRatio(),
      proClientDailyImageLimit:
        resolveProClientDailyLimit("image") ?? DEFAULT_PRO_DAILY_IMAGE_LIMIT,
      proClientDailyAudioLimit:
        resolveProClientDailyLimit("audio") ?? DEFAULT_PRO_DAILY_AUDIO_LIMIT,
      proClientDailyVisionLimit:
        resolveProClientDailyLimit("vision") ?? DEFAULT_PRO_DAILY_VISION_LIMIT,
      usingDedicatedSigningSecret: isDedicatedSigningSecretConfigured(),
    },
    emergencyPause: {
      active: isEnvEmergencyPaused() || ledger.emergencyPause,
      envForced: isEnvEmergencyPaused(),
      runtimePaused: ledger.emergencyPause,
    },
    hardCaps: publicSnapshot.resources,
    gradium: {
      configured: Boolean(gradiumKey),
      circuitBreaker:
        ledger.circuitBreakers.gradium &&
        now < ledger.circuitBreakers.gradium.blockedUntil
          ? ledger.circuitBreakers.gradium
          : null,
      usage: ledger.gradiumUsage ?? createEmptyGradiumUsage(),
    },
    stock: {
      pexels: ledger.stockRateLimits.pexels ?? null,
      unsplash: ledger.stockRateLimits.unsplash ?? null,
    },
    gemini: {
      configured: Boolean(geminiKey),
      circuitBreaker:
        ledger.circuitBreakers.gemini &&
        now < ledger.circuitBreakers.gemini.blockedUntil
          ? ledger.circuitBreakers.gemini
          : null,
      usage: ledger.geminiUsage,
      totals: geminiTotals,
    },
    publicSnapshot,
    generatedAt: now,
  };
}

export async function resetBudgetCaps(): Promise<void> {
  const activeWindow = resolveHardCapWindow();
  if (resolveStorageBackend() === "redis") {
    try {
      const currentEpoch = await getRedisEpoch();
      const nextEpoch = currentEpoch + 1;
      await runRedisPipeline([
        ["SET", REDIS_EPOCH_KEY, String(nextEpoch)],
        ["DEL", redisCircuitBreakerKey("gemini")],
        ["DEL", redisCircuitBreakerKey("gradium")],
      ]);
      return;
    } catch (err) {
      console.warn("Redis resetBudgetCaps failed, falling back to local:", err);
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  await mutateLocalOrMemLedger(localBackend, (ledger) => {
    ledger.epoch += 1;
    ledger.counters = {
      image: createEmptyCounter(activeWindow),
      audio: createEmptyCounter(activeWindow),
      vision: createEmptyCounter(activeWindow),
    };
    ledger.proDailyUsage = {};
    ledger.circuitBreakers = {};
  });
}

export async function toggleEmergencyPause(
  explicitValue?: boolean
): Promise<boolean> {
  if (resolveStorageBackend() === "redis") {
    try {
      let nextVal: boolean;
      if (typeof explicitValue === "boolean") {
        nextVal = explicitValue;
      } else {
        const res = await runRedisPipeline([["GET", REDIS_PAUSE_KEY]]);
        nextVal = res[0]?.result !== "1";
      }
      await runRedisPipeline([["SET", REDIS_PAUSE_KEY, nextVal ? "1" : "0"]]);
      return nextVal || isEnvEmergencyPaused();
    } catch (err) {
      console.warn(
        "Redis toggleEmergencyPause failed, falling back to local:",
        err
      );
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  return mutateLocalOrMemLedger(localBackend, (ledger) => {
    const nextVal =
      typeof explicitValue === "boolean"
        ? explicitValue
        : !ledger.emergencyPause;
    ledger.emergencyPause = nextVal;
    return nextVal || isEnvEmergencyPaused();
  });
}

export function computeProSubjectId(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex")
    .slice(0, 16);
}

export async function revokeProSubject(rawSubjectId: string): Promise<boolean> {
  const subjectId = rawSubjectId.trim().toLowerCase();
  if (!/^[a-z0-9_-]{4,64}$/.test(subjectId)) {
    return false;
  }

  const configuredBackend = resolveStorageBackend();
  const requireDurable = isDurableStoreRequired();

  if (configuredBackend === "memory" && requireDurable) {
    return false;
  }

  if (configuredBackend === "redis") {
    try {
      await runRedisPipeline([["SADD", REDIS_REVOKED_PRO_KEY, subjectId]]);
      return true;
    } catch (err) {
      if (requireDurable) {
        console.error(
          "Redis revokeProSubject failed with strict durability:",
          err
        );
        return false;
      }
      console.warn(
        "Redis revokeProSubject failed, falling back to local store:",
        err
      );
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  await mutateLocalOrMemLedger(localBackend, (ledger, now) => {
    if (!ledger.revokedProSubjects) {
      ledger.revokedProSubjects = {};
    }
    ledger.revokedProSubjects[subjectId] = now;
  });
  return true;
}

export async function isProSubjectRevoked(
  rawSubjectId: string | undefined
): Promise<boolean> {
  if (!rawSubjectId) return false;
  const subjectId = rawSubjectId.trim().toLowerCase();
  if (!/^[a-z0-9_-]{4,64}$/.test(subjectId)) {
    return false;
  }

  const configuredBackend = resolveStorageBackend();
  const requireDurable = isDurableStoreRequired();

  if (configuredBackend === "redis") {
    try {
      const res = await runRedisPipeline([
        ["SISMEMBER", REDIS_REVOKED_PRO_KEY, subjectId],
      ]);
      return Number(res[0]?.result ?? 0) === 1;
    } catch (err) {
      if (requireDurable) {
        console.error(
          "Redis isProSubjectRevoked failed with strict durability:",
          err
        );
        return true;
      }
      console.warn(
        "Redis isProSubjectRevoked failed, checking local fallback:",
        err
      );
    }
  }

  const localBackend: "file" | "memory" =
    process.env.NODE_ENV !== "production" ? "file" : "memory";
  const ledger = await readLocalOrMemLedger(localBackend);
  return Boolean(ledger.revokedProSubjects?.[subjectId]);
}
