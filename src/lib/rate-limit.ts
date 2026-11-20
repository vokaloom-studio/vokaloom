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

export interface RateLimitConsumeOptions {
  floorCount?: number;
  maxAttempts?: number;
}

export interface RateLimitConsumeResult {
  allowed: boolean;
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  getCount(key: string): Promise<number>;
  isLimited(key: string): Promise<boolean>;
  recordFailure(key: string): Promise<number>;
  tryConsume(
    key: string,
    options?: RateLimitConsumeOptions
  ): Promise<RateLimitConsumeResult>;
  clear(key: string): Promise<void>;
}

interface AttemptRecord {
  count: number;
  resetAt: number;
}

/**
 * Bounded in-memory rate-limit store with per-key async serialization,
 * amortized head expiration pruning, and O(1) insertion-order eviction
 * to withstand high-cardinality IP churn without full-map scans.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  readonly maxAttempts: number;
  readonly windowMs: number;
  readonly maxEntries: number;
  private readonly records = new Map<string, AttemptRecord>();
  private readonly pendingLocks = new Map<string, Promise<void>>();

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

  private async withKeyLock<T>(
    key: string,
    fn: () => T | Promise<T>
  ): Promise<T> {
    const prev = this.pendingLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(
      () => gate,
      () => gate
    );
    this.pendingLocks.set(key, tail);

    try {
      await prev;
      return await fn();
    } finally {
      if (this.pendingLocks.get(key) === tail) {
        this.pendingLocks.delete(key);
      }
      release();
    }
  }

  /**
   * Prunes expired records from the head of insertion order. Because new
   * entries share a uniform windowMs and existing entries keep their original
   * resetAt, insertion order stays aligned with earliest expiration.
   */
  private pruneExpiredHead(now: number): void {
    for (const [key, record] of this.records) {
      if (now > record.resetAt) {
        this.records.delete(key);
      } else {
        break;
      }
    }
  }

  private evictOldestIfFull(now: number): void {
    if (this.records.size < this.maxEntries) {
      return;
    }
    this.pruneExpiredHead(now);
    while (this.records.size >= this.maxEntries) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.records.delete(oldestKey);
    }
  }

  async getCount(key: string): Promise<number> {
    const record = this.records.get(key);
    if (!record) {
      return 0;
    }
    if (Date.now() > record.resetAt) {
      this.records.delete(key);
      return 0;
    }
    return record.count;
  }

  async isLimited(key: string): Promise<boolean> {
    return (await this.getCount(key)) >= this.maxAttempts;
  }

  async recordFailure(key: string): Promise<number> {
    return this.withKeyLock(key, () => {
      const now = Date.now();
      this.pruneExpiredHead(now);

      const existing = this.records.get(key);
      if (existing) {
        if (now > existing.resetAt) {
          // Delete expired record before re-inserting so it moves to the tail.
          this.records.delete(key);
        } else {
          existing.count += 1;
          return existing.count;
        }
      }

      this.evictOldestIfFull(now);
      this.records.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return 1;
    });
  }

  async tryConsume(
    key: string,
    options: RateLimitConsumeOptions = {}
  ): Promise<RateLimitConsumeResult> {
    return this.withKeyLock(key, () => {
      const now = Date.now();
      this.pruneExpiredHead(now);

      let existing = this.records.get(key);
      if (existing && now > existing.resetAt) {
        this.records.delete(key);
        existing = undefined;
      }

      const effectiveMaxAttempts =
        options.maxAttempts !== undefined
          ? Math.max(1, Math.floor(options.maxAttempts))
          : this.maxAttempts;
      const floor = Math.max(0, Math.floor(options.floorCount ?? 0));
      const currentCount = Math.max(existing?.count ?? 0, floor);

      if (currentCount >= effectiveMaxAttempts) {
        return {
          allowed: false,
          count: currentCount,
          resetAt: existing?.resetAt ?? now + this.windowMs,
        };
      }

      const nextCount = currentCount + 1;
      if (existing) {
        existing.count = nextCount;
        return {
          allowed: true,
          count: nextCount,
          resetAt: existing.resetAt,
        };
      }

      this.evictOldestIfFull(now);
      const resetAt = now + this.windowMs;
      this.records.set(key, {
        count: nextCount,
        resetAt,
      });
      return {
        allowed: true,
        count: nextCount,
        resetAt,
      };
    });
  }

  async clear(key: string): Promise<void> {
    await this.withKeyLock(key, () => {
      this.records.delete(key);
    });
  }
}

interface UpstashPipelineEntry {
  result?: unknown;
  error?: string;
}

const TRY_CONSUME_LUA_SCRIPT = `
local key = KEYS[1]
local maxAttempts = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local floorCount = tonumber(ARGV[3]) or 0
local current = tonumber(redis.call('GET', key) or '0')
if floorCount > current then
  current = floorCount
end
local pttl = redis.call('PTTL', key)
if current >= maxAttempts then
  if pttl < 0 then
    pttl = windowMs
  end
  return {0, current, pttl}
end
local nextVal = current + 1
if pttl > 0 then
  redis.call('SET', key, tostring(nextVal), 'PX', pttl)
  return {1, nextVal, pttl}
else
  redis.call('SET', key, tostring(nextVal), 'PX', windowMs)
  return {1, nextVal, windowMs}
end
`.trim();

/**
 * Shared Redis/KV REST rate-limit store (Upstash / Vercel KV compatible) using
 * atomic Lua conditional increments (`EVAL`) or `SET ... NX PX` + `INCR` pipelines,
 * with bounded in-memory fallback on outage.
 */
export class UpstashRestRateLimitStore implements RateLimitStore {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly keyPrefix: string;
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly fallback: InMemoryRateLimitStore;
  private evalSupported = true;

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

  async tryConsume(
    key: string,
    options: RateLimitConsumeOptions = {}
  ): Promise<RateLimitConsumeResult> {
    const effectiveMaxAttempts =
      options.maxAttempts !== undefined
        ? Math.max(1, Math.floor(options.maxAttempts))
        : this.maxAttempts;
    const floor = Math.max(0, Math.floor(options.floorCount ?? 0));
    const now = Date.now();
    if (floor >= effectiveMaxAttempts) {
      return {
        allowed: false,
        count: floor,
        resetAt: now + this.windowMs,
      };
    }

    const redisKey = this.prefixedKey(key);

    if (this.evalSupported) {
      try {
        const evalResults = await this.runPipeline([
          [
            "EVAL",
            TRY_CONSUME_LUA_SCRIPT,
            "1",
            redisKey,
            String(effectiveMaxAttempts),
            String(this.windowMs),
            String(floor),
          ],
        ]);
        const entry = evalResults[0];
        if (entry?.error) {
          if (/unknown command|unsupported|eval|noscript/i.test(entry.error)) {
            this.evalSupported = false;
          } else {
            throw new Error(entry.error);
          }
        } else if (Array.isArray(entry?.result)) {
          const allowed = Number(entry.result[0]) === 1;
          const count = Math.max(0, Number(entry.result[1] ?? 0));
          const ttlMsRaw = Number(entry.result[2] ?? this.windowMs);
          const ttlMs =
            Number.isFinite(ttlMsRaw) && ttlMsRaw > 0
              ? ttlMsRaw
              : this.windowMs;
          return {
            allowed,
            count,
            resetAt: Date.now() + ttlMs,
          };
        } else {
          this.evalSupported = false;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (/HTTP 400/i.test(msg)) {
          this.evalSupported = false;
        } else {
          console.warn(
            "Shared rate-limit tryConsume failed, using fallback:",
            err
          );
          return this.fallback.tryConsume(key, options);
        }
      }
    }

    try {
      const results = await this.runPipeline([
        ["SET", redisKey, String(floor), "PX", String(this.windowMs), "NX"],
        ["INCR", redisKey],
        ["PTTL", redisKey],
      ]);
      const rawCount = Number(results[1]?.result ?? 1);
      const count = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 1;
      const rawTtl = Number(results[2]?.result ?? this.windowMs);
      const ttlMs =
        Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : this.windowMs;
      const resetAt = Date.now() + ttlMs;

      if (count > effectiveMaxAttempts) {
        return {
          allowed: false,
          count: effectiveMaxAttempts,
          resetAt,
        };
      }

      if (floor > 0 && count <= floor) {
        const syncedCount = Math.min(effectiveMaxAttempts, floor + 1);
        await this.runPipeline([
          ["SET", redisKey, String(syncedCount), "PX", String(ttlMs)],
        ]);
        return {
          allowed: true,
          count: syncedCount,
          resetAt,
        };
      }

      return {
        allowed: true,
        count,
        resetAt,
      };
    } catch (err) {
      console.warn(
        "Shared rate-limit tryConsume pipeline failed, using fallback:",
        err
      );
      return this.fallback.tryConsume(key, options);
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
