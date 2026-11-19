import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { resolveRequestLocale, translate } from "@/lib/i18n";
import { resolveApiKey } from "@/lib/server-secrets";

export const maxDuration = 60;

const UPSTREAM_FETCH_TIMEOUT_MS = 10_000;
const MAX_BACKGROUND_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

interface ModelSwapRequestBody {
  modelImageBase64?: string;
  backgroundUrl?: string;
  sceneTitle?: string;
  locale?: unknown;
}

const COMPOSITE_PROMPT =
  "Place the exact person/model from the first image naturally into the real environment of the second vertical 9:16 background image. Match lighting, shadows, color grading, and candid smartphone photography realism. Keep 9:16 vertical framing.";

function parseBase64DataUrl(
  input: string,
  defaultMime = "image/jpeg"
): { data: string; mimeType: string } {
  const trimmed = input.trim();
  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx > 0) {
      const header = trimmed.slice(5, commaIdx);
      const mime = header.split(";")[0]?.trim() || defaultMime;
      return { data: trimmed.slice(commaIdx + 1), mimeType: mime };
    }
  }
  return { data: trimmed, mimeType: defaultMime };
}

function isAllowedBackgroundUrl(url: string): boolean {
  return (
    url.startsWith("https://images.pexels.com/") ||
    url.startsWith("https://images.unsplash.com/")
  );
}

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
    const body = (await request.json()) as ModelSwapRequestBody;
    if (body.locale !== undefined) {
      locale = resolveRequestLocale(request, body.locale);
    }

    const modelImageRaw = (body.modelImageBase64 || "").trim();
    const backgroundUrl = (body.backgroundUrl || "").trim();

    if (!modelImageRaw || !backgroundUrl) {
      return NextResponse.json(
        { error: translate(locale, "api.modelSwap.missingInputs") },
        { status: 400 }
      );
    }

    if (!isAllowedBackgroundUrl(backgroundUrl)) {
      return NextResponse.json(
        { error: translate(locale, "api.modelSwap.invalidBackgroundOrigin") },
        { status: 400 }
      );
    }

    const geminiKey = await resolveApiKey("GEMINI_API_KEY");
    if (!geminiKey) {
      return NextResponse.json({
        resultImageUrl: null,
        fallbackComposite: true,
        engine: translate(locale, "api.modelSwap.fallbackEngine"),
        isFallback: true,
      });
    }

    const bgResponse = await fetch(backgroundUrl, {
      signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
    });
    if (!bgResponse.ok) {
      return NextResponse.json({
        resultImageUrl: null,
        fallbackComposite: true,
        engine: translate(locale, "api.modelSwap.fallbackEngine"),
        isFallback: true,
      });
    }

    const declaredLength = bgResponse.headers.get("content-length");
    if (declaredLength && Number(declaredLength) > MAX_BACKGROUND_IMAGE_BYTES) {
      await bgResponse.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: translate(locale, "api.bg.proxyTooLarge") },
        { status: 413 }
      );
    }

    const bgBuffer = Buffer.from(await bgResponse.arrayBuffer());
    if (bgBuffer.byteLength > MAX_BACKGROUND_IMAGE_BYTES) {
      return NextResponse.json(
        { error: translate(locale, "api.bg.proxyTooLarge") },
        { status: 413 }
      );
    }
    const bgBase64 = bgBuffer.toString("base64");
    const bgMimeType =
      bgResponse.headers.get("Content-Type")?.split(";")[0]?.trim() ||
      "image/jpeg";
    const modelPart = parseBase64DataUrl(modelImageRaw);

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const promptWithScene = body.sceneTitle
      ? `${COMPOSITE_PROMPT} Scene context: ${body.sceneTitle}.`
      : COMPOSITE_PROMPT;

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

    // Primary: gemini-2.5-flash-image
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents,
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio: "9:16",
          },
        },
      });

      const generated = extractImagePart(response);
      if (generated) {
        return NextResponse.json({
          resultImageUrl: `data:${generated.mimeType};base64,${generated.data}`,
          engine: translate(locale, "api.modelSwap.geminiEngine"),
          isFallback: false,
        });
      }
    } catch (primaryErr) {
      console.warn(
        "gemini-2.5-flash-image failed, trying fallback model:",
        primaryErr
      );
    }

    // Fallback: gemini-2.0-flash-exp-image-generation
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp-image-generation",
        contents,
        config: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      });

      const generated = extractImagePart(fallbackResponse);
      if (generated) {
        return NextResponse.json({
          resultImageUrl: `data:${generated.mimeType};base64,${generated.data}`,
          engine: translate(locale, "api.modelSwap.geminiEngine"),
          isFallback: false,
        });
      }
    } catch (fallbackErr) {
      console.warn("gemini-2.0-flash-exp-image-generation failed:", fallbackErr);
    }

    return NextResponse.json({
      resultImageUrl: null,
      fallbackComposite: true,
      engine: translate(locale, "api.modelSwap.fallbackEngine"),
      isFallback: true,
    });
  } catch (error) {
    console.error("Error in /api/model-swap:", error);
    return NextResponse.json(
      { error: translate(locale, "api.modelSwap.processError") },
      { status: 500 }
    );
  }
}
