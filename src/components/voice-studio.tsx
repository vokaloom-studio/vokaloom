"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  Wand2,
  Download,
  Upload,
  X,
  History,
  Play,
  Volume2,
  ShieldCheck,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { consumeCredit } from "@/lib/quota";

export interface VoiceStudioProps {
  onRequirePaywall: () => void;
}

interface VoicePreset {
  id: string;
  label: string;
  language: "es" | "en";
  badge: string;
}

const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "mateo-es",
    label: "Mateo — Narrador LatAm",
    language: "es",
    badge: "ES · LatAm",
  },
  {
    id: "sofia-es",
    label: "Sofía — Lifestyle & Viajes",
    language: "es",
    badge: "ES · Natural",
  },
  {
    id: "lucas-es",
    label: "Lucas — Dinámico Comercial",
    language: "es",
    badge: "ES · Reels",
  },
  {
    id: "abella-en",
    label: "abella — English Creator",
    language: "en",
    badge: "EN · Creator",
  },
  {
    id: "adam-en",
    label: "Adam — Documentary & Tech",
    language: "en",
    badge: "EN · Deep",
  },
];

const SAMPLE_SCRIPTS = [
  {
    label: "ES · Hook Lifestyle & Viajes",
    voiceId: "sofia-es",
    text: "Tres lugares secretos en la costa que parecen sacados de una película y que puedes visitar este fin de semana con bajo presupuesto. Guarda este reel antes de que se vuelva viral.",
  },
  {
    label: "ES · Hook Negocios & Marca",
    voiceId: "mateo-es",
    text: "Si todavía estás editando tus videos uno por uno manualmente, estás perdiendo diez horas cada semana. Así es como automatizamos nuestros fondos estéticos y locuciones en segundos.",
  },
  {
    label: "EN · Creator Reel Hook",
    voiceId: "abella-en",
    text: "Stop scrolling if you create aesthetic social media content. Here is the exact workflow we use to batch fifteen vertical backgrounds and studio-grade voiceovers in under sixty seconds.",
  },
];

interface VoiceHistoryItem {
  id: string;
  text: string;
  voiceLabel: string;
  engine: string;
  audioUrl: string;
  durationMs: number;
  createdAt: string;
  isClone: boolean;
}

const VOICE_HISTORY_KEY = "vokaloom_voice_history_v1";

function createVoiceHistoryEntry(params: {
  text: string;
  voiceLabel: string;
  engine: string;
  audioUrl: string;
  durationMs: number;
  isClone: boolean;
}): VoiceHistoryItem {
  const now = new Date();
  return {
    id: `voice-${now.getTime()}`,
    text: params.text,
    voiceLabel: params.voiceLabel,
    engine: params.engine,
    audioUrl: params.audioUrl,
    durationMs: params.durationMs,
    createdAt: now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    isClone: params.isClone,
  };
}

export function VoiceStudio({ onRequirePaywall }: VoiceStudioProps) {
  const [text, setText] = useState<string>(SAMPLE_SCRIPTS[0].text);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("sofia-es");
  const [cloneMode, setCloneMode] = useState<boolean>(false);
  const [referenceAudioBase64, setReferenceAudioBase64] = useState<
    string | null
  >(null);
  const [referenceAudioName, setReferenceAudioName] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const [activeOutput, setActiveOutput] = useState<VoiceHistoryItem | null>(
    null
  );
  const [history, setHistory] = useState<VoiceHistoryItem[]>([]);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(VOICE_HISTORY_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as VoiceHistoryItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHistory(parsed.slice(0, 10));
            setActiveOutput(parsed[0]);
          }
        }
      } catch {
        // Ignore storage read issues
      }
    });
  }, []);

  const saveHistory = (items: VoiceHistoryItem[]) => {
    const trimmed = items.slice(0, 10);
    setHistory(trimmed);
    try {
      window.localStorage.setItem(VOICE_HISTORY_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore quota exceeded if base64 audio clips are large
    }
  };

  const selectedPreset =
    VOICE_PRESETS.find((v) => v.id === selectedVoiceId) || VOICE_PRESETS[0];

  const handleSampleClick = (sample: (typeof SAMPLE_SCRIPTS)[number]) => {
    setText(sample.text);
    setSelectedVoiceId(sample.voiceId);
    toast.info(`Loaded sample script: ${sample.label}`);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = [".mp3", ".wav", ".m4a", ".ogg"];
    const lowerName = file.name.toLowerCase();
    const isAudio =
      file.type.startsWith("audio/") ||
      validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isAudio) {
      toast.error("Please upload an .MP3 or .WAV voice reference file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Reference voice sample must be under 10 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReferenceAudioBase64(String(reader.result || ""));
      setReferenceAudioName(file.name);
      toast.success(
        `Loaded voice sample "${file.name}" for MIT F5-TTS zero-shot cloning.`
      );
    };
    reader.readAsDataURL(file);
  };

  const handleClearAudioSample = () => {
    setReferenceAudioBase64(null);
    setReferenceAudioName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSynthesize = async () => {
    const cleanText = text.trim();
    if (!cleanText) {
      toast.error("Please enter a voiceover script first.");
      return;
    }
    if (cleanText.length > 1500) {
      toast.error("Script cannot exceed 1,500 characters.");
      return;
    }
    if (cloneMode && !referenceAudioBase64) {
      toast.warning(
        "Please upload a 10–30s reference audio clip for Zero-Shot Voice Cloning, or disable Clone Mode."
      );
      return;
    }

    const quotaCheck = consumeCredit();
    if (!quotaCheck.allowed) {
      toast.warning(
        "Free trial credits exhausted (0/3). Unlock Vokaloom Pro or enter your Operator Key!"
      );
      onRequirePaywall();
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          voiceId: selectedPreset.id,
          language: selectedPreset.language,
          referenceAudioBase64:
            cloneMode && referenceAudioBase64
              ? referenceAudioBase64
              : undefined,
        }),
      });

      const data = (await response.json()) as {
        audioUrl?: string;
        engine?: string;
        durationMs?: number;
        error?: string;
      };

      if (!response.ok || !data.audioUrl) {
        throw new Error(data.error || "Voice synthesis failed");
      }

      const newItem = createVoiceHistoryEntry({
        text: cleanText,
        voiceLabel:
          cloneMode && referenceAudioName
            ? `Zero-Shot Clone (${referenceAudioName})`
            : selectedPreset.label,
        engine: data.engine || "Kokoro-82M (Apache-2.0)",
        audioUrl: data.audioUrl,
        durationMs: data.durationMs || 3200,
        isClone: Boolean(cloneMode && referenceAudioBase64),
      });

      setActiveOutput(newItem);
      saveHistory([newItem, ...history]);
      toast.success(`Voiceover ready via ${newItem.engine}!`);

      setTimeout(() => {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.load();
          audioPlayerRef.current.play().catch(() => {
            // Autoplay blocked by browser policy; user can click play
          });
        }
      }, 100);
    } catch (error) {
      console.error("TTS synthesis error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not synthesize voiceover."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAudio = (item: VoiceHistoryItem) => {
    const link = document.createElement("a");
    link.href = item.audioUrl;
    const ext = item.audioUrl.startsWith("data:audio/wav") ? "wav" : "mp3";
    link.download = `vokaloom-voiceover-${item.id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Downloaded voiceover audio file!");
  };

  const handleReplayItem = (item: VoiceHistoryItem) => {
    setActiveOutput(item);
    setTimeout(() => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.load();
        audioPlayerRef.current.play().catch(() => {});
      }
    }, 80);
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      window.localStorage.removeItem(VOICE_HISTORY_KEY);
    } catch {}
    toast.info("Cleared voiceover session history.");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left 7 Columns: Script Editor, Voice Selector & Zero-Shot Cloning Dropzone */}
      <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100 lg:col-span-7">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <Mic className="size-4 text-violet-400" />
              1. Script &amp; Neural Voice Configuration
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300"
              >
                <ShieldCheck className="mr-1 size-3" />
                Apache-2.0 &amp; MIT Commercial Safe
              </Badge>
            </div>
          </div>
          <CardDescription className="text-xs text-zinc-400">
            Write or paste your social media script (Spanish or English), pick a
            neural voice preset, or toggle Zero-Shot Voice Cloning.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Quick Sample Hook Buttons */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-300">
              Quick Viral Hook Templates
            </span>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_SCRIPTS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => handleSampleClick(sample)}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-violet-500/50 hover:bg-zinc-900 hover:text-white"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* Script Editor Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="voice-script-textarea"
                className="text-xs font-medium text-zinc-300"
              >
                Voiceover Script
              </label>
              <span
                className={`font-mono text-xs ${
                  text.length > 1400
                    ? "font-semibold text-amber-400"
                    : "text-zinc-400"
                }`}
              >
                {text.length} / 1500 chars
              </span>
            </div>
            <Textarea
              id="voice-script-textarea"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1500))}
              rows={5}
              placeholder="Paste your Spanish or English reel script here..."
              className="resize-y border-zinc-800 bg-zinc-950/90 text-sm leading-relaxed text-white placeholder:text-zinc-500"
            />
          </div>

          {/* Voice Preset Selector & Zero-Shot Clone Toggle */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Neural Voice Preset (Kokoro-82M)
              </label>
              <Select
                value={selectedVoiceId}
                onValueChange={(val) => {
                  if (val) setSelectedVoiceId(String(val));
                }}
              >
                <SelectTrigger className="h-9 w-full border-zinc-800 bg-zinc-950 text-xs text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                  {VOICE_PRESETS.map((voice) => (
                    <SelectItem
                      key={voice.id}
                      value={voice.id}
                      className="text-xs"
                    >
                      {voice.label} ({voice.badge})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-300">
                Zero-Shot Voice Cloning (MIT F5-TTS)
              </span>
              <button
                type="button"
                onClick={() => setCloneMode((prev) => !prev)}
                className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-xs font-medium transition-all ${
                  cloneMode
                    ? "border-violet-500 bg-violet-600/20 text-violet-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-violet-400" />
                  Clone Custom Voice (Zero-Shot)
                </span>
                <Badge
                  variant="outline"
                  className={
                    cloneMode
                      ? "border-violet-400 bg-violet-600 text-[10px] text-white"
                      : "border-zinc-700 bg-zinc-900 text-[10px] text-zinc-400"
                  }
                >
                  {cloneMode ? "ON" : "OFF"}
                </Badge>
              </button>
            </div>
          </div>

          {/* Optional Zero-Shot Reference Audio Upload Dropzone */}
          {cloneMode && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-950/15 p-3.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
                onChange={handleAudioUpload}
                className="hidden"
                id="reference-voice-upload"
              />

              {!referenceAudioBase64 ? (
                <label
                  htmlFor="reference-voice-upload"
                  className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-violet-500/40 bg-zinc-950/70 py-4 text-center transition-colors hover:border-violet-400 hover:bg-zinc-950"
                >
                  <Upload className="size-5 text-violet-400" />
                  <p className="text-xs font-semibold text-zinc-200">
                    Upload 10–30s Reference Voice Sample (.MP3 / .WAV)
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Powered by F5-TTS (MIT License — 100% Commercial Safe
                    Zero-Shot Cloning)
                  </p>
                </label>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-500/40 bg-zinc-950 px-3 py-2">
                  <div className="flex items-center gap-2 truncate">
                    <Volume2 className="size-4 shrink-0 text-violet-400" />
                    <div className="truncate">
                      <p className="truncate text-xs font-semibold text-white">
                        {referenceAudioName}
                      </p>
                      <p className="text-[10px] text-emerald-400">
                        Ready for zero-shot F5-TTS voice cloning
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleClearAudioSample}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Primary Synthesize Button */}
          <Button
            type="button"
            onClick={handleSynthesize}
            disabled={isGenerating}
            className="h-10 w-full bg-violet-600 text-sm font-semibold text-white hover:bg-violet-500"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Synthesizing Neural Voiceover...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 size-4" />
                {cloneMode
                  ? "Generate Zero-Shot Cloned Voiceover (F5-TTS)"
                  : `Generate Voiceover (${selectedPreset.label.split(" — ")[0]})`}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Right 5 Columns: Output Audio Player Card & Session History (Last 10 Clips) */}
      <div className="space-y-6 lg:col-span-5">
        {/* Output Player Card */}
        <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                <Volume2 className="size-4 text-violet-400" />
                2. Master Audio Output
              </CardTitle>
              {activeOutput && (
                <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-300">
                  {activeOutput.isClone
                    ? "MIT Commercial Safe"
                    : "Apache-2.0 Commercial Safe"}
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-zinc-400">
              Preview your synthesized voiceover and download the broadcast-ready
              audio file.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {activeOutput ? (
              <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/90 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-white">
                    {activeOutput.voiceLabel}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300"
                  >
                    {activeOutput.engine}
                  </Badge>
                </div>

                {/* Decorative Studio Waveform Bars */}
                <div className="flex h-10 items-center justify-between gap-1 rounded-lg bg-zinc-900/90 px-3 py-2">
                  {[
                    35, 65, 45, 85, 55, 95, 70, 40, 80, 60, 90, 50, 75, 45, 85,
                    60, 40, 70, 55, 35, 65, 50, 75, 45,
                  ].map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className="w-1 rounded-full bg-gradient-to-t from-violet-600 to-indigo-400 opacity-85"
                    />
                  ))}
                </div>

                {/* Native HTML5 Audio Player */}
                <audio
                  ref={audioPlayerRef}
                  controls
                  src={activeOutput.audioUrl}
                  className="h-9 w-full rounded-lg"
                />

                <p className="line-clamp-2 text-xs italic text-zinc-400">
                  &ldquo;{activeOutput.text}&rdquo;
                </p>

                <Button
                  type="button"
                  onClick={() => handleDownloadAudio(activeOutput)}
                  className="w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Download className="mr-1.5 size-3.5" />
                  Download Audio
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 py-8 text-center">
                <Mic className="size-6 text-zinc-600" />
                <p className="text-xs text-zinc-400">
                  No voiceover generated yet. Click{" "}
                  <strong className="text-zinc-200">Generate Voiceover</strong>{" "}
                  to synthesize audio.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session History Card (Last 10 Clips) */}
        <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white">
                <History className="size-4 text-violet-400" />
                Session History ({history.length} / 10)
              </CardTitle>
              {history.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleClearHistory}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  <Trash2 className="mr-1 size-3" />
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Your last 10 generated voiceovers will appear here for instant
                replay and download.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-2.5 text-xs transition-colors hover:border-zinc-700"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-zinc-200">
                          {item.voiceLabel}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          · {item.createdAt}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-zinc-400">
                        {item.text}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        onClick={() => handleReplayItem(item)}
                        title="Replay clip"
                        className="border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                      >
                        <Play className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        onClick={() => handleDownloadAudio(item)}
                        title="Download clip"
                        className="border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                      >
                        <Download className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
