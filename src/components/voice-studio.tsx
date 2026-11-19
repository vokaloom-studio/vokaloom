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
  Pause,
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

const WAVEFORM_BARS = [
  28, 52, 40, 74, 58, 92, 68, 44, 82, 62, 95, 50, 78, 42, 86, 64, 38, 72, 56,
  88, 60, 46, 76, 52, 84, 66, 44, 70, 54, 40, 62, 34,
];

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

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
  const [isDraggingAudio, setIsDraggingAudio] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);

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

  const processAudioFile = (file: File) => {
    const validExtensions = [".mp3", ".wav", ".m4a", ".ogg"];
    const lowerName = file.name.toLowerCase();
    const isAudio =
      file.type.startsWith("audio/") ||
      validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isAudio) {
      toast.error("Please upload an .MP3 or .WAV voice reference file.");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error(
        "Reference voice sample must be under 3 MB. Tip: upload a 10-to-20 second .MP3 or .WAV clip under 3 MB."
      );
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

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processAudioFile(file);
  };

  const handleAudioDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingAudio(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processAudioFile(file);
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
      setPlaybackProgress(0);
      setAudioCurrentTime(0);
      setAudioDuration(newItem.durationMs / 1000);
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
    setPlaybackProgress(0);
    setAudioCurrentTime(0);
    setAudioDuration(item.durationMs / 1000);
    setTimeout(() => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.load();
        audioPlayerRef.current.play().catch(() => {});
      }
    }, 80);
  };

  const handleTogglePlayPause = () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const handleWaveformSeek = (barIndex: number) => {
    const audio = audioPlayerRef.current;
    const ratio = (barIndex + 0.5) / WAVEFORM_BARS.length;
    setPlaybackProgress(ratio);
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = ratio * audio.duration;
      setAudioCurrentTime(audio.currentTime);
      if (audio.paused) {
        audio.play().catch(() => {});
      }
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      window.localStorage.removeItem(VOICE_HISTORY_KEY);
    } catch {}
    toast.info("Cleared voiceover session history.");
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedReadSec =
    wordCount > 0 ? Math.max(1, Math.round(wordCount / 2.5)) : 0;
  const effectiveDurationSec =
    audioDuration > 0
      ? audioDuration
      : activeOutput
        ? activeOutput.durationMs / 1000
        : 0;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12">
      {/* Left Column (7 Cols): Script Editor, Hook Templates, Preset Selector & Zero-Shot Dropzone */}
      <section className="space-y-5 rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5 backdrop-blur-xl lg:col-span-7">
        {/* Workstation Panel Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
              <Mic className="size-4 text-violet-400" />
              Script &amp; Neural Voice Configuration
            </h2>
            <p className="text-xs text-zinc-400">
              Write or paste your Spanish or English script, select a neural
              voice, or expand zero-shot cloning.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300"
          >
            <ShieldCheck className="mr-1 size-3" />
            Apache-2.0 &amp; MIT
          </Badge>
        </div>

        {/* Quick Viral Hook Templates */}
        <div className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Quick Viral Hook Templates
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_SCRIPTS.map((sample) => {
              const isSelected = text === sample.text;
              return (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => handleSampleClick(sample)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all ${
                    isSelected
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-100"
                      : "border-white/[0.07] bg-zinc-950/60 text-zinc-300 hover:border-white/15 hover:bg-zinc-900/80 hover:text-white"
                  }`}
                >
                  {sample.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Script Editor Textarea & Live Counter */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="voice-script-textarea"
              className="text-[11px] font-medium uppercase tracking-wider text-zinc-400"
            >
              Voiceover Script
            </label>
            <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
              {estimatedReadSec > 0 && (
                <span className="text-zinc-500">~{estimatedReadSec}s read</span>
              )}
              <span
                className={
                  text.length > 1400
                    ? "font-semibold text-amber-400"
                    : "text-zinc-400"
                }
              >
                {text.length} / 1500 chars
              </span>
            </div>
          </div>
          <Textarea
            id="voice-script-textarea"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1500))}
            rows={5}
            placeholder="Paste your Spanish or English reel script here..."
            className="min-h-36 resize-y border-white/[0.08] bg-zinc-950/75 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus-visible:border-violet-500/60"
          />
        </div>

        {/* Neural Voice Preset Selector & Zero-Shot Clone Toggle */}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Neural Voice Preset (Kokoro-82M)
            </label>
            <Select
              value={selectedVoiceId}
              onValueChange={(val) => {
                if (val) setSelectedVoiceId(String(val));
              }}
            >
              <SelectTrigger className="h-9 w-full border-white/[0.08] bg-zinc-950/80 text-xs text-white focus-visible:border-violet-500/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b0b10] text-zinc-100 backdrop-blur-xl">
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
            <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Zero-Shot Voice Cloning (MIT F5-TTS)
            </span>
            <button
              type="button"
              onClick={() => setCloneMode((prev) => !prev)}
              aria-expanded={cloneMode}
              className={`flex h-9 w-full items-center justify-between rounded-lg border px-3 text-xs font-medium transition-all ${
                cloneMode
                  ? "border-violet-500/60 bg-violet-500/15 text-violet-100"
                  : "border-white/[0.08] bg-zinc-950/75 text-zinc-400 hover:border-white/15 hover:text-zinc-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-violet-400" />
                Clone Custom Voice
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  cloneMode
                    ? "border-violet-400/60 bg-violet-600 text-white"
                    : "border-white/[0.08] bg-white/[0.04] text-zinc-400"
                }`}
              >
                {cloneMode ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </div>

        {/* Expandable Zero-Shot Reference Audio Dropzone */}
        {cloneMode && (
          <div className="rounded-xl border border-violet-500/25 bg-zinc-950/60 p-3.5 transition-all">
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
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingAudio(true);
                }}
                onDragLeave={() => setIsDraggingAudio(false)}
                onDrop={handleAudioDrop}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed py-4 px-3 text-center transition-colors ${
                  isDraggingAudio
                    ? "border-violet-400 bg-violet-500/10"
                    : "border-white/[0.14] bg-zinc-950/60 hover:border-violet-500/60 hover:bg-zinc-950/90"
                }`}
              >
                <div className="flex size-8 items-center justify-center rounded-md border border-violet-500/25 bg-violet-500/10 text-violet-400">
                  <Upload className="size-4" />
                </div>
                <p className="text-xs font-medium text-zinc-200">
                  Drop or upload 10–30s voice sample (.MP3 / .WAV)
                </p>
                <p className="text-[11px] text-zinc-500">
                  Powered by MIT F5-TTS · 100% commercial-safe zero-shot cloning
                </p>
              </label>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                    <Volume2 className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-white">
                      {referenceAudioName}
                    </p>
                    <p className="text-[10px] text-emerald-400">
                      Ready for zero-shot F5-TTS synthesis
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleClearAudioSample}
                  aria-label="Remove reference audio sample"
                  className="text-zinc-400 hover:bg-white/10 hover:text-white"
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
          className="h-10 w-full bg-violet-600 text-xs font-semibold tracking-tight text-white hover:bg-violet-500 sm:text-sm"
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
      </section>

      {/* Right Column (5 Cols): Master Audio Output & Session History Log */}
      <aside className="space-y-5 lg:col-span-5">
        {/* Panel 1: Master Audio Output */}
        <div className="space-y-4 rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3.5">
            <div className="space-y-0.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
                <Volume2 className="size-4 text-violet-400" />
                Master Audio Output
              </h2>
              <p className="text-xs text-zinc-400">
                Inspect waveform, preview playback, and export broadcast audio.
              </p>
            </div>
            {activeOutput && (
              <Badge
                variant="outline"
                className="shrink-0 border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300"
              >
                {activeOutput.isClone ? "MIT Safe" : "Apache-2.0"}
              </Badge>
            )}
          </div>

          {activeOutput ? (
            <div className="space-y-3.5 rounded-xl border border-white/[0.07] bg-zinc-950/75 p-3.5">
              {/* Output Metadata Header */}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-white">
                  {activeOutput.voiceLabel}
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 border-white/10 bg-white/[0.04] font-mono text-[10px] text-zinc-300"
                >
                  {activeOutput.engine}
                </Badge>
              </div>

              {/* Interactive Waveform Visualizer Mockup */}
              <div className="space-y-2 rounded-lg border border-white/[0.06] bg-zinc-900/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleTogglePlayPause}
                    aria-label={isPlaying ? "Pause voiceover" : "Play voiceover"}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-white transition-colors hover:bg-violet-600 hover:border-violet-500"
                  >
                    {isPlaying ? (
                      <Pause className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </button>

                  <div
                    className="flex h-11 flex-1 items-center justify-between gap-[3px] px-1"
                    role="group"
                    aria-label="Interactive audio waveform scrubber"
                  >
                    {WAVEFORM_BARS.map((heightPct, i) => {
                      const barRatio = (i + 1) / WAVEFORM_BARS.length;
                      const isActive = barRatio <= playbackProgress;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleWaveformSeek(i)}
                          aria-label={`Seek to ${Math.round(barRatio * 100)}%`}
                          style={{ height: `${heightPct}%` }}
                          className={`w-1 flex-1 rounded-full transition-all duration-150 hover:opacity-100 ${
                            isActive
                              ? "bg-gradient-to-t from-violet-600 to-indigo-400 opacity-100"
                              : "bg-white/[0.15] opacity-75 hover:bg-white/[0.35]"
                          } ${isPlaying && isActive ? "animate-pulse" : ""}`}
                        />
                      );
                    })}
                  </div>

                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-400">
                    {formatSeconds(audioCurrentTime)} /{" "}
                    {formatSeconds(effectiveDurationSec)}
                  </span>
                </div>
              </div>

              {/* Native HTML5 Audio Player */}
              <audio
                ref={audioPlayerRef}
                controls
                src={activeOutput.audioUrl}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  setPlaybackProgress(1);
                }}
                onLoadedMetadata={(e) => {
                  const el = e.currentTarget;
                  if (Number.isFinite(el.duration) && el.duration > 0) {
                    setAudioDuration(el.duration);
                  }
                }}
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  setAudioCurrentTime(el.currentTime);
                  if (Number.isFinite(el.duration) && el.duration > 0) {
                    setAudioDuration(el.duration);
                    setPlaybackProgress(el.currentTime / el.duration);
                  }
                }}
                className="h-9 w-full rounded-lg"
              />

              <p className="line-clamp-2 text-xs italic text-zinc-400">
                &ldquo;{activeOutput.text}&rdquo;
              </p>

              <Button
                type="button"
                onClick={() => handleDownloadAudio(activeOutput)}
                className="h-9 w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Download className="mr-1.5 size-3.5" />
                Download Broadcast Audio
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/[0.1] bg-zinc-950/50 px-4 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                <Mic className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-300">
                  No active voiceover output
                </p>
                <p className="text-[11px] text-zinc-500">
                  Configure your script and click{" "}
                  <strong className="font-medium text-zinc-300">
                    Generate Voiceover
                  </strong>{" "}
                  to preview audio.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2: Scrollable Session History Log (Last 10 Clips) */}
        <div className="space-y-3.5 rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-tight text-white">
              <History className="size-3.5 text-violet-400" />
              Session History
              <span className="font-mono text-[11px] font-normal tabular-nums text-zinc-400">
                ({history.length} / 10)
              </span>
            </h3>
            {history.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleClearHistory}
                className="h-6 px-2 text-[11px] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <Trash2 className="mr-1 size-3" />
                Clear
              </Button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="py-2 text-xs text-zinc-500">
              Your last 10 synthesized voiceovers will be logged here for
              instant replay and export.
            </p>
          ) : (
            <div className="no-scrollbar max-h-64 space-y-2 overflow-y-auto pr-0.5">
              {history.map((item) => {
                const isCurrent = activeOutput?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                      isCurrent
                        ? "border-violet-500/40 bg-violet-500/[0.08]"
                        : "border-white/[0.06] bg-zinc-950/60 hover:border-white/15"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium text-zinc-100">
                          {item.voiceLabel}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
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
                        className="border-white/[0.08] bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        <Play className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        onClick={() => handleDownloadAudio(item)}
                        title="Download clip"
                        className="border-white/[0.08] bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        <Download className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
