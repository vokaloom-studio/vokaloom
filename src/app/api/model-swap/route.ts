import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  checkPaidGenerationEligibility,
  getBudgetCapErrorMessage,
  getPublicQuotaSnapshot,
  isUpstreamExhaustionError,
  recordGeminiUsage,
  recordProviderExhaustion,
  reservePaidGenerationSlot,
  resolveGeminiImageModel,
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
import {
  AsyncSemaphore,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS,
  InvalidUpstreamContentTypeError,
  UpstreamConcurrencyLimitError,
  UpstreamImageTooLargeError,
  UpstreamStatusError,
  fetchAllowedBackgroundImage,
  parseAllowedBackgroundUrl,
  validateBase64ImagePayload,
} from "@/lib/upstream-image";

export const maxDuration = 60;

const UPSTREAM_FETCH_TIMEOUT_MS = DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS;
const MAX_BACKGROUND_IMAGE_BYTES = DEFAULT_MAX_IMAGE_BYTES; // 15 MB
const MAX_MODEL_SWAP_REQUEST_BYTES = 8 * 1024 * 1024; // 8 MB
const GEMINI_SWAP_TIMEOUT_MS = 25_000;
const modelSwapFetchSemaphore = new AsyncSemaphore(4, 16, 10_000);

interface ModelSwapRequestBody {
  modelImageBase64?: unknown;
  backgroundUrl?: string;
  sceneTitle?: string;
  locale?: unknown;
}

const COMPOSITE_PROMPT =
  "Place the exact person/model from the first image naturally into the real environment of the second vertical 9:16 background image. Match lighting, shadows, color grading, and candid smartphone photography realism. Keep 9:16 vertical framing.";

function extractImagePart(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
}): { data: string; mimeType: string } | null {
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType || "image/png",
      };
    }
  }
  return null;
}

export async function POST(request: Request) {
  let locale = resolveRequestLocale(request);
  try {
    let body: ModelSwapRequestBody;
    try {
      body = (await readJsonBodyWithLimit(
        request,
        MAX_MODEL_SWAP_REQUEST_BYTES
      )) as ModelSwapRequestBody;
    } catch (bodyErr) {
      if (bodyErr instanceof PayloadTooLargeError) {
        return NextResponse.json(
          { error: translate(locale, "api.modelSwap.modelImageTooLarge") },
          { status: 413 }
        );
      }
      if (bodyErr instanceof MalformedJsonBodyError) {
        return NextResponse.json(
          { error: translate(locale, "api.modelSwap.invalidModelImage") },
          { status: 400 }
        );
      }
      throw bodyErr;
    }

    if (body.locale !== undefined) {
      locale = resolveRequestLocale(request, body.locale);
    }

    const modelImageRaw =
      typeof body.modelImageBase64 === "string"
        ? body.modelImageBase64.trim()
        : "";
    const backgroundUrl =
      typeof body.backgroundUrl === "string"
        ? body.backgroundUrl.trim()
        : "";

    if (!modelImageRaw || !backgroundUrl) {
      return NextResponse.json(
        { error: translate(locale, "api.modelSwap.missingInputs") },
        { status: 400 }
      );
    }

    const parsedBackgroundUrl = parseAllowedBackgroundUrl(backgroundUrl);
    if (!parsedBackgroundUrl) {
      return NextResponse.json(
        { error: translate(locale, "api.modelSwap.invalidBackgroundOrigin") },
        { status: 400 }
      );
    }

    const modelPart = validateBase64ImagePayload(body.modelImageBase64);
    if (!modelPart.valid) {
      return NextResponse.json(
        {
          error: translate(
            locale,
            modelPart.reason === "tooLarge"
              ? "api.modelSwap.modelImageTooLarge"
              : "api.modelSwap.invalidModelImage"
          ),
        },
        { status: modelPart.reason === "tooLarge" ? 413 : 400 }
      );
    }

    const cookieHeader = request.headers.get("cookie") ?? undefined;
    const entitlement = await resolveServerEntitlement(cookieHeader);
    const clientIpKey = getRateLimitClientKey(request).key;
    const initialUserKey = entitlement.subjectId
      ? `sub:${entitlement.subjectId}`
      : clientIpKey;

    const geminiKey = await resolveApiKey("GEMINI_API_KEY");
    if (!geminiKey) {
      const quota = await enforceServerGenerationQuota(request, locale);
      if (!quota.allowed) {
        return quota.response;
      }
      return attachServerTrialCookie(
        NextResponse.json({
          resultImageUrl: null,
          fallbackComposite: true,
          engine: translate(locale, "api.modelSwap.fallbackEngine"),
          isFallback: true,
          budget: await getPublicQuotaSnapshot(),
        }),
        quota.trialCookieToken,
        quota.resetAt
      );
    }

    // Read-only eligibility check BEFORE consuming guest trial credits so
    // paused, capped, or circuit-broken responses return 429/503 cleanly.
    const eligibility = await checkPaidGenerationEligibility("image", {
      role: entitlement.role,
      userKey: initialUserKey,
      providers: ["gemini"],
    });
    if (!eligibility.allowed) {
      const budget = await getPublicQuotaSnapshot();
      const status = eligibility.statusCode ?? 429;
      return NextResponse.json(
        {
          error: getBudgetCapErrorMessage(locale, eligibility),
          capReached: status !== 503,
          durableStoreUnavailable: status === 503,
          resource: "image",
          reason: eligibility.reason,
          budget,
        },
        { status }
      );
    }

    // Fetch and validate background BEFORE reserving a paid image cap slot or
    // consuming guest credits so 404/413/502/timeout never burns billable quota.
    let bgBytes: Uint8Array;
    let bgContentType: string;
    try {
      const fetched = await fetchAllowedBackgroundImage(parsedBackgroundUrl, {
        maxBytes: MAX_BACKGROUND_IMAGE_BYTES,
        timeoutMs: UPSTREAM_FETCH_TIMEOUT_MS,
        signal: request.signal,
        semaphore: modelSwapFetchSemaphore,
      });
      bgBytes = fetched.bytes;
      bgContentType = fetched.contentType;
    } catch (fetchErr) {
      if (fetchErr instanceof UpstreamStatusError) {
        return NextResponse.json({
          resultImageUrl: null,
          fallbackComposite: true,
          engine: translate(locale, "api.modelSwap.fallbackEngine"),
          isFallback: true,
          budget: await getPublicQuotaSnapshot(),
        });
      }
      if (fetchErr instanceof InvalidUpstreamContentTypeError) {
        return NextResponse.json(
          { error: translate(locale, "api.bg.invalidUpstreamContentType") },
          { status: 502 }
        );
      }
      if (fetchErr instanceof UpstreamImageTooLargeError) {
        return NextResponse.json(
          { error: translate(locale, "api.bg.proxyTooLarge") },
          { status: 413 }
        );
      }
      if (fetchErr instanceof UpstreamConcurrencyLimitError) {
        return NextResponse.json(
          { error: translate(locale, "api.modelSwap.processError") },
          { status: 503, headers: { "Retry-After": "2" } }
        );
      }
      throw fetchErr;
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

    const reservation = await reservePaidGenerationSlot("image", {
      role: quota.role,
      userKey: reservationUserKey,
      providers: ["gemini"],
    });
    if (!reservation.allowed) {
      const budget = await getPublicQuotaSnapshot();
      const status = reservation.statusCode ?? 429;
      return NextResponse.json(
        {
          error: getBudgetCapErrorMessage(locale, reservation),
          capReached: status !== 503,
          durableStoreUnavailable: status === 503,
          resource: "image",
          reason: reservation.reason,
          budget,
        },
        { status }
      );
    }

    const bgBase64 = Buffer.from(
      bgBytes.buffer,
      bgBytes.byteOffset,
      bgBytes.byteLength
    ).toString("base64");
    const bgMimeType = bgContentType.split(";")[0]?.trim() || "image/jpeg";

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const safeSceneTitle =
      typeof body.sceneTitle === "string"
        ? body.sceneTitle.replace(/[\r\n]+/g, " ").trim().slice(0, 200)
        : "";
    const promptWithScene = safeSceneTitle
      ? `${COMPOSITE_PROMPT} Scene context: ${safeSceneTitle}.`
      : COMPOSITE_PROMPT;
    const createGeminiAbortSignal = () =>
      request.signal
        ? AbortSignal.any([
            request.signal,
            AbortSignal.timeout(GEMINI_SWAP_TIMEOUT_MS),
          ])
        : AbortSignal.timeout(GEMINI_SWAP_TIMEOUT_MS);

    const contents = [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: modelPart.data,
              mimeType: modelPart.mimeType,
            },
          },
          {
            inlineData: {
              data: bgBase64,
              mimeType: bgMimeType,
            },
          },
          { text: promptWithScene },
        ],
      },
    ];

    const imageModel = resolveGeminiImageModel();

    try {
      const response = await ai.models.generateContent({
        model: imageModel,
        contents,
        config: {
          abortSignal: createGeminiAbortSignal(),
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio: "9:16",
          },
        },
      });

      await recordGeminiUsage("image", response.usageMetadata);

      const generated = extractImagePart(response);
      if (generated) {
        return withQuotaCookie(
          NextResponse.json({
            resultImageUrl: `data:${generated.mimeType};base64,${generated.data}`,
            engine: translate(locale, "api.modelSwap.geminiEngine"),
            isFallback: false,
            budget: await getPublicQuotaSnapshot(),
          })
        );
      }
    } catch (primaryErr) {
      if (request.signal?.aborted) {
        throw primaryErr;
      }
      const exhaustion = isUpstreamExhaustionError(primaryErr);
      if (exhaustion.exhausted) {
        await recordProviderExhaustion(
          "gemini",
          exhaustion.statusCode,
          exhaustion.reason
        );
      }
      console.warn(`${imageModel} failed:`, primaryErr);
    }

    return withQuotaCookie(
      NextResponse.json({
        resultImageUrl: null,
        fallbackComposite: true,
        engine: translate(locale, "api.modelSwap.fallbackEngine"),
        isFallback: true,
        budget: await getPublicQuotaSnapshot(),
      })
    );
  } catch (error) {
    console.error("Error in /api/model-swap:", error);
    return NextResponse.json(
      { error: translate(locale, "api.modelSwap.processError") },
      { status: 500 }
    );
  }
}
