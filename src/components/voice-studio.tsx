"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Wand2,
  Download,
  Upload,
  X,
  History,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Loader2,
  Sparkles,
  Trash2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  consumeCredit,
  reconcileServerQuotaExhausted,
} from "@/lib/quota";

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
const MAX_PERSISTED_DATA_URL_CHARS = 250_000;
const MAX_PERSISTED_HISTORY_JSON_CHARS = 1_500_000;

const PLAYBACK_SPEEDS = [0.9, 1.0, 1.15] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

function buildDeterministicWaveform(seedText: string, barCount = 48): number[] {
  const input = seedText || "vokaloom-studio";
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < barCount; i += 1) {
    hash ^= i + 0x9e3779b9;
    hash = Math.imul(hash, 2654435761);
    const normalized = ((hash >>> 0) % 1000) / 1000;
    const envelope = Math.sin(((i + 0.5) / barCount) * Math.PI);
    const height = Math.round(22 + (0.35 + 0.65 * envelope) * normalized * 74);
    bars.push(Math.max(22, Math.min(96, height)));
  }
  return bars;
}

function formatSpeedLabel(speed: PlaybackSpeed): string {
  return speed === 1.15 ? "1.15x" : `${speed.toFixed(1)}x`;
}

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
  const [missingCloneHighlight, setMissingCloneHighlight] =
    useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const outputDeckRef = useRef<HTMLDivElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const waveformBarRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pointerScrubCleanupRef = useRef<(() => void) | null>(null);
  const didDragScrubRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      pointerScrubCleanupRef.current?.();
    };
  }, []);

  const scrollOutputIntoViewOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      outputDeckRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(VOICE_HISTORY_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as VoiceHistoryItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validItems = parsed.slice(0, 10);
            setHistory(validItems);
            const firstPlayable = validItems.find((item) => Boolean(item.audioUrl));
            if (firstPlayable) {
              setActiveOutput(firstPlayable);
            }
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
      const sanitized = trimmed.map((item) =>
        item.audioUrl.startsWith("data:") &&
        item.audioUrl.length > MAX_PERSISTED_DATA_URL_CHARS
          ? { ...item, audioUrl: "" }
          : item
      );
      const bounded = [...sanitized];
      let serialized = JSON.stringify(bounded);
      while (
        serialized.length > MAX_PERSISTED_HISTORY_JSON_CHARS &&
        bounded.length > 1
      ) {
        bounded.pop();
        serialized = JSON.stringify(bounded);
      }
      if (serialized.length <= MAX_PERSISTED_HISTORY_JSON_CHARS) {
        window.localStorage.setItem(VOICE_HISTORY_KEY, serialized);
      }
    } catch {
      // Ignore quota exceeded if storage is full
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
    if (
      item.isFallback ||
      item.engine.includes("Demo Fallback") ||
      item.engine.includes("Respaldo Demo")
    ) {
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
      const dataUrl = String(reader.result || "");
      setReferenceAudioBase64(dataUrl);
      setReferenceAudioName(file.name);
      setMissingCloneHighlight(false);

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
      setMissingCloneHighlight(true);
      toast.warning(t("voice.toast.missingCloneAudio"));
      return;
    }
    setMissingCloneHighlight(false);

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
    scrollOutputIntoViewOnMobile();
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

      const data = (await response.json().catch(() => ({}))) as {
        audioUrl?: string;
        engine?: string;
        durationMs?: number;
        isFallback?: boolean;
        error?: string;
        quotaExceeded?: boolean;
      };

      if (!response.ok || !data.audioUrl) {
        if (response.status === 402) {
          const reconciled = reconcileServerQuotaExhausted(data);
          toast.warning(
            data.error ||
              t("quota.exhaustedToast", {
                remaining: reconciled.creditsRemaining,
                max: reconciled.maxTrialCredits,
              })
          );
          onRequirePaywall();
          return;
        }
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
        scrollOutputIntoViewOnMobile();
        if (audioPlayerRef.current) {
          audioPlayerRef.current.load();
          audioPlayerRef.current.playbackRate = playbackSpeed;
          audioPlayerRef.current.muted = isMuted;
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
    if (!item.audioUrl) return;
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
    if (!item.audioUrl) return;
    setActiveOutput(item);
    setPlaybackProgress(0);
    setAudioCurrentTime(0);
    setAudioDuration(item.durationMs / 1000);
    setTimeout(() => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.load();
        audioPlayerRef.current.playbackRate = playbackSpeed;
        audioPlayerRef.current.muted = isMuted;
        audioPlayerRef.current.play().catch(() => {});
      }
    }, 80);
  };

  const handleTogglePlayPause = () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;
    audio.playbackRate = playbackSpeed;
    audio.muted = isMuted;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const handleSkipSeconds = (delta: number) => {
    const audio = audioPlayerRef.current;
    if (!audio) return;
    const duration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : activeOutput
          ? activeOutput.durationMs / 1000
          : 0;
    const nextTime =
      duration > 0
        ? Math.max(0, Math.min(duration, audio.currentTime + delta))
        : Math.max(0, audio.currentTime + delta);
    audio.currentTime = nextTime;
    setAudioCurrentTime(nextTime);
    setPlaybackProgress(duration > 0 ? nextTime / duration : 0);
  };

  const handleCycleSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextSpeed =
      PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackSpeed(nextSpeed);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = nextSpeed;
    }
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.muted = next;
      }
      return next;
    });
  };

  const waveformBars = useMemo(
    () =>
      buildDeterministicWaveform(
        activeOutput ? `${activeOutput.id}:${activeOutput.text}` : text
      ),
    [activeOutput, text]
  );

  const dormantWaveformBars = useMemo(
    () => buildDeterministicWaveform("vokaloom-dormant-silhouette"),
    []
  );

  const activeRovingBarIndex = Math.min(
    waveformBars.length - 1,
    Math.max(0, Math.floor(playbackProgress * waveformBars.length))
  );

  const seekToRatio = (rawRatio: number, autoPlay: boolean) => {
    const ratio = Math.max(0, Math.min(1, rawRatio));
    setPlaybackProgress(ratio);
    const audio = audioPlayerRef.current;
    if (!audio) return;

    const duration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : activeOutput
          ? activeOutput.durationMs / 1000
          : 0;
    if (duration > 0) {
      const nextTime = ratio * duration;
      audio.currentTime = nextTime;
      setAudioCurrentTime(nextTime);
    }
    audio.playbackRate = playbackSpeed;
    audio.muted = isMuted;
    if (autoPlay && audio.paused) {
      audio.play().catch(() => {});
    }
  };

  const handleWaveformSeek = (barIndex: number) => {
    if (didDragScrubRef.current) {
      didDragScrubRef.current = false;
      return;
    }
    const ratio = (barIndex + 0.5) / waveformBars.length;
    seekToRatio(ratio, true);
  };

  const handleWaveformKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    barIndex: number
  ) => {
    let targetIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      targetIndex = Math.min(waveformBars.length - 1, barIndex + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      targetIndex = Math.max(0, barIndex - 1);
    } else if (e.key === "Home") {
      targetIndex = 0;
    } else if (e.key === "End") {
      targetIndex = waveformBars.length - 1;
    }
    if (targetIndex === null) return;
    e.preventDefault();
    seekToRatio((targetIndex + 0.5) / waveformBars.length, false);
    requestAnimationFrame(() => {
      waveformBarRefs.current[targetIndex]?.focus();
    });
  };

  const handleWaveformPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const container = waveformRef.current;
    if (!container) return;

    pointerScrubCleanupRef.current?.();
    const startX = e.clientX;
    didDragScrubRef.current = false;

    const updateFromClientX = (clientX: number) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      seekToRatio((clientX - rect.left) / rect.width, false);
    };

    const handleMove = (ev: PointerEvent) => {
      if (!didDragScrubRef.current && Math.abs(ev.clientX - startX) >= 3) {
        didDragScrubRef.current = true;
      }
      if (didDragScrubRef.current) {
        updateFromClientX(ev.clientX);
      }
    };

    const handleUp = (ev: PointerEvent) => {
      if (didDragScrubRef.current) {
        updateFromClientX(ev.clientX);
        setTimeout(() => {
          didDragScrubRef.current = false;
        }, 0);
      }
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      pointerScrubCleanupRef.current = null;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    pointerScrubCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
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
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      {/* Left Column (7 Cols): Script Editor, Voice Presets & Zero-Shot Clone Uploader */}
      <section className="studio-deck min-w-0 overflow-hidden rounded-lg divide-y divide-white/[0.06] lg:col-span-7">
        {/* Panel Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-xs font-semibold tracking-tight text-[#F4F4F5] sm:text-sm">
            <Mic className="size-3.5 shrink-0 text-amber-400" />
            <span>{t("voice.configTitle")}</span>
          </h2>
        </div>

        {/* Script Templates & Textarea */}
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-wider text-[#8B8D98]">
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
                    className={`min-h-9 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors md:min-h-0 md:py-1 md:text-[11px] ${
                      isSelected
                        ? "border-amber-500/45 bg-[#13151D] text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "border-white/[0.08] bg-[#13151D]/70 text-[#8B8D98] hover:border-white/[0.15] hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="voice-script-textarea"
                className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#8B8D98]"
              >
                {t("voice.scriptLabel")}
              </label>
              <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                {estimatedReadSec > 0 && (
                  <span className="text-[#8B8D98]">
                    {t("voice.readTime", { seconds: estimatedReadSec })}
                  </span>
                )}
                <span
                  className={
                    text.length > 1400
                      ? "font-semibold text-amber-400"
                      : "text-[#8B8D98]"
                  }
                >
                  {t("voice.charCount", { count: text.length, max: 1500 })}
                </span>
              </div>
            </div>
            <Textarea
              id="voice-script-textarea"
              data-testid="voice-script-input"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1500))}
              rows={5}
              placeholder={t("voice.scriptPlaceholder")}
              className="min-h-36 resize-y border-white/[0.08] bg-[#050507] text-base leading-relaxed text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] placeholder:text-zinc-600 focus-visible:border-ring md:text-sm"
            />
          </div>
        </div>

        {/* Voice Preset, Zero-Shot Cloning & Primary Synthesize Action */}
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              className={`min-w-0 space-y-1.5 transition-opacity ${
                cloneMode && referenceAudioBase64 ? "opacity-45" : ""
              }`}
            >
              <label className="block truncate font-mono text-[10px] font-medium uppercase tracking-wider text-[#8B8D98]">
                {t("voice.presetLabel")}
              </label>
              <Select
                value={selectedVoiceId}
                onValueChange={(val) => {
                  if (val) setSelectedVoiceId(String(val));
                }}
              >
                <SelectTrigger className="h-11 w-full border-white/[0.08] bg-[#050507] text-sm text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] focus-visible:border-ring md:h-9 md:text-xs">
                  <SelectValue>
                    {(val: string | null) => {
                      const preset =
                        VOICE_PRESETS.find((v) => v.id === val) ??
                        selectedPreset;
                      return `${t(preset.labelKey)} (${t(preset.badgeKey)})`;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="border-white/[0.1] bg-[#13151D] text-[#F4F4F5]">
                  {VOICE_PRESETS.map((voice) => (
                    <SelectItem
                      key={voice.id}
                      value={voice.id}
                      className="text-xs focus:bg-white/[0.08]"
                    >
                      {t(voice.labelKey)} ({t(voice.badgeKey)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cloneMode && referenceAudioBase64 && (
                <p className="font-mono text-[10px] leading-snug text-amber-300/90">
                  {t("voice.presetOverriddenNote")}
                </p>
              )}
            </div>

            <div className="min-w-0 space-y-1.5">
              <span className="block truncate font-mono text-[10px] font-medium uppercase tracking-wider text-[#8B8D98]">
                {t("voice.cloneSectionLabel")}
              </span>
              <button
                type="button"
                data-testid="btn-clone-toggle"
                onClick={() =>
                  setCloneMode((prev) => {
                    const next = !prev;
                    if (!next) setMissingCloneHighlight(false);
                    return next;
                  })
                }
                aria-expanded={cloneMode}
                className={`flex h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm font-medium transition-colors md:h-9 md:text-xs ${
                  cloneMode
                    ? "border-white/[0.14] bg-[#13151D] text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "border-white/[0.08] bg-[#050507] text-[#8B8D98] hover:border-white/[0.14] hover:text-zinc-200"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Sparkles className="size-3.5 shrink-0 text-violet-400" />
                  <span className="truncate">
                    {t("voice.cloneToggleLabel")}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    cloneMode
                      ? "bg-[#F4F4F5] text-[#09090B]"
                      : "bg-zinc-800/90 text-[#8B8D98]"
                  }`}
                >
                  {cloneMode ? t("voice.toggleOn") : t("voice.toggleOff")}
                </span>
              </button>
            </div>
          </div>

          {cloneMode && (
            <div className="studio-well rounded-md p-3">
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
                  className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded border border-dashed px-3 py-4 text-center transition-colors ${
                    isDraggingAudio
                      ? "border-amber-500/70 bg-[#13151D]"
                      : missingCloneHighlight
                        ? "border-amber-500/85 bg-amber-500/[0.06] ring-1 ring-amber-500/35"
                        : "border-white/[0.12] bg-[#050507] hover:border-white/[0.22] hover:bg-[#0B0C10]"
                  }`}
                >
                  <Upload
                    className={`size-4 ${
                      missingCloneHighlight ? "text-amber-400" : "text-[#8B8D98]"
                    }`}
                  />
                  <p className="text-xs font-medium text-zinc-200">
                    {t("voice.dropzoneTitle")}
                  </p>
                  <p className="font-mono text-[10px] leading-relaxed text-[#8B8D98]">
                    {t("voice.dropzoneSubtitle")}
                  </p>
                  {missingCloneHighlight && (
                    <p className="text-[11px] font-medium text-amber-300">
                      {t("voice.dropzoneRequiredHint")}
                    </p>
                  )}
                </label>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded border border-emerald-500/35 bg-emerald-500/10 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Volume2 className="size-4 shrink-0 text-emerald-400" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#F4F4F5]">
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
                    className="text-zinc-400 hover:bg-[#13151D] hover:text-[#F4F4F5]"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            data-testid="btn-synthesize"
            onClick={handleSynthesize}
            disabled={isGenerating}
            className="h-11 w-full border border-amber-400/60 bg-amber-500 px-3 text-sm font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-amber-400 md:h-9.5"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                <span className="truncate">
                  {t("voice.synthesizingButton")}
                </span>
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
        </div>
      </section>

      {/* Right Column (5 Cols): Master Audio Output Deck & Session History */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-[68px] lg:col-span-5">
        {/* Card 1: Unified Master Audio Output Transport Deck */}
        <div
          ref={outputDeckRef}
          data-testid="voice-output-panel"
          className="studio-deck scroll-mt-[68px] overflow-hidden rounded-lg divide-y divide-white/[0.06]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <h2 className="flex items-center gap-2 font-heading text-xs font-semibold tracking-tight text-[#F4F4F5] sm:text-sm">
              <Volume2 className="size-3.5 shrink-0 text-amber-400" />
              <span>{t("voice.outputTitle")}</span>
            </h2>
            {activeOutput && (
              <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
                {activeOutput.isClone ? "MIT" : "Apache-2.0"}
              </span>
            )}
          </div>

          <div className="p-4">
            {isGenerating ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-[#F4F4F5]">
                    {cloneMode
                      ? t("voice.cloneVoiceLabel", {
                          name:
                            referenceAudioName.replace(/\.[^.]+$/, "") ||
                            "Sample",
                        })
                      : selectedPreset.shortName}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-amber-300">
                    <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
                    {t("voice.synthesizingWaveformStatus")}
                  </span>
                </div>

                <div className="studio-well space-y-3 rounded-md p-3">
                  <div
                    aria-hidden="true"
                    className="flex h-14 min-w-0 items-end justify-between gap-px sm:gap-[2px]"
                  >
                    {dormantWaveformBars.map((heightPct, i) => (
                      <span
                        key={i}
                        style={{
                          height: `${heightPct}%`,
                          animationDelay: `${(i % 8) * 90}ms`,
                        }}
                        className="min-w-[2px] flex-1 animate-pulse rounded-t-[2px] bg-amber-400/75"
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 border-t border-white/[0.06] pt-2.5 text-xs text-zinc-300">
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-amber-400" />
                    <span className="truncate font-mono text-[11px]">
                      {t("voice.synthesizingSubtext")}
                    </span>
                  </div>
                </div>
              </div>
            ) : activeOutput ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-[#F4F4F5]">
                    {getDisplayVoiceLabel(activeOutput)}
                  </span>
                  <span
                    className="min-w-0 max-w-full truncate font-mono text-[10px] text-[#8B8D98]"
                    title={getDisplayEngine(activeOutput)}
                  >
                    {getDisplayEngine(activeOutput)}
                  </span>
                </div>

                {/* Single Unified Master Transport Deck (48-Bar Scrubber + Precision Controls) */}
                <div className="studio-well min-w-0 space-y-2.5 overflow-hidden rounded-md p-3">
                  {/* 48-Bar High-Resolution Interactive Waveform (Roving Tabindex + Pointer Drag Scrub) */}
                  <div className="space-y-1">
                    <div
                      ref={waveformRef}
                      data-testid="voice-waveform"
                      onPointerDown={handleWaveformPointerDown}
                      className="relative flex h-14 min-w-0 touch-none select-none items-stretch justify-between gap-px sm:gap-[2px]"
                      role="group"
                      aria-label={t("voice.waveformAria")}
                    >
                      {waveformBars.map((heightPct, i) => {
                        const barStart = i / waveformBars.length;
                        const barRatio = (i + 1) / waveformBars.length;
                        const isPlayhead =
                          playbackProgress > 0 &&
                          playbackProgress >= barStart &&
                          playbackProgress < barRatio;
                        const isPlayed = barRatio <= playbackProgress;
                        return (
                          <button
                            key={i}
                            ref={(el) => {
                              waveformBarRefs.current[i] = el;
                            }}
                            type="button"
                            tabIndex={i === activeRovingBarIndex ? 0 : -1}
                            onClick={() => handleWaveformSeek(i)}
                            onKeyDown={(e) => handleWaveformKeyDown(e, i)}
                            aria-label={t("voice.seekAria", {
                              percent: Math.round(barRatio * 100),
                            })}
                            className="group relative flex h-full min-w-[2px] flex-1 cursor-pointer items-end focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/80"
                          >
                            <span
                              aria-hidden="true"
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-[2px] transition-colors duration-75 ${
                                isPlayhead
                                  ? "bg-amber-400"
                                  : isPlayed
                                    ? "bg-[#F4F4F5]"
                                    : "bg-zinc-800 group-hover:bg-zinc-600"
                              }`}
                            />
                          </button>
                        );
                      })}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 z-10 w-[1.5px] -translate-x-1/2 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.7)] transition-[left] duration-75"
                        style={{
                          left: `${Math.min(99.5, Math.max(0.5, playbackProgress * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="h-[2px] w-full overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className="h-full bg-amber-400 transition-[width] duration-75"
                        style={{
                          width: `${Math.min(100, Math.max(0, playbackProgress * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Unified Transport Row: Two Non-Breaking Subgroups (-5s/Play/+5s | Speed/Mute/Timecode) */}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.06] pt-2.5 md:pt-2">
                    <div className="flex flex-nowrap items-center gap-2 md:gap-1.5">
                      <button
                        type="button"
                        data-testid="btn-skip-back"
                        onClick={() => handleSkipSeconds(-5)}
                        aria-label={t("voice.skipBackAria")}
                        title={t("voice.skipBackAria")}
                        className="inline-flex h-9.5 shrink-0 items-center gap-1 rounded border border-white/[0.08] bg-[#13151D] px-2.5 font-mono text-[11px] font-medium tabular-nums text-zinc-300 transition-colors hover:border-white/[0.18] hover:text-[#F4F4F5] md:h-7 md:px-2 md:text-[10px]"
                      >
                        <RotateCcw className="size-3.5 md:size-3" />
                        <span>{t("voice.skipBackLabel")}</span>
                      </button>

                      <button
                        type="button"
                        data-testid="btn-play-toggle"
                        onClick={handleTogglePlayPause}
                        aria-label={
                          isPlaying ? t("voice.pauseAria") : t("voice.playAria")
                        }
                        title={
                          isPlaying ? t("voice.pauseAria") : t("voice.playAria")
                        }
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-amber-400/60 bg-amber-500 text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-colors hover:bg-amber-400 md:size-8"
                      >
                        {isPlaying ? (
                          <Pause className="size-4 fill-current md:size-3.5" />
                        ) : (
                          <Play className="size-4 fill-current md:size-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        data-testid="btn-skip-forward"
                        onClick={() => handleSkipSeconds(5)}
                        aria-label={t("voice.skipForwardAria")}
                        title={t("voice.skipForwardAria")}
                        className="inline-flex h-9.5 shrink-0 items-center gap-1 rounded border border-white/[0.08] bg-[#13151D] px-2.5 font-mono text-[11px] font-medium tabular-nums text-zinc-300 transition-colors hover:border-white/[0.18] hover:text-[#F4F4F5] md:h-7 md:px-2 md:text-[10px]"
                      >
                        <span>{t("voice.skipForwardLabel")}</span>
                        <RotateCw className="size-3.5 md:size-3" />
                      </button>
                    </div>

                    <div className="flex flex-nowrap items-center gap-2 md:gap-1.5">
                      <button
                        type="button"
                        data-testid="btn-speed-toggle"
                        onClick={handleCycleSpeed}
                        title={t("voice.speedTitle", {
                          speed: formatSpeedLabel(playbackSpeed).replace(
                            "x",
                            ""
                          ),
                        })}
                        aria-label={t("voice.speedTitle", {
                          speed: formatSpeedLabel(playbackSpeed).replace(
                            "x",
                            ""
                          ),
                        })}
                        className={`inline-flex h-9.5 shrink-0 items-center justify-center rounded border px-2.5 font-mono text-[11px] font-semibold tabular-nums transition-colors md:h-7 md:px-2 md:text-[10px] ${
                          playbackSpeed !== 1.0
                            ? "border-amber-500/45 bg-amber-500/15 text-amber-300"
                            : "border-white/[0.08] bg-[#13151D] text-zinc-200 hover:border-white/[0.18]"
                        }`}
                      >
                        {formatSpeedLabel(playbackSpeed)}
                      </button>

                      <button
                        type="button"
                        data-testid="btn-mute-toggle"
                        onClick={handleToggleMute}
                        aria-label={
                          isMuted ? t("voice.unmuteAria") : t("voice.muteAria")
                        }
                        title={
                          isMuted ? t("voice.unmuteAria") : t("voice.muteAria")
                        }
                        className={`inline-flex size-9.5 shrink-0 items-center justify-center rounded border transition-colors md:size-7 ${
                          isMuted
                            ? "border-amber-500/45 bg-amber-500/15 text-amber-300"
                            : "border-white/[0.08] bg-[#13151D] text-zinc-300 hover:border-white/[0.18] hover:text-[#F4F4F5]"
                        }`}
                      >
                        {isMuted ? (
                          <VolumeX className="size-4 md:size-3.5" />
                        ) : (
                          <Volume2 className="size-4 md:size-3.5" />
                        )}
                      </button>

                      <span
                        data-testid="voice-timecode"
                        className="whitespace-nowrap pl-1 font-mono text-[11px] font-medium tabular-nums text-zinc-200"
                      >
                        {formatSeconds(audioCurrentTime)} /{" "}
                        {formatSeconds(effectiveDurationSec)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hidden Native Audio Engine Wired to Master Transport */}
                <audio
                  ref={audioPlayerRef}
                  src={activeOutput.audioUrl}
                  preload="metadata"
                  onPlay={() => {
                    if (audioPlayerRef.current) {
                      audioPlayerRef.current.playbackRate = playbackSpeed;
                      audioPlayerRef.current.muted = isMuted;
                    }
                    setIsPlaying(true);
                  }}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setPlaybackProgress(1);
                  }}
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    el.playbackRate = playbackSpeed;
                    el.muted = isMuted;
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
                  className="hidden"
                />

                <blockquote className="rounded-r-md border-l-2 border-amber-500/55 bg-[#050507]/75 px-3 py-2 text-xs leading-relaxed text-zinc-300">
                  <p className="line-clamp-2">&ldquo;{activeOutput.text}&rdquo;</p>
                </blockquote>

                <Button
                  type="button"
                  data-testid="btn-download-audio"
                  onClick={() => handleDownloadAudio(activeOutput)}
                  className="h-11 w-full border border-emerald-500/45 bg-[#13151D] text-xs font-semibold text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/12 hover:text-[#F4F4F5] md:h-9"
                >
                  <Download className="mr-1.5 size-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">
                    {t("voice.downloadAudioButton")}
                  </span>
                </Button>
              </div>
            ) : (
              <div className="studio-well relative flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-md border-dashed px-4 py-8 text-center">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-3 bottom-2 top-3 flex items-end justify-between gap-px opacity-15 sm:gap-[2px]"
                >
                  {dormantWaveformBars.map((heightPct, i) => (
                    <span
                      key={i}
                      style={{ height: `${heightPct}%` }}
                      className="min-w-[2px] flex-1 rounded-t-[2px] bg-zinc-600"
                    />
                  ))}
                </div>
                <div className="relative z-10 flex flex-col items-center gap-1.5">
                  <Mic className="size-5 text-zinc-400" />
                  <p className="text-xs font-medium text-zinc-300">
                    {t("voice.emptyTitle")}
                  </p>
                  <p className="max-w-[260px] text-[11px] leading-snug text-[#8B8D98]">
                    {t("voice.emptyHelper")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Session History (Last 10 Clips) */}
        <div
          data-testid="voice-history-panel"
          className="studio-deck overflow-hidden rounded-lg divide-y divide-white/[0.06]"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <h3 className="flex items-center gap-2 font-heading text-xs font-semibold tracking-tight text-[#F4F4F5]">
              <History className="size-3.5 shrink-0 text-[#8B8D98]" />
              <span>{t("voice.historyTitle")}</span>
              <span
                data-testid="voice-history-count"
                className="font-mono text-[11px] font-normal tabular-nums text-[#8B8D98]"
              >
                ({history.length}/10)
              </span>
            </h3>
            {history.length > 0 && (
              <Button
                type="button"
                data-testid="btn-clear-history"
                variant="ghost"
                size="xs"
                onClick={handleClearHistory}
                className="h-8 px-2.5 text-[11px] text-[#8B8D98] hover:bg-[#13151D] hover:text-[#F4F4F5] md:h-6 md:px-2"
              >
                <Trash2 className="mr-1 size-3" />
                {t("voice.clearHistory")}
              </Button>
            )}
          </div>

          <div className="p-4">
            {history.length === 0 ? (
              <p className="py-1 text-xs text-[#8B8D98]">
                {t("voice.historyEmpty")}
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {history.map((item, idx) => {
                  const isCurrent = activeOutput?.id === item.id;
                  const clipDurationLabel = formatSeconds(
                    (item.durationMs || 0) / 1000
                  );
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2.5 rounded-md border p-2.5 text-xs transition-colors ${
                        isCurrent
                          ? "border-amber-500/45 border-l-[3px] border-l-amber-400 bg-[#13151D]"
                          : "border-white/[0.07] bg-[#050507] hover:border-white/[0.14]"
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-[#F4F4F5]">
                            {getDisplayVoiceLabel(item)}
                          </span>
                          <span
                            className={`shrink-0 rounded border px-1.5 py-px font-mono text-[9px] font-medium uppercase tracking-wider ${
                              item.isClone
                                ? "border-violet-500/35 bg-violet-500/10 text-violet-300"
                                : "border-white/[0.08] bg-[#13151D] text-zinc-400"
                            }`}
                          >
                            {item.isClone
                              ? t("voice.historyPillClone")
                              : t("voice.historyPillPreset")}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#8B8D98]">
                            {getDisplayTimestamp(item)} · {clipDurationLabel}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-[#8B8D98]">
                          {item.text}
                        </p>
                      </div>
                      {item.audioUrl ? (
                        <div className="flex shrink-0 items-center gap-2 md:gap-1.5">
                          <Button
                            type="button"
                            data-testid={`btn-replay-${idx}`}
                            size="icon"
                            variant="outline"
                            onClick={() => handleReplayItem(item)}
                            title={t("voice.replayClipTitle")}
                            aria-label={t("voice.replayClipTitle")}
                            className="size-9 border-white/[0.1] bg-[#13151D] text-zinc-200 hover:border-amber-500/45 hover:bg-[#181b25] hover:text-amber-300 md:size-8"
                          >
                            <Play className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            data-testid={`btn-download-history-${idx}`}
                            size="icon"
                            variant="outline"
                            onClick={() => handleDownloadAudio(item)}
                            title={t("voice.downloadClipTitle")}
                            aria-label={t("voice.downloadClipTitle")}
                            className="size-9 border-white/[0.1] bg-[#13151D] text-zinc-200 hover:border-emerald-500/45 hover:bg-[#181b25] hover:text-emerald-300 md:size-8"
                          >
                            <Download className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.07] bg-[#0B0C10] px-2 py-1 font-mono text-[10px] text-[#8B8D98]">
                          <Clock className="size-3 shrink-0 text-zinc-500" />
                          <span>{t("voice.historyAudioExpired")}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
