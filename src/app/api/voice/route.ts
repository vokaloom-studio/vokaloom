import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { GoogleGenAI } from "@google/genai";
import { resolveRequestLocale, translate } from "@/lib/i18n";

export const maxDuration = 60;

interface VoiceRequestBody {
  text?: string;
  voiceId?: string;
  language?: "es" | "en";
  referenceAudioBase64?: string;
  locale?: unknown;
}

function isValidFalKey(val: string | undefined): boolean {
  return Boolean(val && val.trim().length > 5 && val.trim() !== "your_fal_ai_key");
}

function isValidGeminiKey(val: string | undefined): boolean {
  return Boolean(
    val && val.trim().length > 5 && val.trim() !== "your_google_ai_studio_key"
  );
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
 * and session history work 100% offline/keyless when neither FAL_KEY nor GEMINI_API_KEY is configured.
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

function extractFalAudioUrl(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const obj = result as Record<string, unknown>;
  const data =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : obj;

  if (typeof data.audio_url === "string") return data.audio_url;
  if (
    data.audio_url &&
    typeof data.audio_url === "object" &&
    typeof (data.audio_url as { url?: unknown }).url === "string"
  ) {
    return (data.audio_url as { url: string }).url;
  }
  if (
    data.audio &&
    typeof data.audio === "object" &&
    typeof (data.audio as { url?: unknown }).url === "string"
  ) {
    return (data.audio as { url: string }).url;
  }
  if (typeof data.audio === "string") return data.audio;
  return null;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let locale = resolveRequestLocale(request);
  try {
    const body = (await request.json()) as VoiceRequestBody;
    if (body.locale !== undefined) {
      locale = resolveRequestLocale(request, body.locale);
    }
    const text = (body.text || "").trim();
    const voiceId = (body.voiceId || "mateo-es").trim();
    const language = body.language === "en" ? "en" : "es";
    const referenceAudioBase64 = body.referenceAudioBase64?.trim();

    if (text.length < 1 || text.length > 1500) {
      return NextResponse.json(
        {
          error: translate(locale, "api.voice.invalidLength"),
        },
        { status: 400 }
      );
    }

    const falKey = process.env.FAL_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Mode A: Zero-Shot Voice Cloning via MIT F5-TTS
    if (referenceAudioBase64 && isValidFalKey(falKey)) {
      try {
        fal.config({ credentials: falKey!.trim() });
        const result = await fal.subscribe("fal-ai/f5-tts", {
          input: {
            gen_text: text,
            ref_audio_url: referenceAudioBase64,
            model_type: "F5-TTS",
            remove_silence: true,
          },
        });
        const audioUrl = extractFalAudioUrl(result);
        if (audioUrl) {
          return NextResponse.json({
            audioUrl,
            engine: "F5-TTS (MIT Clone)",
            language,
            durationMs: Date.now() - startTime,
            isFallback: false,
          });
        }
      } catch (err) {
        console.warn("F5-TTS live call failed, trying next engine:", err);
      }
    }

    // Mode B: Standard Realistic TTS via Apache-2.0 Kokoro-82M
    if (!referenceAudioBase64 && isValidFalKey(falKey)) {
      try {
        fal.config({ credentials: falKey!.trim() });
        const result =
          language === "es"
            ? await fal.subscribe("fal-ai/kokoro/spanish", {
                input: {
                  prompt: text,
                  voice:
                    voiceId === "sofia-es"
                      ? "ef_dora"
                      : voiceId === "lucas-es"
                        ? "em_santa"
                        : "em_alex",
                  speed: 1.0,
                },
              })
            : await fal.subscribe("fal-ai/kokoro/american-english", {
                input: {
                  prompt: text,
                  voice: voiceId === "adam-en" ? "am_adam" : "af_bella",
                  speed: 1.0,
                },
              });
        const audioUrl = extractFalAudioUrl(result);
        if (audioUrl) {
          return NextResponse.json({
            audioUrl,
            engine: "Kokoro-82M (Apache-2.0)",
            language,
            durationMs: Date.now() - startTime,
            isFallback: false,
          });
        }
      } catch (err) {
        console.warn("Kokoro-82M live call failed, trying Gemini TTS:", err);
      }
    }

    // Mode B2: Gemini 2.5 Flash Native Neural TTS via GEMINI_API_KEY
    if (isValidGeminiKey(geminiKey)) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey!.trim() });
        const voiceName =
          voiceId.includes("sofia") || voiceId.includes("abella")
            ? "Aoede"
            : voiceId.includes("lucas")
              ? "Puck"
              : "Charon";

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Read this voiceover script naturally and expressively in ${
                    language === "es" ? "Spanish" : "English"
                  }: ${text}`,
                },
              ],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        });

        const base64Pcm =
          response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Pcm) {
          const pcmBuffer = Buffer.from(base64Pcm, "base64");
          const wavBuffer = wrapPcmInWavHeader(pcmBuffer, 24000, 1, 16);
          const durationMs = Math.max(
            500,
            Math.round((pcmBuffer.length / (24000 * 2)) * 1000)
          );
          return NextResponse.json({
            audioUrl: "data:audio/wav;base64," + wavBuffer.toString("base64"),
            engine: "Gemini 2.5 Neural TTS",
            language,
            durationMs,
            isFallback: false,
          });
        }
      } catch (err) {
        console.warn("Gemini 2.5 Native TTS call failed, falling back to demo synth:", err);
      }
    }

    // Mode C: Zero-Key Instant Offline Fallback
    const synth = synthesizePlayableWavDataUri(
      text,
      voiceId,
      Boolean(referenceAudioBase64)
    );
    return NextResponse.json({
      audioUrl: synth.dataUri,
      engine: translate(locale, "api.voice.demoFallbackEngine"),
      language,
      durationMs: synth.durationMs,
      isFallback: true,
    });
  } catch (error) {
    console.error("Error in /api/voice:", error);
    return NextResponse.json(
      { error: translate(locale, "api.voice.processError") },
      { status: 500 }
    );
  }
}
