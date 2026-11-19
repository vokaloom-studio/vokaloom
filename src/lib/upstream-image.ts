export const ALLOWED_BACKGROUND_IMAGE_HOSTS = new Set<string>([
  "images.pexels.com",
  "images.unsplash.com",
]);

export const DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_CONCURRENT_IMAGE_FETCHES = 6;
export const MAX_QUEUED_IMAGE_FETCHES = 48;
export const UPSTREAM_QUEUE_TIMEOUT_MS = 10_000;

const MAX_REDIRECT_HOPS = 3;
const MAX_IMAGE_URL_LENGTH = 4096;

export class UpstreamImageTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Upstream image exceeds ${maxBytes} byte limit.`);
    this.name = "UpstreamImageTooLargeError";
  }
}

export class UpstreamStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Upstream image returned HTTP ${status}.`);
    this.name = "UpstreamStatusError";
    this.status = status;
  }
}

export class DisallowedRedirectError extends Error {
  constructor(message = "Upstream image redirect target is not allowed.") {
    super(message);
    this.name = "DisallowedRedirectError";
  }
}

export class UpstreamConcurrencyLimitError extends Error {
  constructor(message = "Too many concurrent upstream image requests.") {
    super(message);
    this.name = "UpstreamConcurrencyLimitError";
  }
}

/**
 * Strictly validates an external background image URL against HTTPS-only,
 * credential-free, default-port, exact-hostname Pexels/Unsplash allowlist rules.
 */
export function parseAllowedBackgroundUrl(
  rawUrl: string | null | undefined
): URL | null {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_IMAGE_URL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(trimmed) ||
    /^https:\/\/[^/?#]*@/i.test(trimmed)
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  if (parsed.port !== "") {
    return null;
  }
  if (!ALLOWED_BACKGROUND_IMAGE_HOSTS.has(parsed.hostname)) {
    return null;
  }

  return parsed;
}

function toAbortError(signal: AbortSignal | undefined, fallbackMessage: string): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  const err = new Error(
    typeof signal?.reason === "string" && signal.reason.trim()
      ? signal.reason
      : fallbackMessage
  );
  err.name = "AbortError";
  return err;
}

interface SemaphoreWaiter {
  readonly signal?: AbortSignal;
  readonly expiresAt: number;
  readonly settled: boolean;
  claim: () => boolean;
  grant: (release: () => void) => void;
  fail: (err: Error) => void;
}

/**
 * Bounded concurrency semaphore with FIFO queuing, per-waiter deadline/abort
 * settlement guards, and atomic slot accounting on release and cleanup.
 */
export class AsyncSemaphore {
  private active = 0;
  private draining = false;
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly queueTimeoutMs: number;
  private readonly waiters: SemaphoreWaiter[] = [];

  constructor(
    maxConcurrent: number,
    maxQueueSize: number,
    queueTimeoutMs: number
  ) {
    this.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
    this.maxQueueSize = Math.max(0, Math.floor(maxQueueSize));
    this.queueTimeoutMs = Math.max(0, queueTimeoutMs);
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  private isWaiterExpired(waiter: SemaphoreWaiter, now: number): boolean {
    return this.queueTimeoutMs > 0
      ? now >= waiter.expiresAt
      : now > waiter.expiresAt;
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      this.drain();
    };
  }

  private pruneStaleWaiters(now: number): void {
    let i = 0;
    while (i < this.waiters.length) {
      const waiter = this.waiters[i];
      if (waiter.settled) {
        this.waiters.splice(i, 1);
        continue;
      }
      if (waiter.signal?.aborted) {
        waiter.fail(
          toAbortError(
            waiter.signal,
            "Request aborted while queued for upstream fetch."
          )
        );
        continue;
      }
      if (this.isWaiterExpired(waiter, now)) {
        waiter.fail(
          new UpstreamConcurrencyLimitError(
            "Timed out waiting for upstream image fetch capacity."
          )
        );
        continue;
      }
      i += 1;
    }
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;

    try {
      const now = Date.now();
      this.pruneStaleWaiters(now);

      while (this.active < this.maxConcurrent && this.waiters.length > 0) {
        const next = this.waiters.shift()!;
        if (next.settled) {
          continue;
        }
        if (next.signal?.aborted) {
          next.fail(
            toAbortError(
              next.signal,
              "Request aborted while queued for upstream fetch."
            )
          );
          continue;
        }
        if (this.isWaiterExpired(next, now)) {
          next.fail(
            new UpstreamConcurrencyLimitError(
              "Timed out waiting for upstream image fetch capacity."
            )
          );
          continue;
        }

        if (!next.claim()) {
          continue;
        }

        this.active += 1;
        const release = this.createRelease();
        try {
          next.grant(release);
        } catch {
          release();
        }
      }
    } finally {
      this.draining = false;
    }
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      this.drain();
      return Promise.reject(
        toAbortError(
          signal,
          "Request aborted before acquiring upstream fetch slot."
        )
      );
    }

    this.drain();

    if (this.active < this.maxConcurrent && this.waiters.length === 0) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }

    if (this.waiters.length >= this.maxQueueSize) {
      return Promise.reject(new UpstreamConcurrencyLimitError());
    }

    return new Promise<() => void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const removeSelf = () => {
        const idx = this.waiters.indexOf(waiter);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
        }
      };

      const cleanup = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      };

      const settle = (): boolean => {
        if (settled) return false;
        settled = true;
        removeSelf();
        cleanup();
        return true;
      };

      const fail = (err: Error) => {
        if (!settle()) return;
        reject(err);
      };

      const claim = (): boolean => settle();

      const grant = (release: () => void) => {
        resolve(release);
      };

      const onAbort = () => {
        fail(
          toAbortError(
            signal,
            "Request aborted while queued for upstream fetch."
          )
        );
        this.drain();
      };

      const onTimeout = () => {
        fail(
          new UpstreamConcurrencyLimitError(
            "Timed out waiting for upstream image fetch capacity."
          )
        );
        this.drain();
      };

      const waiter: SemaphoreWaiter = {
        signal,
        expiresAt: Date.now() + this.queueTimeoutMs,
        get settled() {
          return settled;
        },
        claim,
        grant,
        fail,
      };

      this.waiters.push(waiter);
      timer = setTimeout(onTimeout, this.queueTimeoutMs);
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
        }
      }
    });
  }

  /**
   * Executes a task under an acquired semaphore permit and guarantees permit
   * release and immediate queue draining if the task throws, rejects, or aborts.
   */
  async run<T>(
    fn: (signal?: AbortSignal) => Promise<T> | T,
    signal?: AbortSignal
  ): Promise<T> {
    const release = await this.acquire(signal);
    try {
      if (signal?.aborted) {
        throw toAbortError(
          signal,
          "Request aborted before running upstream fetch."
        );
      }
      return await fn(signal);
    } finally {
      release();
    }
  }
}

const upstreamImageSemaphore = new AsyncSemaphore(
  MAX_CONCURRENT_IMAGE_FETCHES,
  MAX_QUEUED_IMAGE_FETCHES,
  UPSTREAM_QUEUE_TIMEOUT_MS
);

export async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw new UpstreamImageTooLargeError(maxBytes);
    }
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new UpstreamImageTooLargeError(maxBytes);
    }
    return new Uint8Array(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      if (totalBytes + value.byteLength > maxBytes) {
        chunks.length = 0;
        await reader.cancel().catch(() => {});
        throw new UpstreamImageTooLargeError(maxBytes);
      }

      totalBytes += value.byteLength;
      chunks.push(value);
    }
  } catch (err) {
    chunks.length = 0;
    if (!(err instanceof UpstreamImageTooLargeError)) {
      await reader.cancel().catch(() => {});
    }
    throw err;
  } finally {
    reader.releaseLock();
  }

  if (
    chunks.length === 1 &&
    chunks[0].byteOffset === 0 &&
    chunks[0].byteLength === chunks[0].buffer.byteLength
  ) {
    return chunks[0];
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export interface FetchAllowedBackgroundImageOptions {
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  semaphore?: AsyncSemaphore;
}

export interface FetchedBackgroundImage {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Fetches an allowlisted background image under concurrency bounding, timeout enforcement,
 * strict redirect target validation, and streaming byte-size capping.
 */
export async function fetchAllowedBackgroundImage(
  initialUrl: URL,
  options: FetchAllowedBackgroundImageOptions = {}
): Promise<FetchedBackgroundImage> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS;
  const semaphore = options.semaphore ?? upstreamImageSemaphore;

  return semaphore.run(async (signal) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const fetchSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    let currentUrl = initialUrl;
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
      const response = await fetch(currentUrl.toString(), {
        redirect: "manual",
        signal: fetchSignal,
      });

      if (isRedirectStatus(response.status)) {
        await response.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECT_HOPS) {
          throw new DisallowedRedirectError(
            "Exceeded maximum upstream image redirect hops."
          );
        }

        const location = response.headers.get("location");
        if (!location) {
          throw new DisallowedRedirectError(
            "Upstream image redirect missing Location header."
          );
        }

        let resolvedTarget: URL;
        try {
          resolvedTarget = new URL(location, currentUrl);
        } catch {
          throw new DisallowedRedirectError(
            "Upstream image redirect target is malformed."
          );
        }

        const validatedTarget = parseAllowedBackgroundUrl(
          resolvedTarget.toString()
        );
        if (!validatedTarget) {
          throw new DisallowedRedirectError(
            "Upstream image redirect target is outside allowlisted origins."
          );
        }

        currentUrl = validatedTarget;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new UpstreamStatusError(response.status);
      }

      const bytes = await readResponseBytesWithLimit(response, maxBytes);
      const contentType =
        response.headers.get("Content-Type") || "image/jpeg";
      return { bytes, contentType };
    }

    throw new DisallowedRedirectError();
  }, options.signal);
}
