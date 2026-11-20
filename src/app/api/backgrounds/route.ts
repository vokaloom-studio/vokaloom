import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  getBudgetCapErrorMessage,
  getPublicQuotaSnapshot,
  isStockProviderRateLimited,
  isUpstreamExhaustionError,
  recordGeminiUsage,
  recordProviderExhaustion,
  recordStockRateLimit,
  reservePaidGenerationSlot,
  resolveGeminiVisionModel,
} from "@/lib/budget-guard";
import { getRateLimitClientKey } from "@/lib/client-ip";
import { resolveRequestLocale, translate, type Locale } from "@/lib/i18n";
import { createRateLimitStore } from "@/lib/rate-limit";
import {
  MalformedJsonBodyError,
  PayloadTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import {
  attachServerTrialCookie,
  enforceServerGenerationQuota,
} from "@/lib/server-quota";
import { resolveApiKey, type EntitlementRole } from "@/lib/server-secrets";
import {
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
const MAX_PROXY_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_BACKGROUNDS_REQUEST_BYTES = 8 * 1024 * 1024; // 8 MB
const GEMINI_VISION_TIMEOUT_MS = 15_000;

const proxyRateLimitStore = createRateLimitStore({
  maxAttempts: 60,
  windowMs: 60 * 1000,
  maxEntries: 5_000,
  keyPrefix: "vokaloom:bg_proxy:",
});

export interface BackgroundItem {
  id: string;
  title: string;
  photographer: string;
  source: "pexels" | "unsplash" | "curated";
  previewUrl: string;
  downloadUrl: string;
  aspect: "9:16";
}

interface BackgroundsRequest {
  query?: string;
  vibe?: string;
  page?: number;
  batchSize?: 5 | 15;
  preload?: boolean;
  referenceImageBase64?: unknown;
  mimeType?: unknown;
  locale?: unknown;
}

interface CuratedPhotoSeed {
  photoId: string;
  title: string;
  photographer: string;
  vibeCategory: string;
}

const CURATED_VERTICAL_POOL: CuratedPhotoSeed[] = [
  {
    photoId: "1507525428034-b723cf961d3e",
    title: "Tropical Coastal Morning Sunlight",
    photographer: "Sean Oulashin",
    vibeCategory: "Luxury Travel",
  },
  {
    photoId: "1512100356356-de1b84283e18",
    title: "Amalfi Coast Cliffside Balcony POV",
    photographer: "Sander Traa",
    vibeCategory: "Luxury Travel",
  },
  {
    photoId: "1501785888041-af3ef285b470",
    title: "Alpine Lake Wooden Boats at Dawn",
    photographer: "Pietro De Grandi",
    vibeCategory: "Luxury Travel",
  },
  {
    photoId: "1520250497591-112f2f40a3f4",
    title: "Infinity Pool Resort Overlooking Ocean",
    photographer: "Paolo Nicolello",
    vibeCategory: "Luxury Travel",
  },
  {
    photoId: "1476514525535-07fb3b4ae5f1",
    title: "Emerald Mountain Fjord Travel POV",
    photographer: "Luca Bravo",
    vibeCategory: "Luxury Travel",
  },
  {
    photoId: "1509042239860-f550ce710b93",
    title: "Artisan Latte On Marble Bistro Table",
    photographer: "Nathan Dumlao",
    vibeCategory: "Minimalist Cafe",
  },
  {
    photoId: "1495474472287-4d71bcdd2085",
    title: "Morning Pour Over Coffee Sunlight",
    photographer: "Jakub Dziubak",
    vibeCategory: "Minimalist Cafe",
  },
  {
    photoId: "1554118811-1e0d58224f24",
    title: "Warm Aesthetic Parisian Cafe Corner",
    photographer: "blocks Fletcher",
    vibeCategory: "Minimalist Cafe",
  },
  {
    photoId: "1511920170033-f8396924c348",
    title: "Minimalist Espresso & Linen Notebook",
    photographer: "Kari Shea",
    vibeCategory: "Minimalist Cafe",
  },
  {
    photoId: "1501339847302-ac426a4a7cbb",
    title: "Cozy Window Seat Coffee Shop POV",
    photographer: "Toa Heftiba",
    vibeCategory: "Minimalist Cafe",
  },
  {
    photoId: "1600585154340-be6161a56a0c",
    title: "Sunlit Modern Villa Courtyard Terrace",
    photographer: "R Architecture",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1600607687939-ce8a6c25118c",
    title: "Open Architectural Villa Living Space",
    photographer: "R Architecture",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1618221195710-dd6b41faaea6",
    title: "Minimalist Sunlit Loft Interior",
    photographer: "Sidekix Media",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1600210492486-724fe5c67fb0",
    title: "Contemporary Limestone Lounge & Gallery",
    photographer: "Sidekix Media",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1502672260266-1c1ef2d93688",
    title: "Bright Parisian Apartment Terrace Lounge",
    photographer: "Patrick Perkins",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1477959858617-67f85cf4f1df",
    title: "Manhattan Downtown Architecture POV",
    photographer: "Pedro Lastra",
    vibeCategory: "Urban Street POV",
  },
  {
    photoId: "1514924013411-cbf25faa35bb",
    title: "Rainy Neon Evening Crosswalk Aesthetic",
    photographer: "Jacek Dylag",
    vibeCategory: "Urban Street POV",
  },
  {
    photoId: "1480714378408-67cf0d13bc1b",
    title: "Golden Sunset Through City Skyscrapers",
    photographer: "Ben o'bro",
    vibeCategory: "Urban Street POV",
  },
  {
    photoId: "1449824913935-59a10b8d2000",
    title: "European Cobblestone Alley Morning Light",
    photographer: "harley-davidson",
    vibeCategory: "Urban Street POV",
  },
  {
    photoId: "1519501025264-65ba15a82390",
    title: "Minimalist Concrete Metro Perspective",
    photographer: "Max Bender",
    vibeCategory: "Urban Street POV",
  },
  {
    photoId: "1506744038136-46273834b3fb",
    title: "Yosemite Valley Golden Sunset Reflection",
    photographer: "Bailey Zindel",
    vibeCategory: "Nature Sunset",
  },
  {
    photoId: "1469474968028-56623f02e42e",
    title: "Highland Ridge Sunbeams Over Mist",
    photographer: "David Marcu",
    vibeCategory: "Nature Sunset",
  },
  {
    photoId: "1470071459604-3b5ec3a7fe05",
    title: "Misty Forest Ridges at Amber Dusk",
    photographer: "v2osk",
    vibeCategory: "Nature Sunset",
  },
  {
    photoId: "1500530855697-b586d89ba3ee",
    title: "Desert Highway Horizon at Twilight",
    photographer: "Jake Blucker",
    vibeCategory: "Nature Sunset",
  },
  {
    photoId: "1447752875215-b2761acb3c5d",
    title: "Ancient Redwood Canopy Sunflare",
    photographer: "Tim Swaan",
    vibeCategory: "Nature Sunset",
  },
  {
    photoId: "1507608616759-54f48f0af0ee",
    title: "Mediterranean Yacht Deck Sunset POV",
    photographer: "Cappadocia Creator",
    vibeCategory: "Luxury Travel",
  },
  {
    photoId: "1499793983690-e29da59ef1c2",
    title: "Whitewashed Santorini Villa Veranda",
    photographer: "Raimond Klavins",
    vibeCategory: "Luxury Travel",
  },
  {
    photoId: "1517248135467-4c7edcad34c4",
    title: "Warm Candlelit Dinner Terrace POV",
    photographer: "Jason Leung",
    vibeCategory: "Minimalist Cafe",
  },
  {
    photoId: "1522771739844-6a9f6d5f14af",
    title: "Minimalist Warm Beige Bedroom Sunlight",
    photographer: "Christopher Jolly",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1465146344425-f00d5f5c8f07",
    title: "Wildflower Meadow Sunset Glow",
    photographer: "Henry Be",
    vibeCategory: "Nature Sunset",
  },
];

async function analyzeReferenceImageWithGemini(
  base64Data: string,
  mimeType: string,
  fallbackQuery: string,
  locale: Locale,
  role?: EntitlementRole | "guest",
  userKey?: string,
  signal?: AbortSignal,
  cookieHeader?: string
): Promise<{
  resolvedQuery: string;
  visionUsed: boolean;
  visionCapNotice?: string;
}> {
  const apiKey = await resolveApiKey("GEMINI_API_KEY", cookieHeader);
  if (!apiKey) {
    return {
      resolvedQuery: `${fallbackQuery} candid vertical sunlight`,
      visionUsed: false,
    };
  }

  const reservation = await reservePaidGenerationSlot("vision", {
    role,
    userKey,
    providers: ["gemini"],
  });
  if (!reservation.allowed) {
    return {
      resolvedQuery: `${fallbackQuery} candid vertical aesthetic`,
      visionUsed: false,
      visionCapNotice:
        getBudgetCapErrorMessage(locale, reservation) ||
        translate(locale, "api.budget.visionCapNotice"),
    };
  }

  try {
    const cleanBase64 = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

    const timeoutSignal = AbortSignal.timeout(GEMINI_VISION_TIMEOUT_MS);
    const abortSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: resolveGeminiVisionModel(),
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || "image/jpeg",
              },
            },
            {
              text: "Analyze this reference photo from a social media creative director. Return ONLY a concise 4 to 6 word English photographic search query describing the subject, lighting, camera angle, and Instagram lifestyle/travel aesthetic (for example: 'candid luxury coastal cafe vertical sunlight'). No punctuation or extra text.",
            },
          ],
        },
      ],
      config: {
        abortSignal,
      },
    });

    await recordGeminiUsage("vision", response.usageMetadata);

    const extracted = response.text
      ?.trim()
      .replace(/["'.]/g, "")
      .replace(/\s+/g, " ");

    if (extracted && extracted.length >= 4) {
      return { resolvedQuery: extracted, visionUsed: true };
    }
  } catch (err) {
    const exhaustion = isUpstreamExhaustionError(err);
    if (exhaustion.exhausted) {
      await recordProviderExhaustion(
        "gemini",
        exhaustion.statusCode,
        exhaustion.reason
      );
    }
    console.warn("Gemini Vision fallback triggered:", err);
  }

  return {
    resolvedQuery: `${fallbackQuery} candid vertical aesthetic`,
    visionUsed: false,
  };
}

interface PexelsPhoto {
  id: number;
  alt?: string;
  photographer?: string;
  src?: {
    large2x?: string;
    large?: string;
    portrait?: string;
    original?: string;
  };
}

async function fetchFromPexels(
  query: string,
  page: number,
  limit: number,
  cookieHeader?: string
): Promise<BackgroundItem[]> {
  const apiKey = await resolveApiKey("PEXELS_API_KEY", cookieHeader);
  if (!apiKey) {
    return [];
  }
  if (await isStockProviderRateLimited("pexels")) {
    return [];
  }

  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("page", String(page));
    url.searchParams.set("orientation", "portrait");

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey.trim() },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
    });

    await recordStockRateLimit("pexels", {
      headers: res.headers,
      status: res.status,
      rateLimited: res.status === 429 ? true : undefined,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { photos?: PexelsPhoto[] };
    return (data.photos || []).slice(0, limit).map((p, idx) => ({
      id: `pexels-${p.id}-${page}-${idx}`,
      title: p.alt || `${query} vertical aesthetic #${idx + 1}`,
      photographer: p.photographer || "Pexels Creator",
      source: "pexels" as const,
      previewUrl:
        p.src?.portrait || p.src?.large || p.src?.original || "",
      downloadUrl:
        p.src?.large2x || p.src?.original || p.src?.portrait || "",
      aspect: "9:16" as const,
    }));
  } catch {
    return [];
  }
}

interface UnsplashPhoto {
  id: string;
  alt_description?: string | null;
  description?: string | null;
  user?: { name?: string };
  urls?: {
    regular?: string;
    full?: string;
    raw?: string;
  };
}

async function fetchFromUnsplash(
  query: string,
  page: number,
  limit: number,
  cookieHeader?: string
): Promise<BackgroundItem[]> {
  const accessKey = await resolveApiKey("UNSPLASH_ACCESS_KEY", cookieHeader);
  if (!accessKey) {
    return [];
  }
  if (await isStockProviderRateLimited("unsplash")) {
    return [];
  }

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("page", String(page));
    url.searchParams.set("orientation", "portrait");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey.trim()}` },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
    });

    await recordStockRateLimit("unsplash", {
      headers: res.headers,
      status: res.status,
      rateLimited: res.status === 429 ? true : undefined,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { results?: UnsplashPhoto[] };
    return (data.results || []).slice(0, limit).map((u, idx) => ({
      id: `unsplash-${u.id}-${page}-${idx}`,
      title:
        u.alt_description ||
        u.description ||
        `${query} candid vertical #${idx + 1}`,
      photographer: u.user?.name || "Unsplash Creator",
      source: "unsplash" as const,
      previewUrl: u.urls?.regular || u.urls?.full || "",
      downloadUrl: u.urls?.full || u.urls?.regular || "",
      aspect: "9:16" as const,
    }));
  } catch {
    return [];
  }
}

function scoreSeedRelevance(
  seed: CuratedPhotoSeed,
  vibe: string,
  query: string
): number {
  let score = 0;
  const lowerVibe = vibe.toLowerCase();
  const haystack = `${seed.title} ${seed.vibeCategory}`.toLowerCase();

  if (lowerVibe && seed.vibeCategory.toLowerCase().includes(lowerVibe)) {
    score += 10;
  }

  const queryTokens = `${vibe} ${query}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 4;
    }
  }

  return score;
}

function buildCuratedBatch(
  count: number,
  vibe: string,
  query: string,
  page: number
): BackgroundItem[] {
  const pool = [...CURATED_VERTICAL_POOL];

  // Score each photo seed against both vibe AND keywords in query
  const prioritized = pool.sort((a, b) => {
    const scoreA = scoreSeedRelevance(a, vibe, query);
    const scoreB = scoreSeedRelevance(b, vibe, query);
    return scoreB - scoreA;
  });

  const offset = ((Math.max(1, page) - 1) * 7) % prioritized.length;
  const rotated = [
    ...prioritized.slice(offset),
    ...prioritized.slice(0, offset),
  ];

  const items: BackgroundItem[] = [];
  for (let i = 0; i < count; i++) {
    const seed = rotated[i % rotated.length];
    const cropOffset = ((page - 1) * 15 + i) % 10;
    const previewUrl = `https://images.unsplash.com/photo-${seed.photoId}?auto=format&fit=crop&w=720&h=1280&q=80&fp-y=${(0.4 + cropOffset * 0.02).toFixed(2)}`;
    const downloadUrl = `https://images.unsplash.com/photo-${seed.photoId}?auto=format&fit=crop&w=1080&h=1920&q=90`;

    items.push({
      id: `curated-${seed.photoId}-p${page}-${i}`,
      title: query
        ? `${seed.title} (${query.slice(0, 28)})`
        : `${seed.title} — ${seed.vibeCategory}`,
      photographer: seed.photographer,
      source: "curated",
      previewUrl,
      downloadUrl,
      aspect: "9:16",
    });
  }

  return items;
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const locale = resolveRequestLocale(
    request,
    reqUrl.searchParams.get("locale")
  );
  const secFetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (secFetchSite === "cross-site") {
    return NextResponse.json(
      { error: translate(locale, "api.bg.forbiddenOrigin") },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const rateLimit = await proxyRateLimitStore.tryConsume(
      getRateLimitClientKey(request).key
    );
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          error: translate(locale, "api.bg.proxyBusy"),
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const proxyUrl = reqUrl.searchParams.get("proxyUrl");
    const parsedProxyUrl = parseAllowedBackgroundUrl(proxyUrl);
    if (!parsedProxyUrl) {
      return NextResponse.json(
        { error: translate(locale, "api.bg.invalidProxyOrigin") },
        { status: 400 }
      );
    }

    const { bytes, contentType } = await fetchAllowedBackgroundImage(
      parsedProxyUrl,
      {
        maxBytes: MAX_PROXY_IMAGE_BYTES,
        timeoutMs: UPSTREAM_FETCH_TIMEOUT_MS,
        signal: request.signal,
      }
    );

    const responseBuffer =
      bytes.byteOffset === 0 &&
      bytes.byteLength === bytes.buffer.byteLength &&
      bytes.buffer instanceof ArrayBuffer
        ? bytes.buffer
        : bytes.slice().buffer;

    return new Response(responseBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof InvalidUpstreamContentTypeError) {
      return NextResponse.json(
        { error: translate(locale, "api.bg.invalidUpstreamContentType") },
        { status: 502 }
      );
    }
    if (error instanceof UpstreamImageTooLargeError) {
      return NextResponse.json(
        { error: translate(locale, "api.bg.proxyTooLarge") },
        { status: 413 }
      );
    }
    if (error instanceof UpstreamStatusError) {
      const status = error.status >= 400 ? error.status : 502;
      const retryHeaders: Record<string, string> | undefined =
        status === 503 || status === 429
          ? { "Retry-After": "2", "Cache-Control": "no-store" }
          : { "Cache-Control": "no-store" };
      return NextResponse.json(
        {
          error: translate(locale, "api.bg.upstreamStatus", {
            status: error.status,
          }),
          retryable: status === 503 || status === 429,
        },
        { status, headers: retryHeaders }
      );
    }
    if (error instanceof UpstreamConcurrencyLimitError) {
      return NextResponse.json(
        {
          error: translate(locale, "api.bg.proxyBusy"),
          retryAfterSeconds: 2,
        },
        {
          status: 503,
          headers: {
            "Retry-After": "2",
            "Cache-Control": "no-store",
          },
        }
      );
    }
    console.error("Image proxy error:", error);
    return NextResponse.json(
      { error: translate(locale, "api.bg.proxyFailed") },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  let locale = resolveRequestLocale(request);
  let body: BackgroundsRequest;
  try {
    body = (await readJsonBodyWithLimit(
      request,
      MAX_BACKGROUNDS_REQUEST_BYTES
    )) as BackgroundsRequest;
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: translate(locale, "api.bg.referenceImageTooLarge") },
        { status: 413 }
      );
    }
    if (err instanceof MalformedJsonBodyError) {
      return NextResponse.json(
        { error: translate(locale, "api.bg.invalidReferenceImage") },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: translate(locale, "api.bg.invalidReferenceImage") },
      { status: 400 }
    );
  }

  if (body.locale !== undefined) {
    locale = resolveRequestLocale(request, body.locale);
  }

  const rawQuery =
    typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
  const boundedVibe =
    typeof body.vibe === "string" ? body.vibe.trim().slice(0, 80) : "";
  const vibe = boundedVibe || "Luxury Travel";
  const page =
    typeof body.page === "number" &&
    Number.isSafeInteger(body.page) &&
    body.page >= 1
      ? Math.min(100, body.page)
      : 1;
  const targetCount = body.batchSize === 5 ? 5 : 15;
  const pexelsLimit = targetCount === 5 ? 3 : 8;
  const unsplashLimit = targetCount === 5 ? 2 : 7;

  let validatedRefImage: { data: string; mimeType: string } | null = null;
  const hasRefImageInput =
    body.referenceImageBase64 !== undefined &&
    body.referenceImageBase64 !== null &&
    !(
      typeof body.referenceImageBase64 === "string" &&
      body.referenceImageBase64.trim() === ""
    );

  if (hasRefImageInput) {
    const refValidation = validateBase64ImagePayload(
      body.referenceImageBase64,
      body.mimeType
    );
    if (!refValidation.valid) {
      return NextResponse.json(
        {
          error: translate(
            locale,
            refValidation.reason === "tooLarge"
              ? "api.bg.referenceImageTooLarge"
              : "api.bg.invalidReferenceImage"
          ),
        },
        { status: refValidation.reason === "tooLarge" ? 413 : 400 }
      );
    }
    validatedRefImage = {
      data: refValidation.data,
      mimeType: refValidation.mimeType,
    };
  }

  const isShowcasePreload =
    body.preload === true &&
    !rawQuery &&
    !validatedRefImage &&
    page === 1;

  if (isShowcasePreload) {
    const showcaseItems = buildCuratedBatch(targetCount, vibe, "", 1);
    const resolvedQuery = `${vibe} candid vertical`.trim();
    return NextResponse.json({
      items: showcaseItems,
      count: showcaseItems.length,
      resolvedQuery,
      extractedTags: resolvedQuery
        .split(/\s+/)
        .map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, ""))
        .filter((w) => w.length >= 3)
        .slice(0, 6),
      visionUsed: false,
      isCuratedFallback: true,
      page: 1,
    });
  }

  const quota = await enforceServerGenerationQuota(request, locale);
  if (!quota.allowed) {
    return quota.response;
  }

  const withQuotaCookie = (res: NextResponse) =>
    attachServerTrialCookie(res, quota.trialCookieToken, quota.resetAt);

  try {
    const baseSearchTerms =
      [vibe, rawQuery].filter(Boolean).join(" ").trim() ||
      "aesthetic travel lifestyle candid vertical";

    const cookieHeader = request.headers.get("cookie") ?? undefined;
    // Step A: Vision Reference Matcher via Gemini Vision
    let resolvedQuery = baseSearchTerms;
    let visionUsed = false;
    let visionCapNotice: string | undefined;

    if (validatedRefImage) {
      const visionUserKey = quota.subjectId
        ? `sub:${quota.subjectId}`
        : getRateLimitClientKey(request).key;
      const visionResult = await analyzeReferenceImageWithGemini(
        validatedRefImage.data,
        validatedRefImage.mimeType,
        baseSearchTerms,
        locale,
        quota.role,
        visionUserKey,
        request.signal,
        cookieHeader
      );
      resolvedQuery = visionResult.resolvedQuery;
      visionUsed = visionResult.visionUsed;
      visionCapNotice = visionResult.visionCapNotice;
    }

    // Step B: Parallel Batch Fetch (Pexels 8/3 + Unsplash 7/2)
    const [pexelsResult, unsplashResult] = await Promise.allSettled([
      fetchFromPexels(resolvedQuery, page, pexelsLimit, cookieHeader),
      fetchFromUnsplash(resolvedQuery, page, unsplashLimit, cookieHeader),
    ]);

    const pexelsItems =
      pexelsResult.status === "fulfilled" ? pexelsResult.value : [];
    const unsplashItems =
      unsplashResult.status === "fulfilled" ? unsplashResult.value : [];

    const combined: BackgroundItem[] = [...pexelsItems, ...unsplashItems];

    // Step C: Zero-Key Curated Fallback (top up to targetCount vertical photos)
    const remainingNeeded = Math.max(0, targetCount - combined.length);
    const curatedTopUp =
      remainingNeeded > 0
        ? buildCuratedBatch(
            remainingNeeded,
            vibe,
            visionUsed ? resolvedQuery : rawQuery,
            page
          )
        : [];

    const finalBatch = [...combined, ...curatedTopUp].slice(0, targetCount);

    const extractedTags = resolvedQuery
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, ""))
      .filter((w) => w.length >= 3)
      .slice(0, 6);

    return withQuotaCookie(
      NextResponse.json({
        items: finalBatch,
        count: finalBatch.length,
        resolvedQuery,
        extractedTags,
        visionUsed,
        ...(visionCapNotice ? { visionCapNotice } : {}),
        isCuratedFallback: combined.length === 0,
        page,
        budget: await getPublicQuotaSnapshot(),
      })
    );
  } catch (error) {
    console.error("Error in /api/backgrounds:", error);
    const fallbackItems = buildCuratedBatch(15, "Luxury Travel", "", 1);
    return withQuotaCookie(
      NextResponse.json({
        items: fallbackItems,
        count: fallbackItems.length,
        resolvedQuery: "aesthetic travel lifestyle candid vertical",
        extractedTags: ["aesthetic", "travel", "lifestyle", "candid", "vertical"],
        visionUsed: false,
        isCuratedFallback: true,
        notice: translate(locale, "api.bg.fallbackNotice"),
        page: 1,
        budget: await getPublicQuotaSnapshot(),
      })
    );
  }
}
