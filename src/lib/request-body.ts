export class PayloadTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} byte limit.`);
    this.name = "PayloadTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export class MalformedJsonBodyError extends Error {
  constructor(message = "Malformed or non-object JSON request body.") {
    super(message);
    this.name = "MalformedJsonBodyError";
  }
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  if (chunks.length === 1) {
    const only = chunks[0];
    if (
      only.byteOffset === 0 &&
      only.byteLength === only.buffer.byteLength
    ) {
      return only;
    }
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Streams and bounds a request JSON body up to `maxBytes` before UTF-8 decoding
 * and `JSON.parse`, ensuring oversized payloads abort early without heap spikes.
 */
export async function readJsonBodyWithLimit<T extends Record<string, unknown>>(
  request: Request,
  maxBytes: number
): Promise<T> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      await request.body?.cancel().catch(() => {});
      throw new PayloadTooLargeError(maxBytes);
    }
  }

  let rawBytes: Uint8Array;
  if (!request.body) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new PayloadTooLargeError(maxBytes);
    }
    rawBytes = new Uint8Array(buffer);
  } else {
    const reader = request.body.getReader();
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
          throw new PayloadTooLargeError(maxBytes);
        }

        totalBytes += value.byteLength;
        chunks.push(value);
      }
    } catch (err) {
      chunks.length = 0;
      if (!(err instanceof PayloadTooLargeError)) {
        await reader.cancel().catch(() => {});
      }
      throw err;
    } finally {
      reader.releaseLock();
    }

    rawBytes = concatChunks(chunks, totalBytes);
  }

  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    parsed = JSON.parse(text);
  } catch {
    throw new MalformedJsonBodyError();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MalformedJsonBodyError("JSON body must be a plain object.");
  }

  return parsed as T;
}
