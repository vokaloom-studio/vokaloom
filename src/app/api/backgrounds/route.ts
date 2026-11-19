import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { resolveRequestLocale, translate } from "@/lib/i18n";

export const maxDuration = 60;

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
  referenceImageBase64?: string;
  mimeType?: string;
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
    photoId: "1515886657613-9f3515b0c78f",
    title: "Candid Editorial Street Fashion Walk",
    photographer: "Dom Hill",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1529139574466-a303027c1d8b",
    title: "Golden Hour Rooftop Lifestyle Portrait",
    photographer: "freestocks",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1534528741775-53994a69daeb",
    title: "Natural Light Studio Candid Aesthetic",
    photographer: "Aiony Haust",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1483985988355-763728e1935b",
    title: "Milan Boutique Shopping Afternoon POV",
    photographer: "freestocks",
    vibeCategory: "Candid Lifestyle",
  },
  {
    photoId: "1524504388940-b1c1722653e1",
    title: "Sunlit Linen Interior Lifestyle Moment",
    photographer: "averie woodard",
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

function isValidApiKey(val: string | undefined, placeholder: string): boolean {
  return Boolean(val && val.trim().length > 5 && val.trim() !== placeholder);
}

async function analyzeReferenceImageWithGemini(
  base64Data: string,
  mimeType: string,
  fallbackQuery: string
): Promise<{ resolvedQuery: string; visionUsed: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isValidApiKey(apiKey, "your_google_ai_studio_key")) {
    return {
      resolvedQuery: `${fallbackQuery} candid vertical sunlight`,
      visionUsed: false,
    };
  }

  try {
    const cleanBase64 = base64Data.includes(",")
      ? base64Data.split(",")[1]
      : base64Data;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
    });

    const extracted = response.text
      ?.trim()
      .replace(/["'.]/g, "")
      .replace(/\s+/g, " ");

    if (extracted && extracted.length >= 4) {
      return { resolvedQuery: extracted, visionUsed: true };
    }
  } catch (err) {
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
  page: number
): Promise<BackgroundItem[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!isValidApiKey(apiKey, "your_pexels_api_key")) {
    return [];
  }

  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "8");
    url.searchParams.set("page", String(page));
    url.searchParams.set("orientation", "portrait");

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey!.trim() },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { photos?: PexelsPhoto[] };
    return (data.photos || []).slice(0, 8).map((p, idx) => ({
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
  page: number
): Promise<BackgroundItem[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!isValidApiKey(accessKey, "your_unsplash_access_key")) {
    return [];
  }

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "7");
    url.searchParams.set("page", String(page));
    url.searchParams.set("orientation", "portrait");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey!.trim()}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { results?: UnsplashPhoto[] };
    return (data.results || []).slice(0, 7).map((u, idx) => ({
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
  try {
    const proxyUrl = reqUrl.searchParams.get("proxyUrl");
    if (
      !proxyUrl ||
      (!proxyUrl.startsWith("https://images.pexels.com/") &&
        !proxyUrl.startsWith("https://images.unsplash.com/"))
    ) {
      return NextResponse.json(
        { error: translate(locale, "api.bg.invalidProxyOrigin") },
        { status: 400 }
      );
    }

    const upstream = await fetch(proxyUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: translate(locale, "api.bg.upstreamStatus", {
            status: upstream.status,
          }),
        },
        { status: upstream.status }
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return NextResponse.json(
      { error: translate(locale, "api.bg.proxyFailed") },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  let locale = resolveRequestLocale(request);
  try {
    const body = (await request.json()) as BackgroundsRequest;
    if (body.locale !== undefined) {
      locale = resolveRequestLocale(request, body.locale);
    }
    const rawQuery = (body.query || "").trim();
    const vibe = (body.vibe || "Luxury Travel").trim();
    const page = typeof body.page === "number" && body.page > 0 ? body.page : 1;

    const baseSearchTerms =
      [vibe, rawQuery].filter(Boolean).join(" ").trim() ||
      "aesthetic travel lifestyle candid vertical";

    // Step A: Vision Reference Matcher via Gemini 2.5 Flash
    let resolvedQuery = baseSearchTerms;
    let visionUsed = false;

    if (body.referenceImageBase64) {
      const visionResult = await analyzeReferenceImageWithGemini(
        body.referenceImageBase64,
        body.mimeType || "image/jpeg",
        baseSearchTerms
      );
      resolvedQuery = visionResult.resolvedQuery;
      visionUsed = visionResult.visionUsed;
    }

    // Step B: Parallel 15-Image Fetch (Pexels 8 + Unsplash 7)
    const [pexelsResult, unsplashResult] = await Promise.allSettled([
      fetchFromPexels(resolvedQuery, page),
      fetchFromUnsplash(resolvedQuery, page),
    ]);

    const pexelsItems =
      pexelsResult.status === "fulfilled" ? pexelsResult.value : [];
    const unsplashItems =
      unsplashResult.status === "fulfilled" ? unsplashResult.value : [];

    const combined: BackgroundItem[] = [...pexelsItems, ...unsplashItems];

    // Step C: Zero-Key Curated Fallback (top up to exactly 15 vertical photos)
    const remainingNeeded = Math.max(0, 15 - combined.length);
    const curatedTopUp =
      remainingNeeded > 0
        ? buildCuratedBatch(
            remainingNeeded,
            vibe,
            visionUsed ? resolvedQuery : rawQuery,
            page
          )
        : [];

    const final15 = [...combined, ...curatedTopUp].slice(0, 15);

    const extractedTags = resolvedQuery
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9-]/g, ""))
      .filter((w) => w.length >= 3)
      .slice(0, 6);

    return NextResponse.json({
      items: final15,
      count: final15.length,
      resolvedQuery,
      extractedTags,
      visionUsed,
      isCuratedFallback: combined.length === 0,
      page,
    });
  } catch (error) {
    console.error("Error in /api/backgrounds:", error);
    const fallbackItems = buildCuratedBatch(15, "Luxury Travel", "", 1);
    return NextResponse.json({
      items: fallbackItems,
      count: fallbackItems.length,
      resolvedQuery: "aesthetic travel lifestyle candid vertical",
      extractedTags: ["aesthetic", "travel", "lifestyle", "candid", "vertical"],
      visionUsed: false,
      isCuratedFallback: true,
      notice: translate(locale, "api.bg.fallbackNotice"),
      page: 1,
    });
  }
}
