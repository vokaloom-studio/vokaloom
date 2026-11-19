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

interface SemaphoreWaiter {
  resolve: (release: () => void) => void;
  reject: (err: Error) => void;
  cleanup: () => void;
}

export class AsyncSemaphore {
  private active = 0;
  private readonly waiters: SemaphoreWaiter[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueueSize: number,
    private readonly queueTimeoutMs: number
  ) {}

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      while (this.waiters.length > 0) {
        const next = this.waiters.shift()!;
        next.cleanup();
        next.resolve(this.createRelease());
        return;
      }

      this.active = Math.max(0, this.active - 1);
    };
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      return Promise.reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Request aborted before acquiring upstream fetch slot.")
      );
    }

    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }

    if (this.waiters.length >= this.maxQueueSize) {
      return Promise.reject(new UpstreamConcurrencyLimitError());
    }

    return new Promise<() => void>((resolve, reject) => {
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

      const onAbort = () => {
        removeSelf();
        cleanup();
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new Error("Request aborted while queued for upstream fetch.")
        );
      };

      const onTimeout = () => {
        removeSelf();
        cleanup();
        reject(
          new UpstreamConcurrencyLimitError(
            "Timed out waiting for upstream image fetch capacity."
          )
        );
      };

      const waiter: SemaphoreWaiter = {
        resolve,
        reject,
        cleanup,
      };

      this.waiters.push(waiter);
      timer = setTimeout(onTimeout, this.queueTimeoutMs);
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
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

  const release = await semaphore.acquire(options.signal);
  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const fetchSignal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
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
  } finally {
    release();
  }
}
