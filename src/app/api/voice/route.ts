import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export const maxDuration = 60;

interface VoiceRequestBody {
  text?: string;
  voiceId?: string;
  language?: "es" | "en";
  referenceAudioBase64?: string;
}

function isValidFalKey(val: string | undefined): boolean {
  return Boolean(val && val.trim().length > 5 && val.trim() !== "your_fal_ai_key");
}

/**
 * Generates a valid, playable 24kHz 16-bit PCM WAV data URI with realistic
 * speech-cadence harmonic formants so the audio player, download button,
 * and session history work 100% offline/keyless.
 */
function synthesizePlayableWavDataUri(
  text: string,
  voiceId: string,
  isClone: boolean
): { dataUri: string; durationMs: number } {
  const sampleRate = 24000;
  // Scale duration by word count (between 2.2s and 6.0s)
  const words = text.trim().split(/\s+/).filter(Boolean);
  const durationSec = Math.min(6.0, Math.max(2.2, words.length * 0.24));
  const numSamples = Math.floor(sampleRate * durationSec);

  // Pick base fundamental pitch by voice preset
  let baseFreq = 135;
  if (voiceId.includes("sofia") || voiceId.includes("abella")) {
    baseFreq = 210;
  } else if (voiceId.includes("lucas")) {
    baseFreq = 150;
  } else if (isClone) {
    baseFreq = 175;
  }

  const pcmDataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + pcmDataSize);

  // RIFF Header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmDataSize, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmDataSize, 40);

  const syllableRate = 4.2; // syllables per second
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Smooth fade-in and fade-out
    const globalEnv =
      Math.min(1, t / 0.08) * Math.min(1, (durationSec - t) / 0.15);

    // Speech syllable envelope with micro-pauses
    const syllablePhase = (t * syllableRate) % 1;
    const syllableEnv =
      syllablePhase < 0.78
        ? Math.sin((syllablePhase / 0.78) * Math.PI)
        : 0.05;

    // Intonation curve across phrases
    const pitchMod =
      1 + 0.08 * Math.sin(2 * Math.PI * 1.1 * t) - 0.04 * (t / durationSec);
    const f0 = baseFreq * pitchMod;

    // Warm vocal formants (fundamental + 2nd, 3rd, and 4th harmonics)
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
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  const base64 = buffer.toString("base64");
  return {
    dataUri: `data:audio/wav;base64,${base64}`,
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
  try {
    const body = (await request.json()) as VoiceRequestBody;
    const text = (body.text || "").trim();
    const voiceId = (body.voiceId || "mateo-es").trim();
    const language = body.language === "en" ? "en" : "es";
    const referenceAudioBase64 = body.referenceAudioBase64?.trim();

    if (text.length < 1 || text.length > 1500) {
      return NextResponse.json(
        {
          error:
            "Script text must be between 1 and 1,500 characters in length.",
        },
        { status: 400 }
      );
    }

    const falKey = process.env.FAL_KEY;

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
        console.warn("F5-TTS live call failed, falling back to demo synth:", err);
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
        console.warn("Kokoro-82M live call failed, falling back to demo synth:", err);
      }
    }

    // Mode C: Zero-Key Instant Fallback
    const synth = synthesizePlayableWavDataUri(
      text,
      voiceId,
      Boolean(referenceAudioBase64)
    );
    return NextResponse.json({
      audioUrl: synth.dataUri,
      engine: "Demo Fallback (Add FAL_KEY for Live Neural TTS)",
      language,
      durationMs: synth.durationMs,
      isFallback: true,
    });
  } catch (error) {
    console.error("Error in /api/voice:", error);
    return NextResponse.json(
      { error: "Unable to process voice synthesis request." },
      { status: 500 }
    );
  }
}
