import { after, NextResponse } from "next/server";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  checkPaidGenerationEligibility,
  getBudgetCapErrorMessage,
  getPublicQuotaSnapshot,
  isPaidModelFallbackDisabled,
  isProviderCircuitBroken,
  isUpstreamConfigError,
  isUpstreamExhaustionError,
  recordGeminiUsage,
  recordGradiumUsage,
  recordProviderExhaustion,
  reservePaidGenerationSlot,
  resolveGeminiTtsModel,
  resolveGradiumApiBaseUrl,
} from "@/lib/budget-guard";
import { getRateLimitClientKey } from "@/lib/client-ip";
import { resolveRequestLocale, translate } from "@/lib/i18n";
import {
  MalformedJsonBodyError,
  PayloadTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import {
  attachServerTrialCookie,
  enforceServerGenerationQuota,
} from "@/lib/server-quota";
import {
  resolveApiKey,
  resolveServerEntitlement,
} from "@/lib/server-secrets";

export const maxDuration = 60;

const GRADIUM_REQUEST_TIMEOUT_MS = 35_000;
const GRADIUM_CLEANUP_TIMEOUT_MS = 5_000;
const GEMINI_TTS_TIMEOUT_MS = 25_000;

const GRADIUM_PRESET_VOICES: Record<string, string> = {
  "mateo-es": "sVLgzKMqaptUdaY8",
  "sofia-es": "3p0eIGbkmny71GlA",
  "lucas-es": "n7vovxcDTVG4gClo",
  "abella-en": "YTpq7expH9539ERJ",
  "adam-en": "3jUdJyOi9pgbxBTK",
};

function resolveGradiumPresetVoiceId(
  voiceId: string,
  language: "es" | "en"
): string {
  return (
    GRADIUM_PRESET_VOICES[voiceId] ??
    (language === "en"
      ? GRADIUM_PRESET_VOICES["abella-en"]
      : GRADIUM_PRESET_VOICES["mateo-es"])
  );
}
const MAX_VOICE_REQUEST_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REFERENCE_AUDIO_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_REFERENCE_AUDIO_BASE64_CHARS =
  Math.ceil(MAX_REFERENCE_AUDIO_BYTES / 3) * 4;
const MAX_REFERENCE_AUDIO_HEADER_CHARS = 256;
const MAX_REFERENCE_AUDIO_DATA_URI_LENGTH =
  MAX_REFERENCE_AUDIO_BASE64_CHARS + MAX_REFERENCE_AUDIO_HEADER_CHARS;
const REFERENCE_AUDIO_DATA_URI_REGEX =
  /^data:(?:audio\/(?:ogg|opus|mpeg|mp3|wav|x-wav|mp4|m4a|aac|webm)|application\/ogg)(?:;[^,;]+)*;base64,([A-Za-z0-9+/=]+)$/i;

interface VoiceRequestBody {
  text?: string;
  voiceId?: string;
  language?: "es" | "en";
  referenceAudioBase64?: unknown;
  locale?: unknown;
}

type ReferenceAudioValidationResult =
  | { provided: false }
  | { provided: true; valid: true; dataUri: string }
  | { provided: true; valid: false; reason: "invalid" | "tooLarge" };

/**
 * Validates optional zero-shot clone reference audio as a strict base64 audio data URI
 * within the 3 MB decoded size cap so raw URLs or oversized blobs never reach Gradium AI.
 */
function validateReferenceAudioDataUri(
  rawValue: unknown
): ReferenceAudioValidationResult {
  if (rawValue === undefined || rawValue === null) {
    return { provided: false };
  }
  if (typeof rawValue !== "string") {
    return { provided: true, valid: false, reason: "invalid" };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { provided: false };
  }

  if (trimmed.length > MAX_REFERENCE_AUDIO_DATA_URI_LENGTH) {
    return { provided: true, valid: false, reason: "tooLarge" };
  }

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex === -1 || commaIndex > MAX_REFERENCE_AUDIO_HEADER_CHARS) {
    return { provided: true, valid: false, reason: "invalid" };
  }

  const match = REFERENCE_AUDIO_DATA_URI_REGEX.exec(trimmed);
  if (!match) {
    return { provided: true, valid: false, reason: "invalid" };
  }

  const base64Payload = match[1];
  if (base64Payload.length > MAX_REFERENCE_AUDIO_BASE64_CHARS) {
    return { provided: true, valid: false, reason: "tooLarge" };
  }
  if (base64Payload.length % 4 === 1) {
    return { provided: true, valid: false, reason: "invalid" };
  }

  const firstPaddingIndex = base64Payload.indexOf("=");
  if (firstPaddingIndex !== -1) {
    const trailing = base64Payload.slice(firstPaddingIndex);
    if (
      (trailing !== "=" && trailing !== "==") ||
      base64Payload.length % 4 !== 0
    ) {
      return { provided: true, valid: false, reason: "invalid" };
    }
  }

  const paddingBytes = base64Payload.endsWith("==")
    ? 2
    : base64Payload.endsWith("=")
      ? 1
      : 0;
  const decodedBytes =
    Math.floor((base64Payload.length * 3) / 4) - paddingBytes;
  if (decodedBytes <= 0) {
    return { provided: true, valid: false, reason: "invalid" };
  }
  if (decodedBytes > MAX_REFERENCE_AUDIO_BYTES) {
    return { provided: true, valid: false, reason: "tooLarge" };
  }

  return { provided: true, valid: true, dataUri: trimmed };
}

function createTimeoutAbortControl(
  requestSignal: AbortSignal | undefined,
  timeoutMs: number,
  timeoutLabel: string
): { signal: AbortSignal; cleanup: () => void } {
  if (requestSignal?.aborted) {
    throw requestSignal.reason instanceof Error
      ? requestSignal.reason
      : new DOMException("Voice synthesis request aborted", "AbortError");
  }

  const controller = new AbortController();
  const onAbort = () => {
    const reason =
      requestSignal?.reason instanceof Error
        ? requestSignal.reason
        : new DOMException("Voice synthesis request aborted", "AbortError");
    controller.abort(reason);
  };

  if (requestSignal) {
    requestSignal.addEventListener("abort", onAbort, { once: true });
  }

  const timer = setTimeout(() => {
    const timeoutError = new Error(
      `${timeoutLabel} timed out after ${timeoutMs}ms`
    );
    timeoutError.name = "TimeoutError";
    controller.abort(timeoutError);
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (requestSignal) {
        requestSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}

function createGradiumHttpError(status: number, bodyText: string): Error {
  const detail = bodyText.trim().slice(0, 320);
  const err = new Error(
    detail ? `Gradium API HTTP ${status}: ${detail}` : `Gradium API HTTP ${status}`
  ) as Error & { status: number };
  err.status = status;
  return err;
}

function decodeAudioDataUri(dataUri: string): {
  mimeType: string;
  buffer: Buffer;
  extension: string;
} {
  const commaIndex = dataUri.indexOf(",");
  const header = dataUri.slice(5, commaIndex).toLowerCase();
  const mimeType = header.split(";")[0]?.trim() || "audio/wav";
  const base64 = dataUri.slice(commaIndex + 1);
  const buffer = Buffer.from(base64, "base64");

  let extension = "wav";
  if (mimeType.includes("ogg") || mimeType.includes("opus")) {
    extension = "ogg";
  } else if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    extension = "mp3";
  } else if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    extension = "m4a";
  } else if (mimeType.includes("aac")) {
    extension = "aac";
  } else if (mimeType.includes("webm")) {
    extension = "webm";
  }

  return { mimeType, buffer, extension };
}

async function createGradiumClonedVoice(params: {
  apiKey: string;
  baseUrl: string;
  dataUri: string;
  language: "es" | "en";
  requestSignal?: AbortSignal;
}): Promise<string> {
  const { mimeType, buffer, extension } = decodeAudioDataUri(params.dataUri);
  const formData = new FormData();
  const audioBlob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("audio_file", audioBlob, `reference.${extension}`);
  formData.append("name", `vokaloom-clone-${Date.now()}`);
  formData.append("language", params.language);
  formData.append("enhance", "true");

  const { signal, cleanup } = createTimeoutAbortControl(
    params.requestSignal,
    GRADIUM_REQUEST_TIMEOUT_MS,
    "Gradium voice clone upload"
  );
  try {
    const res = await fetch(`${params.baseUrl}/voices/`, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
      },
      body: formData,
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw createGradiumHttpError(res.status, errText);
    }

    const payload = (await res.json().catch(() => null)) as {
      uid?: unknown;
      voice_id?: unknown;
    } | null;
    const rawUid =
      typeof payload?.uid === "string"
        ? payload.uid
        : typeof payload?.voice_id === "string"
          ? payload.voice_id
          : "";
    const voiceUid = rawUid.trim();
    if (!voiceUid) {
      throw new Error("Gradium /voices/ response missing uid");
    }
    return voiceUid;
  } finally {
    cleanup();
  }
}

async function synthesizeGradiumTts(params: {
  apiKey: string;
  baseUrl: string;
  text: string;
  voiceId: string;
  requestSignal?: AbortSignal;
}): Promise<string | null> {
  const { signal, cleanup } = createTimeoutAbortControl(
    params.requestSignal,
    GRADIUM_REQUEST_TIMEOUT_MS,
    "Gradium TTS synthesis"
  );
  try {
    const res = await fetch(`${params.baseUrl}/post/speech/tts`, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/wav, application/octet-stream",
      },
      body: JSON.stringify({
        text: params.text,
        voice_id: params.voiceId,
        output_format: "wav",
        model_name: "default",
        only_audio: true,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw createGradiumHttpError(res.status, errText);
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    if (audioBuffer.length === 0) {
      return null;
    }

    if (contentType.includes("application/json")) {
      const parsed = JSON.parse(audioBuffer.toString("utf8")) as {
        audio?: unknown;
        error?: unknown;
        detail?: unknown;
      };
      if (typeof parsed?.audio === "string" && parsed.audio.trim()) {
        const cleanB64 = parsed.audio.trim();
        return cleanB64.startsWith("data:")
          ? cleanB64
          : `data:audio/wav;base64,${cleanB64}`;
      }
      throw new Error(
        typeof parsed?.detail === "string"
          ? parsed.detail
          : typeof parsed?.error === "string"
            ? parsed.error
            : "Gradium returned JSON payload without audio bytes"
      );
    }

    const mimeType =
      contentType.startsWith("audio/")
        ? contentType.split(";")[0].trim()
        : "audio/wav";
    return `data:${mimeType};base64,${audioBuffer.toString("base64")}`;
  } finally {
    cleanup();
  }
}

async function deleteGradiumVoice(params: {
  apiKey: string;
  baseUrl: string;
  voiceUid: string;
}): Promise<void> {
  await fetch(
    `${params.baseUrl}/voices/${encodeURIComponent(params.voiceUid)}`,
    {
      method: "DELETE",
      headers: {
        "x-api-key": params.apiKey,
      },
      signal: AbortSignal.timeout(GRADIUM_CLEANUP_TIMEOUT_MS),
    }
  ).catch(() => undefined);
}

/**
 * Wraps raw 24kHz 16-bit mono signed-integer PCM bytes in a 44-byte RIFF WAVE header.
 */
function wrapPcmInWavHeader(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const pcmDataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmDataSize, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(pcmDataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generates a valid, playable 24kHz 16-bit PCM WAV data URI with realistic
 * speech-cadence harmonic formants so the audio player, download button,
 * and session history work 100% offline/keyless when neither GRADIUM_API_KEY nor GEMINI_API_KEY is configured.
 */
function synthesizePlayableWavDataUri(
  text: string,
  voiceId: string,
  isClone: boolean
): { dataUri: string; durationMs: number } {
  const sampleRate = 24000;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const durationSec = Math.min(6.0, Math.max(2.2, words.length * 0.24));
  const numSamples = Math.floor(sampleRate * durationSec);

  let baseFreq = 135;
  if (voiceId.includes("sofia") || voiceId.includes("abella")) {
    baseFreq = 210;
  } else if (voiceId.includes("lucas")) {
    baseFreq = 150;
  } else if (isClone) {
    baseFreq = 175;
  }

  const pcmBuffer = Buffer.alloc(numSamples * 2);
  const syllableRate = 4.2;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const globalEnv =
      Math.min(1, t / 0.08) * Math.min(1, (durationSec - t) / 0.15);

    const syllablePhase = (t * syllableRate) % 1;
    const syllableEnv =
      syllablePhase < 0.78
        ? Math.sin((syllablePhase / 0.78) * Math.PI)
        : 0.05;

    const pitchMod =
      1 + 0.08 * Math.sin(2 * Math.PI * 1.1 * t) - 0.04 * (t / durationSec);
    const f0 = baseFreq * pitchMod;

    const wave =
      0.55 * Math.sin(2 * Math.PI * f0 * t) +
      0.25 * Math.sin(2 * Math.PI * (f0 * 2) * t + 0.3) +
      0.14 * Math.sin(2 * Math.PI * (f0 * 3) * t + 0.7) +
      0.06 * Math.sin(2 * Math.PI * (f0 * 4) * t);

    const sampleValue = Math.max(
      -1,
      Math.min(1, wave * globalEnv * syllableEnv * 0.65)
    );
    const int16 = Math.floor(sampleValue * 32767);
    pcmBuffer.writeInt16LE(int16, i * 2);
  }

  const wavBuffer = wrapPcmInWavHeader(pcmBuffer, sampleRate, 1, 16);
  return {
    dataUri: `data:audio/wav;base64,${wavBuffer.toString("base64")}`,
    durationMs: Math.round(durationSec * 1000),
  };
}

function schedulePostResponseTask(task: () => Promise<unknown>): void {
  try {
    after(async () => {
      try {
        await task();
      } catch {
        // Ignore post-response refresh errors
      }
    });
  } catch {
    // Outside Next.js request lifecycle (e.g., direct Node unit test invocation)
    void task().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let locale = resolveRequestLocale(request);
  try {
    let body: VoiceRequestBody;
    try {
      body = (await readJsonBodyWithLimit(
        request,
        MAX_VOICE_REQUEST_BYTES
      )) as VoiceRequestBody;
    } catch (bodyErr) {
      if (bodyErr instanceof PayloadTooLargeError) {
        return NextResponse.json(
          { error: translate(locale, "api.voice.referenceAudioTooLarge") },
          { status: 413 }
        );
      }
      if (bodyErr instanceof MalformedJsonBodyError) {
        return NextResponse.json(
          { error: translate(locale, "api.voice.invalidReferenceAudio") },
          { status: 400 }
        );
      }
      throw bodyErr;
    }

    if (body.locale !== undefined) {
      locale = resolveRequestLocale(request, body.locale);
    }
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const voiceId =
      typeof body.voiceId === "string" ? body.voiceId.trim() : "mateo-es";
    const language = body.language === "en" ? "en" : "es";
    const refAudioValidation = validateReferenceAudioDataUri(
      body.referenceAudioBase64
    );

    if (text.length < 1 || text.length > 1500) {
      return NextResponse.json(
        {
          error: translate(locale, "api.voice.invalidLength"),
        },
        { status: 400 }
      );
    }

    if (refAudioValidation.provided && !refAudioValidation.valid) {
      return NextResponse.json(
        {
          error: translate(
            locale,
            refAudioValidation.reason === "tooLarge"
              ? "api.voice.referenceAudioTooLarge"
              : "api.voice.invalidReferenceAudio"
          ),
        },
        { status: 400 }
      );
    }

    const validatedReferenceAudio = refAudioValidation.provided
      ? refAudioValidation.dataUri
      : undefined;

    const cookieHeader = request.headers.get("cookie") ?? undefined;
    const [entitlement, gradiumKey, geminiKey] = await Promise.all([
      resolveServerEntitlement(cookieHeader),
      resolveApiKey("GRADIUM_API_KEY", cookieHeader),
      resolveApiKey("GEMINI_API_KEY", cookieHeader),
    ]);
    const gradiumBaseUrl = resolveGradiumApiBaseUrl();
    const clientIpKey = getRateLimitClientKey(request).key;
    const initialUserKey = entitlement.subjectId
      ? `sub:${entitlement.subjectId}`
      : clientIpKey;

    if (!gradiumKey && !geminiKey) {
      const quota = await enforceServerGenerationQuota(request, locale);
      if (!quota.allowed) {
        return quota.response;
      }
      // Mode C: Zero-Key Instant Offline Fallback
      const synth = synthesizePlayableWavDataUri(
        text,
        voiceId,
        Boolean(validatedReferenceAudio)
      );
      return attachServerTrialCookie(
        NextResponse.json({
          audioUrl: synth.dataUri,
          engine: translate(locale, "api.voice.demoFallbackEngine"),
          language,
          durationMs: synth.durationMs,
          isFallback: true,
          budget: await getPublicQuotaSnapshot(),
        }),
        quota.trialCookieToken,
        quota.resetAt
      );
    }

    const fallbackDisabled = isPaidModelFallbackDisabled();
    const [gradiumBroken, geminiBroken] = await Promise.all([
      gradiumKey
        ? isProviderCircuitBroken("gradium")
        : Promise.resolve(false),
      geminiKey ? isProviderCircuitBroken("gemini") : Promise.resolve(false),
    ]);

    const canUseGradium = Boolean(gradiumKey) && !gradiumBroken;
    const canUseGeminiFallback =
      Boolean(geminiKey) &&
      !geminiBroken &&
      (!gradiumKey || (!fallbackDisabled && !validatedReferenceAudio));

    const providerUnavailableReason =
      !canUseGradium && !canUseGeminiFallback ? "circuit_breaker" : undefined;

    const activeProviders: Array<"gemini" | "gradium"> = [];
    if (gradiumKey) {
      activeProviders.push("gradium");
    }
    if (
      geminiKey &&
      (!gradiumKey || (!fallbackDisabled && !validatedReferenceAudio))
    ) {
      activeProviders.push("gemini");
    }

    // Read-only eligibility check BEFORE consuming guest trial credits so
    // paused, capped, low-balance, or circuit-broken responses return 429/503 cleanly.
    const eligibility = await checkPaidGenerationEligibility("audio", {
      role: entitlement.role,
      userKey: initialUserKey,
      providers: activeProviders,
      providerUnavailableReason,
    });
    if (!eligibility.allowed) {
      const budget = await getPublicQuotaSnapshot();
      const status = eligibility.statusCode ?? 429;
      return NextResponse.json(
        {
          error: getBudgetCapErrorMessage(locale, eligibility),
          capReached: status !== 503,
          durableStoreUnavailable: status === 503,
          resource: "audio",
          reason: eligibility.reason,
          budget,
        },
        { status }
      );
    }

    const quota = await enforceServerGenerationQuota(request, locale);
    if (!quota.allowed) {
      return quota.response;
    }

    const withQuotaCookie = (res: NextResponse) =>
      attachServerTrialCookie(res, quota.trialCookieToken, quota.resetAt);

    const reservationUserKey = quota.subjectId
      ? `sub:${quota.subjectId}`
      : clientIpKey;

    const reservation = await reservePaidGenerationSlot("audio", {
      role: quota.role,
      userKey: reservationUserKey,
      providers: activeProviders,
      providerUnavailableReason,
    });
    if (!reservation.allowed) {
      const budget = await getPublicQuotaSnapshot();
      const status = reservation.statusCode ?? 429;
      return NextResponse.json(
        {
          error: getBudgetCapErrorMessage(locale, reservation),
          capReached: status !== 503,
          durableStoreUnavailable: status === 503,
          resource: "audio",
          reason: reservation.reason,
          budget,
        },
        { status }
      );
    }

    let gradiumAttempted = false;
    let lastConfigError: { statusCode?: number } | null = null;

    // Mode A: Zero-Shot Voice Cloning via Gradium AI (POST /voices/ -> POST /post/speech/tts)
    if (validatedReferenceAudio && gradiumKey && canUseGradium) {
      gradiumAttempted = true;
      let clonedVoiceUid: string | null = null;
      try {
        clonedVoiceUid = await createGradiumClonedVoice({
          apiKey: gradiumKey,
          baseUrl: gradiumBaseUrl,
          dataUri: validatedReferenceAudio,
          language,
          requestSignal: request.signal,
        });
        const audioUrl = await synthesizeGradiumTts({
          apiKey: gradiumKey,
          baseUrl: gradiumBaseUrl,
          text,
          voiceId: clonedVoiceUid,
          requestSignal: request.signal,
        });
        if (audioUrl) {
          await recordGradiumUsage({ characters: text.length, isClone: true });
          const uidToDelete = clonedVoiceUid;
          schedulePostResponseTask(() =>
            deleteGradiumVoice({
              apiKey: gradiumKey,
              baseUrl: gradiumBaseUrl,
              voiceUid: uidToDelete,
            })
          );
          return withQuotaCookie(
            NextResponse.json({
              audioUrl,
              engine: translate(locale, "api.voice.engine.gradiumClone"),
              language,
              durationMs: Date.now() - startTime,
              isFallback: false,
              budget: await getPublicQuotaSnapshot(),
            })
          );
        }
      } catch (err) {
        if (clonedVoiceUid) {
          const uidToDelete = clonedVoiceUid;
          schedulePostResponseTask(() =>
            deleteGradiumVoice({
              apiKey: gradiumKey,
              baseUrl: gradiumBaseUrl,
              voiceUid: uidToDelete,
            })
          );
        }
        if (request.signal?.aborted) {
          throw err;
        }
        const exhaustion = isUpstreamExhaustionError(err);
        if (exhaustion.exhausted) {
          await recordProviderExhaustion(
            "gradium",
            exhaustion.statusCode,
            exhaustion.reason
          );
        }
        const cfgErr = isUpstreamConfigError(err);
        if (cfgErr.isConfigError) {
          lastConfigError = { statusCode: cfgErr.statusCode };
        }
        console.warn("Gradium AI zero-shot cloning call failed:", err);
      }
    }

    // Mode B: Preset Neural TTS via Gradium AI (POST /post/speech/tts)
    if (!validatedReferenceAudio && gradiumKey && canUseGradium) {
      gradiumAttempted = true;
      try {
        const gradiumVoiceId = resolveGradiumPresetVoiceId(voiceId, language);
        const audioUrl = await synthesizeGradiumTts({
          apiKey: gradiumKey,
          baseUrl: gradiumBaseUrl,
          text,
          voiceId: gradiumVoiceId,
          requestSignal: request.signal,
        });
        if (audioUrl) {
          await recordGradiumUsage({
            characters: text.length,
            isClone: false,
          });
          return withQuotaCookie(
            NextResponse.json({
              audioUrl,
              engine: translate(locale, "api.voice.engine.gradiumTts"),
              language,
              durationMs: Date.now() - startTime,
              isFallback: false,
              budget: await getPublicQuotaSnapshot(),
            })
          );
        }
      } catch (err) {
        if (request.signal?.aborted) {
          throw err;
        }
        const exhaustion = isUpstreamExhaustionError(err);
        if (exhaustion.exhausted) {
          await recordProviderExhaustion(
            "gradium",
            exhaustion.statusCode,
            exhaustion.reason
          );
        }
        const cfgErr = isUpstreamConfigError(err);
        if (cfgErr.isConfigError) {
          lastConfigError = { statusCode: cfgErr.statusCode };
        }
        console.warn("Gradium AI preset TTS call failed:", err);
      }
    }

    // Mode B2: Gemini Native Neural TTS via GEMINI_API_KEY
    // Never fall through from Gradium to Gemini when DISABLE_PAID_MODEL_FALLBACK is active.
    if (
      geminiKey &&
      !geminiBroken &&
      (!gradiumAttempted || (!fallbackDisabled && !validatedReferenceAudio))
    ) {
      const ttsModel = resolveGeminiTtsModel();
      try {
        // @google/genai v3 defaults to v1, where generation_config rejects speechConfig;
        // Gemini TTS (responseModalities: ["AUDIO"] + speechConfig) requires v1beta.
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          apiVersion: "v1beta",
          httpOptions: { apiVersion: "v1beta" },
        });
        const voiceName =
          voiceId.includes("sofia") || voiceId.includes("abella")
            ? "Aoede"
            : voiceId.includes("lucas")
              ? "Puck"
              : "Charon";

        const geminiAbortSignal = request.signal
          ? AbortSignal.any([
              request.signal,
              AbortSignal.timeout(GEMINI_TTS_TIMEOUT_MS),
            ])
          : AbortSignal.timeout(GEMINI_TTS_TIMEOUT_MS);

        const response = await ai.models.generateContent({
          model: ttsModel,
          contents: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          config: {
            abortSignal: geminiAbortSignal,
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        });

        await recordGeminiUsage("audio", response.usageMetadata);

        const audioPart = response.candidates?.[0]?.content?.parts?.find(
          (part) => Boolean(part.inlineData?.data)
        );
        const base64Audio = audioPart?.inlineData?.data;
        if (base64Audio) {
          const rawBuffer = Buffer.from(base64Audio, "base64");
          const audioMime =
            (audioPart?.inlineData?.mimeType || "audio/pcm")
              .split(";")[0]
              ?.trim()
              .toLowerCase() || "audio/pcm";
          const hasRiffHeader =
            rawBuffer.length >= 12 &&
            rawBuffer.toString("ascii", 0, 4) === "RIFF" &&
            rawBuffer.toString("ascii", 8, 12) === "WAVE";
          const isEncodedAudio =
            hasRiffHeader ||
            (audioMime.startsWith("audio/") &&
              !audioMime.includes("pcm") &&
              !audioMime.includes("l16"));
          const outBuffer = isEncodedAudio
            ? rawBuffer
            : wrapPcmInWavHeader(rawBuffer, 24000, 1, 16);
          const outMime = hasRiffHeader
            ? "audio/wav"
            : isEncodedAudio
              ? audioMime
              : "audio/wav";
          const pcmByteLen = hasRiffHeader
            ? Math.max(0, rawBuffer.length - 44)
            : rawBuffer.length;
          const durationMs = Math.max(
            500,
            Math.round((pcmByteLen / (24000 * 2)) * 1000)
          );
          return withQuotaCookie(
            NextResponse.json({
              audioUrl: `data:${outMime};base64,${outBuffer.toString("base64")}`,
              engine: translate(locale, "api.voice.engine.geminiTts"),
              language,
              durationMs,
              isFallback: false,
              budget: await getPublicQuotaSnapshot(),
            })
          );
        }
      } catch (err) {
        if (request.signal?.aborted) {
          throw err;
        }
        const exhaustion = isUpstreamExhaustionError(err);
        if (exhaustion.exhausted) {
          await recordProviderExhaustion(
            "gemini",
            exhaustion.statusCode,
            exhaustion.reason
          );
        }
        const cfgErr = isUpstreamConfigError(err);
        if (cfgErr.isConfigError) {
          lastConfigError = { statusCode: cfgErr.statusCode };
        }
        console.warn(
          `Gemini Native TTS (${ttsModel}) call failed, falling back to demo synth:`,
          err
        );
      }
    }

    if (process.env.NODE_ENV === "production" && lastConfigError) {
      return NextResponse.json(
        {
          error: translate(locale, "api.budget.providerConfigError"),
          providerConfigError: true,
          statusCode: lastConfigError.statusCode,
          budget: await getPublicQuotaSnapshot(),
        },
        { status: 502 }
      );
    }

    // Mode C: Zero-Key Instant Offline Fallback
    const synth = synthesizePlayableWavDataUri(
      text,
      voiceId,
      Boolean(validatedReferenceAudio)
    );
    return withQuotaCookie(
      NextResponse.json({
        audioUrl: synth.dataUri,
        engine: translate(locale, "api.voice.demoFallbackEngine"),
        language,
        durationMs: synth.durationMs,
        isFallback: true,
        budget: await getPublicQuotaSnapshot(),
      })
    );
  } catch (error) {
    console.error("Error in /api/voice:", error);
    return NextResponse.json(
      { error: translate(locale, "api.voice.processError") },
      { status: 500 }
    );
  }
}
