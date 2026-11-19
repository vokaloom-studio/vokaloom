export const DEFAULT_MAX_RATE_LIMIT_ATTEMPTS = 5;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_TRACKED_RATE_LIMIT_KEYS = 5_000;
const REDIS_FETCH_TIMEOUT_MS = 3_000;

export interface RateLimitStoreOptions {
  maxAttempts?: number;
  windowMs?: number;
  maxEntries?: number;
  keyPrefix?: string;
}

export interface RateLimitStore {
  getCount(key: string): Promise<number>;
  isLimited(key: string): Promise<boolean>;
  recordFailure(key: string): Promise<number>;
  clear(key: string): Promise<void>;
}

interface AttemptRecord {
  count: number;
  resetAt: number;
}

/**
 * Bounded in-memory rate-limit store with active expiration pruning and
 * earliest-expiring eviction to prevent unbounded memory growth.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  readonly maxAttempts: number;
  readonly windowMs: number;
  readonly maxEntries: number;
  private readonly records = new Map<string, AttemptRecord>();

  constructor(options: RateLimitStoreOptions = {}) {
    this.maxAttempts = Math.max(
      1,
      Math.floor(options.maxAttempts ?? DEFAULT_MAX_RATE_LIMIT_ATTEMPTS)
    );
    this.windowMs = Math.max(
      1,
      Math.floor(options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS)
    );
    this.maxEntries = Math.max(
      1,
      Math.floor(options.maxEntries ?? DEFAULT_MAX_TRACKED_RATE_LIMIT_KEYS)
    );
  }

  get size(): number {
    return this.records.size;
  }

  private pruneExpired(now: number): void {
    for (const [key, record] of this.records) {
      if (now > record.resetAt) {
        this.records.delete(key);
      }
    }
  }

  private evictEarliestExpiring(): boolean {
    let targetKey: string | undefined;
    let earliestResetAt = Infinity;

    for (const [key, record] of this.records) {
      if (record.resetAt < earliestResetAt) {
        earliestResetAt = record.resetAt;
        targetKey = key;
      }
    }

    if (targetKey === undefined) {
      targetKey = this.records.keys().next().value;
    }
    if (targetKey === undefined) {
      return false;
    }

    return this.records.delete(targetKey);
  }

  async getCount(key: string): Promise<number> {
    const now = Date.now();
    this.pruneExpired(now);
    return this.records.get(key)?.count ?? 0;
  }

  async isLimited(key: string): Promise<boolean> {
    return (await this.getCount(key)) >= this.maxAttempts;
  }

  async recordFailure(key: string): Promise<number> {
    const now = Date.now();
    this.pruneExpired(now);

    const existing = this.records.get(key);
    if (existing) {
      existing.count += 1;
      this.records.set(key, existing);
      return existing.count;
    }

    while (this.records.size >= this.maxEntries) {
      if (!this.evictEarliestExpiring()) break;
    }

    this.records.set(key, {
      count: 1,
      resetAt: now + this.windowMs,
    });
    return 1;
  }

  async clear(key: string): Promise<void> {
    this.records.delete(key);
  }
}

interface UpstashPipelineEntry {
  result?: unknown;
  error?: string;
}

/**
 * Shared Redis/KV REST rate-limit store (Upstash / Vercel KV compatible) using
 * atomic `SET ... NX PX` + `INCR` pipelines, with bounded in-memory fallback on outage.
 */
export class UpstashRestRateLimitStore implements RateLimitStore {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly keyPrefix: string;
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly fallback: InMemoryRateLimitStore;

  constructor(
    restUrl: string,
    restToken: string,
    options: RateLimitStoreOptions = {}
  ) {
    this.baseUrl = restUrl.replace(/\/+$/, "");
    this.token = restToken;
    this.keyPrefix = options.keyPrefix ?? "vokaloom:ratelimit:";
    this.maxAttempts = Math.max(
      1,
      Math.floor(options.maxAttempts ?? DEFAULT_MAX_RATE_LIMIT_ATTEMPTS)
    );
    this.windowMs = Math.max(
      1,
      Math.floor(options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS)
    );
    this.fallback = new InMemoryRateLimitStore(options);
  }

  private prefixedKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async runPipeline(
    commands: Array<Array<string | number>>
  ): Promise<UpstashPipelineEntry[]> {
    const response = await fetch(`${this.baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(REDIS_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Rate-limit store returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error("Invalid pipeline response from rate-limit store.");
    }

    return data as UpstashPipelineEntry[];
  }

  async getCount(key: string): Promise<number> {
    try {
      const results = await this.runPipeline([["GET", this.prefixedKey(key)]]);
      const raw = results[0]?.result;
      const parsed = raw === null || raw === undefined ? 0 : Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch (err) {
      console.warn("Shared rate-limit getCount failed, using fallback:", err);
      return this.fallback.getCount(key);
    }
  }

  async isLimited(key: string): Promise<boolean> {
    return (await this.getCount(key)) >= this.maxAttempts;
  }

  async recordFailure(key: string): Promise<number> {
    const redisKey = this.prefixedKey(key);
    try {
      const results = await this.runPipeline([
        ["SET", redisKey, "0", "PX", String(this.windowMs), "NX"],
        ["INCR", redisKey],
      ]);
      const count = Number(results[1]?.result ?? 1);
      return Number.isFinite(count) && count > 0 ? count : 1;
    } catch (err) {
      console.warn(
        "Shared rate-limit recordFailure failed, using fallback:",
        err
      );
      return this.fallback.recordFailure(key);
    }
  }

  async clear(key: string): Promise<void> {
    try {
      await this.runPipeline([["DEL", this.prefixedKey(key)]]);
    } catch (err) {
      console.warn("Shared rate-limit clear failed, using fallback:", err);
    }
    await this.fallback.clear(key);
  }
}

function isValidRestStoreUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export function resolveSharedRedisRestConfig(): {
  url: string;
  token: string;
} | null {
  const candidates: Array<[string | undefined, string | undefined]> = [
    [
      process.env.RATE_LIMIT_REDIS_REST_URL,
      process.env.RATE_LIMIT_REDIS_REST_TOKEN,
    ],
    [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN],
    [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN],
  ];

  for (const [rawUrl, rawToken] of candidates) {
    const url = rawUrl?.trim();
    const token = rawToken?.trim();
    if (url && token && isValidRestStoreUrl(url)) {
      return { url, token };
    }
  }

  return null;
}

export function createRateLimitStore(
  options: RateLimitStoreOptions = {}
): RateLimitStore {
  const shared = resolveSharedRedisRestConfig();
  if (shared) {
    return new UpstashRestRateLimitStore(shared.url, shared.token, options);
  }
  return new InMemoryRateLimitStore(options);
}
