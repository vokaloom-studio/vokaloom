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
import { useLocale } from "@/components/locale-provider";
import { LOCALE_HEADER, type TranslationKey } from "@/lib/i18n";
import { consumeCredit } from "@/lib/quota";

export interface VoiceStudioProps {
  onRequirePaywall: () => void;
}

interface VoicePreset {
  id: string;
  shortName: string;
  labelKey: TranslationKey;
  badgeKey: TranslationKey;
  language: "es" | "en";
}

const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "mateo-es",
    shortName: "Mateo",
    labelKey: "voice.preset.mateo.label",
    badgeKey: "voice.preset.mateo.badge",
    language: "es",
  },
  {
    id: "sofia-es",
    shortName: "Sofía",
    labelKey: "voice.preset.sofia.label",
    badgeKey: "voice.preset.sofia.badge",
    language: "es",
  },
  {
    id: "lucas-es",
    shortName: "Lucas",
    labelKey: "voice.preset.lucas.label",
    badgeKey: "voice.preset.lucas.badge",
    language: "es",
  },
  {
    id: "abella-en",
    shortName: "Abella",
    labelKey: "voice.preset.abella.label",
    badgeKey: "voice.preset.abella.badge",
    language: "en",
  },
  {
    id: "adam-en",
    shortName: "Adam",
    labelKey: "voice.preset.adam.label",
    badgeKey: "voice.preset.adam.badge",
    language: "en",
  },
];

const SAMPLE_SCRIPTS: ReadonlyArray<{
  labelKey: TranslationKey;
  voiceId: string;
  text: string;
}> = [
  {
    labelKey: "voice.sample.sofiaEs",
    voiceId: "sofia-es",
    text: "Tres lugares secretos en la costa que parecen sacados de una película y que puedes visitar este fin de semana con bajo presupuesto. Guarda este reel antes de que se vuelva viral.",
  },
  {
    labelKey: "voice.sample.mateoEs",
    voiceId: "mateo-es",
    text: "Si todavía estás editando tus videos uno por uno manualmente, estás perdiendo diez horas cada semana. Así es como automatizamos nuestros fondos estéticos y locuciones en segundos.",
  },
  {
    labelKey: "voice.sample.abellaEn",
    voiceId: "abella-en",
    text: "Stop scrolling if you create aesthetic social media content. Here is the exact workflow we use to batch fifteen vertical backgrounds and studio-grade voiceovers in under sixty seconds.",
  },
];

interface VoiceHistoryItem {
  id: string;
  text: string;
  voiceLabel: string;
  voiceId?: string;
  sampleName?: string;
  engine: string;
  isFallback?: boolean;
  audioUrl: string;
  durationMs: number;
  createdAt: string;
  createdAtMs?: number;
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
  voiceId?: string;
  sampleName?: string;
  engine: string;
  isFallback?: boolean;
  audioUrl: string;
  durationMs: number;
  isClone: boolean;
  locale: "en" | "es";
}): VoiceHistoryItem {
  const now = new Date();
  return {
    id: `voice-${now.getTime()}`,
    text: params.text,
    voiceLabel: params.voiceLabel,
    voiceId: params.voiceId,
    sampleName: params.sampleName,
    engine: params.engine,
    isFallback: params.isFallback,
    audioUrl: params.audioUrl,
    durationMs: params.durationMs,
    createdAt: now.toLocaleTimeString(
      params.locale === "es" ? "es-ES" : "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }
    ),
    createdAtMs: now.getTime(),
    isClone: params.isClone,
  };
}

export function VoiceStudio({ onRequirePaywall }: VoiceStudioProps) {
  const { locale, t } = useLocale();
  const [text, setText] = useState<string>(SAMPLE_SCRIPTS[0].text);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("sofia-es");
  const [cloneMode, setCloneMode] = useState<boolean>(true);
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

  const getDisplayVoiceLabel = (item: VoiceHistoryItem): string => {
    if (item.isClone && item.sampleName) {
      return t("voice.cloneVoiceLabel", { name: item.sampleName });
    }
    if (item.voiceId) {
      const preset = VOICE_PRESETS.find((v) => v.id === item.voiceId);
      if (preset) {
        return t(preset.labelKey);
      }
    }
    return item.voiceLabel;
  };

  const getDisplayEngine = (item: VoiceHistoryItem): string => {
    if (item.isFallback) {
      return t("api.voice.demoFallbackEngine");
    }
    return item.engine;
  };

  const getDisplayTimestamp = (item: VoiceHistoryItem): string => {
    if (typeof item.createdAtMs === "number") {
      return new Date(item.createdAtMs).toLocaleTimeString(
        locale === "es" ? "es-ES" : "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }
      );
    }
    return item.createdAt;
  };

  const handleSampleClick = (sample: (typeof SAMPLE_SCRIPTS)[number]) => {
    setText(sample.text);
    setSelectedVoiceId(sample.voiceId);
    toast.info(
      t("voice.toast.loadedSample", { label: t(sample.labelKey) })
    );
  };

  const processAudioFile = (file: File) => {
    const validExtensions = [".ogg", ".opus", ".mp3", ".wav", ".m4a"];
    const lowerName = file.name.toLowerCase();
    const isAudio =
      file.type.startsWith("audio/") ||
      file.type === "application/ogg" ||
      validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isAudio) {
      toast.error(t("voice.toast.invalidAudioType"));
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error(t("voice.toast.audioTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReferenceAudioBase64(String(reader.result || ""));
      setReferenceAudioName(file.name);
      toast.success(
        t("voice.toast.loadedAudioSample", { name: file.name })
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
      toast.error(t("voice.toast.emptyScript"));
      return;
    }
    if (cleanText.length > 1500) {
      toast.error(t("voice.toast.scriptTooLong"));
      return;
    }
    if (cloneMode && !referenceAudioBase64) {
      toast.warning(t("voice.toast.missingCloneAudio"));
      return;
    }

    const quotaCheck = consumeCredit();
    if (!quotaCheck.allowed) {
      toast.warning(
        t("quota.exhaustedToast", {
          remaining: quotaCheck.state.creditsRemaining,
          max: quotaCheck.state.maxTrialCredits,
        })
      );
      onRequirePaywall();
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        body: JSON.stringify({
          text: cleanText,
          voiceId: selectedPreset.id,
          language: selectedPreset.language,
          referenceAudioBase64:
            cloneMode && referenceAudioBase64
              ? referenceAudioBase64
              : undefined,
          locale,
        }),
      });

      const data = (await response.json()) as {
        audioUrl?: string;
        engine?: string;
        durationMs?: number;
        isFallback?: boolean;
        error?: string;
      };

      if (!response.ok || !data.audioUrl) {
        throw new Error(data.error || t("voice.toast.synthFailed"));
      }

      const isCloneOutput = Boolean(cloneMode && referenceAudioBase64);
      const newItem = createVoiceHistoryEntry({
        text: cleanText,
        voiceLabel:
          isCloneOutput && referenceAudioName
            ? t("voice.cloneVoiceLabel", { name: referenceAudioName })
            : t(selectedPreset.labelKey),
        voiceId: isCloneOutput ? undefined : selectedPreset.id,
        sampleName:
          isCloneOutput && referenceAudioName ? referenceAudioName : undefined,
        engine: data.engine || "Kokoro-82M (Apache-2.0)",
        isFallback: Boolean(data.isFallback),
        audioUrl: data.audioUrl,
        durationMs: data.durationMs || 3200,
        isClone: isCloneOutput,
        locale,
      });

      setActiveOutput(newItem);
      setPlaybackProgress(0);
      setAudioCurrentTime(0);
      setAudioDuration(newItem.durationMs / 1000);
      saveHistory([newItem, ...history]);
      toast.success(
        t("voice.toast.ready", { engine: getDisplayEngine(newItem) })
      );

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
        error instanceof Error ? error.message : t("voice.toast.synthFailed")
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
    toast.success(t("voice.toast.downloaded"));
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
    toast.info(t("voice.toast.clearedHistory"));
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
              <Mic className="size-4 shrink-0 text-violet-400" />
              {t("voice.configTitle")}
            </h2>
            <p className="text-xs text-zinc-400">
              {t("voice.configSubtitle")}
            </p>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300"
          >
            <ShieldCheck className="mr-1 size-3" />
            {t("voice.licenseBadge")}
          </Badge>
        </div>

        {/* Quick Viral Hook Templates */}
        <div className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {t("voice.templatesLabel")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_SCRIPTS.map((sample) => {
              const isSelected = text === sample.text;
              const label = t(sample.labelKey);
              return (
                <button
                  key={sample.labelKey}
                  type="button"
                  onClick={() => handleSampleClick(sample)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all ${
                    isSelected
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-100"
                      : "border-white/[0.07] bg-zinc-950/60 text-zinc-300 hover:border-white/15 hover:bg-zinc-900/80 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Script Editor Textarea & Live Counter */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="voice-script-textarea"
              className="text-[11px] font-medium uppercase tracking-wider text-zinc-400"
            >
              {t("voice.scriptLabel")}
            </label>
            <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
              {estimatedReadSec > 0 && (
                <span className="text-zinc-500">
                  {t("voice.readTime", { seconds: estimatedReadSec })}
                </span>
              )}
              <span
                className={
                  text.length > 1400
                    ? "font-semibold text-amber-400"
                    : "text-zinc-400"
                }
              >
                {t("voice.charCount", { count: text.length, max: 1500 })}
              </span>
            </div>
          </div>
          <Textarea
            id="voice-script-textarea"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1500))}
            rows={5}
            placeholder={t("voice.scriptPlaceholder")}
            className="min-h-36 resize-y border-white/[0.08] bg-zinc-950/75 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus-visible:border-violet-500/60"
          />
        </div>

        {/* Neural Voice Preset Selector & Zero-Shot Clone Toggle */}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <label className="block truncate text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              {t("voice.presetLabel")}
            </label>
            <Select
              value={selectedVoiceId}
              onValueChange={(val) => {
                if (val) setSelectedVoiceId(String(val));
              }}
            >
              <SelectTrigger className="h-9 w-full border-white/[0.08] bg-zinc-950/80 text-xs text-white focus-visible:border-violet-500/60">
                <SelectValue>
                  {(val: string | null) => {
                    const preset =
                      VOICE_PRESETS.find((v) => v.id === val) ?? selectedPreset;
                    return `${t(preset.labelKey)} (${t(preset.badgeKey)})`;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b0b10] text-zinc-100 backdrop-blur-xl">
                {VOICE_PRESETS.map((voice) => (
                  <SelectItem
                    key={voice.id}
                    value={voice.id}
                    className="text-xs"
                  >
                    {t(voice.labelKey)} ({t(voice.badgeKey)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1.5">
            <span className="block truncate text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              {t("voice.cloneSectionLabel")}
            </span>
            <button
              type="button"
              onClick={() => setCloneMode((prev) => !prev)}
              aria-expanded={cloneMode}
              className={`flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
                cloneMode
                  ? "border-violet-500/60 bg-violet-500/15 text-violet-100"
                  : "border-white/[0.08] bg-zinc-950/75 text-zinc-400 hover:border-white/15 hover:text-zinc-200"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Sparkles className="size-3.5 shrink-0 text-violet-400" />
                <span className="truncate">
                  {t("voice.cloneToggleLabel")}
                </span>
              </span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                  cloneMode
                    ? "border-violet-400/60 bg-violet-600 text-white"
                    : "border-white/[0.08] bg-white/[0.04] text-zinc-400"
                }`}
              >
                {cloneMode ? t("voice.toggleOn") : t("voice.toggleOff")}
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
              accept=".ogg,.mp3,.wav,.m4a,audio/ogg,audio/opus,audio/mpeg,audio/wav"
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
                  {t("voice.dropzoneTitle")}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {t("voice.dropzoneHint")}
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
                      {t("voice.sampleReady")}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleClearAudioSample}
                  aria-label={t("voice.removeAudioAria")}
                  title={t("voice.removeAudioAria")}
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
          className="h-10 w-full bg-violet-600 px-3 text-xs font-semibold tracking-tight text-white hover:bg-violet-500 sm:text-sm"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
              <span className="truncate">{t("voice.synthesizingButton")}</span>
            </>
          ) : (
            <>
              <Wand2 className="mr-2 size-4 shrink-0" />
              <span className="truncate">
                {cloneMode
                  ? t("voice.generateCloneButton")
                  : t("voice.generatePresetButton", {
                      name: selectedPreset.shortName,
                    })}
              </span>
            </>
          )}
        </Button>
      </section>

      {/* Right Column (5 Cols): Master Audio Output & Session History Log */}
      <aside className="space-y-5 lg:col-span-5">
        {/* Panel 1: Master Audio Output */}
        <div className="space-y-4 rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] pb-3.5">
            <div className="min-w-0 space-y-0.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
                <Volume2 className="size-4 shrink-0 text-violet-400" />
                {t("voice.outputTitle")}
              </h2>
              <p className="text-xs text-zinc-400">
                {t("voice.outputSubtitle")}
              </p>
            </div>
            {activeOutput && (
              <Badge
                variant="outline"
                className="shrink-0 border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300"
              >
                {activeOutput.isClone
                  ? t("voice.licenseMitSafe")
                  : "Apache-2.0"}
              </Badge>
            )}
          </div>

          {activeOutput ? (
            <div className="space-y-3.5 rounded-xl border border-white/[0.07] bg-zinc-950/75 p-3.5">
              {/* Output Metadata Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-semibold text-white">
                  {getDisplayVoiceLabel(activeOutput)}
                </span>
                <Badge
                  variant="outline"
                  className="max-w-full shrink-0 truncate border-white/10 bg-white/[0.04] font-mono text-[10px] text-zinc-300"
                  title={getDisplayEngine(activeOutput)}
                >
                  {getDisplayEngine(activeOutput)}
                </Badge>
              </div>

              {/* Interactive Waveform Visualizer Mockup */}
              <div className="space-y-2 rounded-lg border border-white/[0.06] bg-zinc-900/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleTogglePlayPause}
                    aria-label={
                      isPlaying ? t("voice.pauseAria") : t("voice.playAria")
                    }
                    title={
                      isPlaying ? t("voice.pauseAria") : t("voice.playAria")
                    }
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-white transition-colors hover:border-violet-500 hover:bg-violet-600"
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
                    aria-label={t("voice.waveformAria")}
                  >
                    {WAVEFORM_BARS.map((heightPct, i) => {
                      const barRatio = (i + 1) / WAVEFORM_BARS.length;
                      const isActive = barRatio <= playbackProgress;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleWaveformSeek(i)}
                          aria-label={t("voice.seekAria", {
                            percent: Math.round(barRatio * 100),
                          })}
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
                <Download className="mr-1.5 size-3.5 shrink-0" />
                <span className="truncate">
                  {t("voice.downloadAudioButton")}
                </span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/[0.1] bg-zinc-950/50 px-4 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-500">
                <Mic className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-zinc-300">
                  {t("voice.emptyTitle")}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {t("voice.emptyDescBefore")}{" "}
                  <strong className="font-medium text-zinc-300">
                    {t("voice.emptyDescAction")}
                  </strong>{" "}
                  {t("voice.emptyDescAfter")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2: Scrollable Session History Log (Last 10 Clips) */}
        <div className="space-y-3.5 rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-tight text-white">
              <History className="size-3.5 shrink-0 text-violet-400" />
              <span>{t("voice.historyTitle")}</span>
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
                {t("voice.clearHistory")}
              </Button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="py-2 text-xs text-zinc-500">
              {t("voice.historyEmpty")}
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
                          {getDisplayVoiceLabel(item)}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
                          · {getDisplayTimestamp(item)}
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
                        title={t("voice.replayClipTitle")}
                        aria-label={t("voice.replayClipTitle")}
                        className="border-white/[0.08] bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        <Play className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        onClick={() => handleDownloadAudio(item)}
                        title={t("voice.downloadClipTitle")}
                        aria-label={t("voice.downloadClipTitle")}
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
