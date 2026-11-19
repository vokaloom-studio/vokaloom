"use client";

import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Sparkles,
  Shuffle,
  Download,
  X,
  Camera,
  Eye,
  FolderArchive,
  Search,
  Loader2,
  CheckCircle2,
  UserPlus,
  Smartphone,
  Layers,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useLocale } from "@/components/locale-provider";
import {
  LOCALE_HEADER,
  translate,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n";
import { consumeCredit } from "@/lib/quota";
import type { BackgroundItem } from "@/app/api/backgrounds/route";

export interface BackgroundFinderProps {
  onRequirePaywall: () => void;
}

const MY_MODEL_STORAGE_KEY = "vokaloom_my_model_v1";

const VIBE_PRESETS: ReadonlyArray<{
  value: string;
  labelKey: TranslationKey;
}> = [
  { value: "Luxury Travel", labelKey: "bg.vibe.luxuryTravel" },
  { value: "Candid Lifestyle", labelKey: "bg.vibe.candidLifestyle" },
  { value: "Minimalist Cafe", labelKey: "bg.vibe.minimalistCafe" },
  { value: "Urban Street POV", labelKey: "bg.vibe.urbanStreetPov" },
  { value: "Nature Sunset", labelKey: "bg.vibe.natureSunset" },
];

interface BackgroundsApiResponse {
  items: BackgroundItem[];
  count: number;
  resolvedQuery: string;
  extractedTags: string[];
  visionUsed: boolean;
  isCuratedFallback: boolean;
  notice?: string;
  page: number;
}

interface ModelSwapApiResponse {
  resultImageUrl: string | null;
  fallbackComposite?: boolean;
  engine?: string;
  isFallback?: boolean;
  error?: string;
}

interface SavedModelData {
  base64: string;
  name: string;
}

async function compressImageFileToBase64(
  file: File,
  maxDim = 1024,
  quality = 0.82
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const img = new window.Image();
      img.onerror = () =>
        resolve({ base64: dataUrl, mimeType: file.type || "image/jpeg" });
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ base64: dataUrl, mimeType: file.type || "image/jpeg" });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
        resolve({ base64: compressedBase64, mimeType: "image/jpeg" });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function generateOfflineVerticalFallbackBlob(
  item: BackgroundItem,
  index: number,
  locale: Locale
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
    grad.addColorStop(0, "#14141d");
    grad.addColorStop(0.5, "#1a1824");
    grad.addColorStop(1, "#070709");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    ctx.fillStyle = "rgba(244,244,246,0.9)";
    ctx.font = "bold 46px sans-serif";
    ctx.fillText(
      translate(locale, "bg.fallbackCanvasTitle", { index: index + 1 }),
      80,
      880
    );
    ctx.font = "34px sans-serif";
    ctx.fillStyle = "rgba(161,161,170,0.85)";
    ctx.fillText(item.title.slice(0, 42), 80, 950);
    ctx.fillText(
      translate(locale, "bg.fallbackCanvasCredit", {
        photographer: item.photographer,
      }),
      80,
      1010
    );
  }
  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b || new Blob(["vokaloom-image"], { type: "image/png" })),
      "image/jpeg",
      0.92
    );
  });
}

async function fetchImageBlobWithCorsProxy(
  item: BackgroundItem,
  index: number,
  locale: Locale
): Promise<Blob> {
  const proxiedEndpoint = `/api/backgrounds?proxyUrl=${encodeURIComponent(
    item.downloadUrl
  )}`;
  try {
    const proxyRes = await fetch(proxiedEndpoint, {
      headers: { [LOCALE_HEADER]: locale },
    });
    if (proxyRes.ok) {
      return await proxyRes.blob();
    }
  } catch {
    // Fall through to direct fetch
  }

  try {
    const directRes = await fetch(item.downloadUrl);
    if (directRes.ok) {
      return await directRes.blob();
    }
  } catch {
    // Fall through to offline canvas generator
  }

  return generateOfflineVerticalFallbackBlob(item, index, locale);
}

async function generateClientCanvasComposite(
  modelBase64: string,
  item: BackgroundItem,
  index: number,
  locale: Locale
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) return modelBase64;

  const bgBlob = await fetchImageBlobWithCorsProxy(item, index, locale);
  const bgObjectUrl = URL.createObjectURL(bgBlob);
  try {
    const bgImg = await loadImageElement(bgObjectUrl);
    const scale = Math.max(
      canvas.width / bgImg.width,
      canvas.height / bgImg.height
    );
    const drawW = bgImg.width * scale;
    const drawH = bgImg.height * scale;
    const drawX = (canvas.width - drawW) / 2;
    const drawY = (canvas.height - drawH) / 2;
    ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);
  } finally {
    URL.revokeObjectURL(bgObjectUrl);
  }

  const bottomGrad = ctx.createLinearGradient(0, 1000, 0, 1920);
  bottomGrad.addColorStop(0, "rgba(0,0,0,0)");
  bottomGrad.addColorStop(1, "rgba(7,7,9,0.5)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, 1000, 1080, 920);

  const modelImg = await loadImageElement(modelBase64);
  const targetH = 980;
  const targetW = Math.min(
    780,
    Math.round((modelImg.width / modelImg.height) * targetH)
  );
  const x = Math.round((canvas.width - targetW) / 2);
  const y = canvas.height - targetH - 90;
  const radius = 32;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.beginPath();
  ctx.roundRect(x, y, targetW, targetH, radius);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, targetW, targetH, radius);
  ctx.clip();
  ctx.drawImage(modelImg, x, y, targetW, targetH);

  const edgeShade = ctx.createLinearGradient(0, y + targetH - 220, 0, y + targetH);
  edgeShade.addColorStop(0, "rgba(0,0,0,0)");
  edgeShade.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = edgeShade;
  ctx.fillRect(x, y, targetW, targetH);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, targetW, targetH, radius);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  return canvas.toDataURL("image/png");
}

export function BackgroundFinder({ onRequirePaywall }: BackgroundFinderProps) {
  const { locale, t } = useLocale();
  const [batchSize, setBatchSize] = useState<5 | 15>(15);
  const [selectedVibe, setSelectedVibe] = useState<string>("Luxury Travel");
  const [query, setQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [items, setItems] = useState<BackgroundItem[]>([]);
  const [resolvedQuery, setResolvedQuery] = useState<string>(
    "Luxury Travel candid vertical"
  );
  const [extractedTags, setExtractedTags] = useState<string[]>([
    "luxury",
    "travel",
    "candid",
    "vertical",
    "sunlight",
  ]);
  const [visionUsed, setVisionUsed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Reference Image State (Boss Reference Matcher)
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceMimeType, setReferenceMimeType] =
    useState<string>("image/jpeg");
  const [referenceFileName, setReferenceFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // My Model Reference State (Persisted in localStorage)
  const [myModelPreview, setMyModelPreview] = useState<string | null>(null);
  const [myModelName, setMyModelName] = useState<string>("");
  const myModelInputRef = useRef<HTMLInputElement | null>(null);

  // Model-in-Scene Swap Modal State
  const [swapModalOpen, setSwapModalOpen] = useState<boolean>(false);
  const [isSwapping, setIsSwapping] = useState<boolean>(false);
  const [swappingItemId, setSwappingItemId] = useState<string | null>(null);
  const [swapTargetItem, setSwapTargetItem] = useState<BackgroundItem | null>(
    null
  );
  const [swapResultUrl, setSwapResultUrl] = useState<string | null>(null);
  const [swapEngine, setSwapEngine] = useState<string>("");
  const [swapIsFallback, setSwapIsFallback] = useState<boolean>(false);

  // ZIP Export State
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const selectedVibeMeta =
    VIBE_PRESETS.find((v) => v.value === selectedVibe) ?? VIBE_PRESETS[0];

  const fetchBatch = async (opts: {
    targetPage: number;
    batchSizeOverride?: 5 | 15;
    vibeOverride?: string;
    queryOverride?: string;
    refBase64?: string | null;
    refMime?: string;
    consumeQuota: boolean;
  }) => {
    if (opts.consumeQuota) {
      const creditCheck = consumeCredit();
      if (!creditCheck.allowed) {
        toast.warning(
          t("quota.exhaustedToast", {
            remaining: creditCheck.state.creditsRemaining,
            max: creditCheck.state.maxTrialCredits,
          })
        );
        onRequirePaywall();
        return;
      }
    }

    const activeBatchSize = opts.batchSizeOverride ?? batchSize;
    setIsLoading(true);
    try {
      const response = await fetch("/api/backgrounds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        body: JSON.stringify({
          query: opts.queryOverride ?? query,
          vibe: opts.vibeOverride ?? selectedVibe,
          page: opts.targetPage,
          batchSize: activeBatchSize,
          referenceImageBase64:
            opts.refBase64 !== undefined
              ? opts.refBase64 || undefined
              : referencePreview || undefined,
          mimeType: opts.refMime || referenceMimeType,
          locale,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as BackgroundsApiResponse;
      setItems(data.items || []);
      setResolvedQuery(data.resolvedQuery || "");
      setExtractedTags(data.extractedTags || []);
      setVisionUsed(Boolean(data.visionUsed));
      setPage(opts.targetPage);

      if (data.notice) {
        toast.info(data.notice);
      } else if (opts.consumeQuota) {
        toast.success(
          t("bg.toast.loadedBatch", {
            count: data.items.length,
            query: data.resolvedQuery,
          })
        );
      }
    } catch (error) {
      console.error("Failed to fetch backgrounds:", error);
      toast.error(t("bg.toast.fetchError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(MY_MODEL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SavedModelData>;
          if (parsed.base64) {
            setMyModelPreview(parsed.base64);
            setMyModelName(parsed.name || "");
          }
        }
      } catch {
        // Ignore storage errors
      }
    });

    let active = true;
    fetch("/api/backgrounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "",
        vibe: "Luxury Travel",
        page: 1,
        batchSize: 15,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BackgroundsApiResponse | null) => {
        if (!active || !data) return;
        setItems(data.items || []);
        setResolvedQuery(
          data.resolvedQuery || "Luxury Travel candid vertical"
        );
        setExtractedTags(data.extractedTags || []);
        setVisionUsed(Boolean(data.visionUsed));
      })
      .catch(() => {
        // Ignore initial preload failure
      });

    return () => {
      active = false;
    };
  }, []);

  const handleGenerateClick = () => {
    void fetchBatch({
      targetPage: 1,
      batchSizeOverride: batchSize,
      consumeQuota: true,
    });
  };

  const handleShuffleMore = () => {
    const nextPage = page + 1;
    void fetchBatch({
      targetPage: nextPage,
      batchSizeOverride: batchSize,
      consumeQuota: true,
    });
  };

  const handleBatchSizeChange = (nextSize: 5 | 15) => {
    setBatchSize(nextSize);
  };

  const handleVibeSelect = (vibe: string) => {
    setSelectedVibe(vibe);
  };

  const handleReferenceFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error(t("bg.toast.invalidImageType"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("bg.toast.imageTooLarge"));
      return;
    }

    try {
      const { base64, mimeType } = await compressImageFileToBase64(
        file,
        1024,
        0.82
      );
      setReferencePreview(base64);
      setReferenceMimeType(mimeType);
      setReferenceFileName(file.name);
      toast.info(t("bg.toast.analyzingReference", { count: batchSize }));
      void fetchBatch({
        targetPage: 1,
        batchSizeOverride: batchSize,
        refBase64: base64,
        refMime: mimeType,
        consumeQuota: true,
      });
    } catch {
      toast.error(t("bg.toast.processImageError"));
    }
  };

  const handleClearReference = () => {
    setReferencePreview(null);
    setReferenceFileName("");
    setVisionUsed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast.info(t("bg.toast.clearedReference"));
  };

  const handleMyModelFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error(t("bg.toast.invalidImageType"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("bg.toast.imageTooLarge"));
      return;
    }

    try {
      const { base64 } = await compressImageFileToBase64(file, 900, 0.78);
      setMyModelPreview(base64);
      setMyModelName(file.name);
      try {
        window.localStorage.setItem(
          MY_MODEL_STORAGE_KEY,
          JSON.stringify({ base64, name: file.name })
        );
      } catch {
        // Ignore storage quota errors
      }
      toast.success(t("bg.toast.savedModel"));
    } catch {
      toast.error(t("bg.toast.processImageError"));
    }
  };

  const handleClearMyModel = () => {
    setMyModelPreview(null);
    setMyModelName("");
    if (myModelInputRef.current) {
      myModelInputRef.current.value = "";
    }
    try {
      window.localStorage.removeItem(MY_MODEL_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    toast.info(t("bg.toast.clearedModel"));
  };

  const handlePlaceModel = async (item: BackgroundItem, index: number) => {
    if (!myModelPreview) {
      toast.warning(t("bg.toast.uploadModelFirst"));
      myModelInputRef.current?.click();
      return;
    }

    const creditCheck = consumeCredit();
    if (!creditCheck.allowed) {
      toast.warning(
        t("quota.exhaustedToast", {
          remaining: creditCheck.state.creditsRemaining,
          max: creditCheck.state.maxTrialCredits,
        })
      );
      onRequirePaywall();
      return;
    }

    setSwapTargetItem(item);
    setSwapResultUrl(null);
    setSwapEngine("");
    setSwapIsFallback(false);
    setSwappingItemId(item.id);
    setIsSwapping(true);
    setSwapModalOpen(true);

    try {
      const res = await fetch("/api/model-swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        body: JSON.stringify({
          modelImageBase64: myModelPreview,
          backgroundUrl: item.downloadUrl || item.previewUrl,
          sceneTitle: item.title,
          locale,
        }),
      });

      const data = (await res.json()) as ModelSwapApiResponse;
      if (!res.ok) {
        throw new Error(data.error || t("bg.toast.modelSwapError"));
      }

      if (data.resultImageUrl) {
        setSwapResultUrl(data.resultImageUrl);
        setSwapEngine(data.engine || "Gemini 2.5 Visual Compositor");
        setSwapIsFallback(Boolean(data.isFallback));
        toast.success(
          t("bg.toast.modelSwapReady", {
            engine: data.engine || "Gemini 2.5 Visual Compositor",
          })
        );
      } else {
        const localCompositeUrl = await generateClientCanvasComposite(
          myModelPreview,
          item,
          index,
          locale
        );
        const engineLabel =
          data.engine || t("api.modelSwap.fallbackEngine");
        setSwapResultUrl(localCompositeUrl);
        setSwapEngine(engineLabel);
        setSwapIsFallback(true);
        toast.success(t("bg.toast.modelSwapReady", { engine: engineLabel }));
      }
    } catch (error) {
      console.error("Model swap error:", error);
      toast.error(
        error instanceof Error ? error.message : t("bg.toast.modelSwapError")
      );
      setSwapModalOpen(false);
    } finally {
      setIsSwapping(false);
      setSwappingItemId(null);
    }
  };

  const handleDownloadSwapResult = () => {
    if (!swapResultUrl) return;
    const isPng = swapResultUrl.startsWith("data:image/png");
    const ext = isPng ? "png" : "jpg";
    const link = document.createElement("a");
    link.href = swapResultUrl;
    link.download = `vokaloom-model-scene-9x16.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(t("bg.toast.downloadedComposite"));
  };

  const handleDownloadSingle = async (item: BackgroundItem, index: number) => {
    setDownloadingId(item.id);
    try {
      const blob = await fetchImageBlobWithCorsProxy(item, index, locale);

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      const safeName = item.photographer
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      link.download = `vokaloom-9x16-${index + 1}-${safeName}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast.success(
        t("bg.toast.downloadedSingle", {
          index: index + 1,
          photographer: item.photographer,
        })
      );
    } catch {
      toast.error(t("bg.toast.downloadSingleError"));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAllZip = async () => {
    if (items.length === 0) {
      toast.warning(t("bg.toast.generateFirst"));
      return;
    }

    setIsZipping(true);
    setZipProgress(5);

    try {
      const zip = new JSZip();
      const folderName = `vokaloom-${items.length}-backgrounds`;
      const folder = zip.folder(folderName);
      let completedCount = 0;

      await Promise.all(
        items.map(async (item, index) => {
          const blob = await fetchImageBlobWithCorsProxy(item, index, locale);

          const num = String(index + 1).padStart(2, "0");
          const cleanAuthor = item.photographer
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          const filename = `${num}-${item.source}-${cleanAuthor || "creator"}-9x16.jpg`;

          folder?.file(filename, blob);
          completedCount += 1;
          setZipProgress(
            Math.min(90, Math.round((completedCount / items.length) * 85) + 5)
          );
        })
      );

      const attributionLines = [
        t("bg.readme.header", { count: items.length }),
        t("bg.readme.query", { query: resolvedQuery }),
        t("bg.readme.vibe", { vibe: selectedVibe }),
        t("bg.readme.aspect"),
        "",
        t("bg.readme.attributionsHeader"),
        ...items.map((item, i) =>
          t("bg.readme.itemLine", {
            num: String(i + 1).padStart(2, "0"),
            title: item.title,
            photographer: item.photographer,
            source: item.source.toUpperCase(),
          })
        ),
      ];
      folder?.file("README-ATTRIBUTION.txt", attributionLines.join("\n"));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      setZipProgress(100);

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t("bg.toast.downloadedZip", { count: items.length }));
    } catch (error) {
      console.error("ZIP compression error:", error);
      toast.error(t("bg.toast.zipError"));
    } finally {
      setTimeout(() => {
        setIsZipping(false);
        setZipProgress(0);
      }, 600);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      {/* Left Workbench Rail (4 Columns): 3 Crisp Hairline-Separated Sections */}
      <aside className="min-w-0 overflow-hidden rounded-lg border border-zinc-800/80 bg-[#0c0c10] divide-y divide-zinc-800/80 lg:sticky lg:top-18 lg:col-span-4">
        {/* Section 1: Query & Vibe */}
        <div className="space-y-3.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-tight text-zinc-100">
              {t("bg.section.queryVibe")}
            </h2>
            <div
              role="group"
              aria-label={t("bg.batch.label")}
              className="inline-flex items-center rounded-md border border-zinc-800/80 bg-[#070709] p-0.5 font-mono text-[10px]"
            >
              <button
                type="button"
                onClick={() => handleBatchSizeChange(5)}
                aria-pressed={batchSize === 5}
                className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-medium transition-colors ${
                  batchSize === 5
                    ? "bg-zinc-100 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                <Smartphone className="size-2.5 shrink-0" />
                <span>{t("bg.batch.fast5")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleBatchSizeChange(15)}
                aria-pressed={batchSize === 15}
                className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 font-medium transition-colors ${
                  batchSize === 15
                    ? "bg-zinc-100 text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                <Layers className="size-2.5 shrink-0" />
                <span>{t("bg.batch.full15")}</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#8a8a95]">
                {t("bg.vibePresets")}
              </span>
              <span className="truncate font-mono text-[10px] text-zinc-500">
                {t(selectedVibeMeta.labelKey)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VIBE_PRESETS.map((vibe) => {
                const isActive = selectedVibe === vibe.value;
                return (
                  <button
                    key={vibe.value}
                    type="button"
                    onClick={() => handleVibeSelect(vibe.value)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      isActive
                        ? "border-zinc-500 bg-[#1a1a22] text-zinc-100"
                        : "border-zinc-800/80 bg-[#131318] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {t(vibe.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="aesthetic-search-input"
              className="block text-[11px] font-medium uppercase tracking-wider text-[#8a8a95]"
            >
              {t("bg.sceneLabel")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                id="aesthetic-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGenerateClick();
                  }
                }}
                placeholder={t("bg.searchPlaceholder")}
                className="h-8 border-zinc-800/80 bg-[#070709] pl-8 pr-7 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-600"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("bg.clearSearchAria")}
                  title={t("bg.clearSearchAria")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleGenerateClick}
              disabled={isLoading}
              className="h-8 min-w-0 flex-1 bg-violet-600 text-xs font-medium text-white hover:bg-violet-500"
            >
              {isLoading ? (
                <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5 shrink-0" />
              )}
              <span className="truncate">
                {t("bg.generateButton", { count: batchSize })}
              </span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleShuffleMore}
              disabled={isLoading}
              title={t("bg.shuffleTitle", {
                count: batchSize,
                page: page + 1,
              })}
              className="h-8 shrink-0 border-zinc-800 bg-[#131318] px-2.5 text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800"
            >
              <Shuffle className="mr-1.5 size-3.5 shrink-0 text-zinc-400" />
              <span>{t("bg.shuffleButton", { page: page + 1 })}</span>
            </Button>
          </div>
        </div>

        {/* Section 2: Model & Reference */}
        <div className="space-y-3 p-4">
          <h3 className="text-xs font-semibold tracking-tight text-zinc-100">
            {t("bg.section.modelReference")}
          </h3>

          {/* My Model Reference Slot */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-300">
                {t("bg.model.title")}
              </span>
              <span className="font-mono text-[10px] text-emerald-400">
                9:16
              </span>
            </div>

            <input
              ref={myModelInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleMyModelFileChange}
              className="hidden"
              id="my-model-upload"
            />

            {!myModelPreview ? (
              <label
                htmlFor="my-model-upload"
                className="group flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-zinc-800 bg-[#070709] p-2 transition-colors hover:border-zinc-600 hover:bg-[#131318]"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-[#131318] text-emerald-400">
                  <UserPlus className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">
                    {t("bg.model.uploadTitle")}
                  </p>
                  <p className="truncate text-[10px] text-[#8a8a95]">
                    {t("bg.model.uploadHint")}
                  </p>
                </div>
              </label>
            ) : (
              <div className="flex items-center gap-2.5 rounded-md border border-zinc-800 bg-[#131318] p-2">
                <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded border border-zinc-700 bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={myModelPreview}
                    alt={t("bg.model.previewAlt")}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-medium text-zinc-100">
                      {myModelName || t("bg.model.fallbackName")}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearMyModel}
                      className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                      title={t("bg.model.removeTitle")}
                      aria-label={t("bg.model.removeTitle")}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                  <p className="truncate text-[10px] text-emerald-400">
                    {t("bg.model.savedStatus")}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Boss Reference Image Slot */}
          <div className="space-y-1.5 border-t border-zinc-800/70 pt-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-300">
                {t("bg.referenceTitle")}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                Gemini 2.5
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleReferenceFileChange}
              className="hidden"
              id="boss-reference-upload"
            />

            {!referencePreview ? (
              <label
                htmlFor="boss-reference-upload"
                className="group flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-zinc-800 bg-[#070709] p-2 transition-colors hover:border-zinc-600 hover:bg-[#131318]"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-[#131318] text-violet-400">
                  <Eye className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-200">
                    {t("bg.uploadReference")}
                  </p>
                  <p className="truncate text-[10px] text-[#8a8a95]">
                    {t("bg.uploadReferenceHint", { count: batchSize })}
                  </p>
                </div>
              </label>
            ) : (
              <div className="flex items-start gap-2.5 rounded-md border border-zinc-800 bg-[#131318] p-2">
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded border border-zinc-700 bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={referencePreview}
                    alt={t("bg.referencePreviewAlt")}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-medium text-zinc-100">
                      {referenceFileName || t("bg.referenceFallbackName")}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearReference}
                      className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                      title={t("bg.removeReferenceTitle")}
                      aria-label={t("bg.removeReferenceTitle")}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                  <p className="text-[10px] text-[#8a8a95]">
                    {visionUsed ? t("bg.visionDna") : t("bg.extractedDna")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {extractedTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-zinc-800 bg-[#070709] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Active Query Readout */}
        <div className="space-y-2 bg-[#09090d] px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#8a8a95]">
            <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
            <span className="shrink-0">{t("bg.resolvedLabel")}</span>
            <span
              className="truncate font-mono text-zinc-200"
              title={resolvedQuery}
            >
              {resolvedQuery}
            </span>
          </div>
          {extractedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {extractedTags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-zinc-800/80 bg-[#131318] px-1.5 py-0.5 font-mono text-[10px] text-[#8a8a95]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Right Canvas Grid (8 Columns) */}
      <section className="min-w-0 space-y-3.5 lg:col-span-8">
        {/* Clean Toolbar Header */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#0c0c10] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-xs font-semibold tracking-tight text-zinc-100 sm:text-sm">
                {t("bg.canvasTitle")}{" "}
                <span className="font-mono tabular-nums text-[#8a8a95]">
                  {items.length}/{batchSize}
                </span>
              </h2>

              <span className="rounded border border-zinc-800 bg-[#131318] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                {t("bg.pageBadge", { page })}
              </span>

              <div
                role="group"
                aria-label={t("bg.batch.label")}
                className="inline-flex h-6 items-center rounded border border-zinc-800 bg-[#070709] p-0.5 font-mono text-[10px]"
              >
                <button
                  type="button"
                  onClick={() => handleBatchSizeChange(5)}
                  aria-pressed={batchSize === 5}
                  className={`rounded-[3px] px-1.5 py-0.5 font-medium transition-colors ${
                    batchSize === 5
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {t("bg.batch.short5")}
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchSizeChange(15)}
                  aria-pressed={batchSize === 15}
                  className={`rounded-[3px] px-1.5 py-0.5 font-medium transition-colors ${
                    batchSize === 15
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {t("bg.batch.short15")}
                </button>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleDownloadAllZip}
              disabled={isZipping || items.length === 0}
              className="h-7 max-w-full shrink-0 border border-emerald-500/35 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
            >
              {isZipping ? (
                <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin" />
              ) : (
                <FolderArchive className="mr-1.5 size-3.5 shrink-0" />
              )}
              <span className="truncate">{t("bg.downloadZipButton")}</span>
            </Button>
          </div>

          {isZipping && (
            <div className="mt-2.5 space-y-1.5 border-t border-zinc-800/80 pt-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
                <span>
                  {t("bg.zipPackaging", { count: items.length })}{" "}
                  <code className="text-zinc-100">
                    vokaloom-{items.length}-backgrounds.zip
                  </code>
                </span>
                <span className="font-mono font-semibold tabular-nums text-emerald-400">
                  {zipProgress}%
                </span>
              </div>
              <Progress value={zipProgress} className="h-1.5" />
            </div>
          )}
        </div>

        {/* 9:16 Photo Grid */}
        <div className="relative">
          {isLoading && items.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-black/45 pt-16 backdrop-blur-[1px]">
              <div className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-[#0c0c10] px-3 py-1.5 text-xs font-medium text-zinc-200">
                <Loader2 className="size-3.5 animate-spin text-violet-400" />
                {t("bg.loadingOverlay", { count: batchSize })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="group relative aspect-[9/16] w-full overflow-hidden rounded-lg border border-zinc-800/80 bg-[#0c0c10] transition-colors hover:border-zinc-600"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />

                {/* Minimal Top Telemetry */}
                <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between gap-1 font-mono text-[10px]">
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-zinc-100 tabular-nums">
                    #{index + 1}
                  </span>
                  <span className="rounded bg-black/70 px-1.5 py-0.5 uppercase text-zinc-300">
                    {item.source === "curated"
                      ? t("bg.sourceCurated")
                      : item.source}
                  </span>
                </div>

                {/* Desktop Hover/Focus Actions */}
                <div
                  className={`absolute top-1/2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 transition-opacity duration-150 sm:flex ${
                    downloadingId === item.id || swappingItemId === item.id
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  }`}
                >
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handlePlaceModel(item, index)}
                    disabled={swappingItemId === item.id}
                    title={t("bg.placeModelTitle", { index: index + 1 })}
                    aria-label={t("bg.placeModelAria", {
                      index: index + 1,
                      photographer: item.photographer,
                    })}
                    className="h-7 rounded-md bg-violet-600 px-2.5 text-[11px] font-medium text-white shadow-md hover:bg-violet-500"
                  >
                    {swappingItemId === item.id ? (
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1.5 size-3" />
                    )}
                    {t("bg.placeModelButton")}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownloadSingle(item, index)}
                    disabled={downloadingId === item.id}
                    title={t("bg.downloadSingleTitle", { index: index + 1 })}
                    aria-label={t("bg.downloadSingleAria", {
                      index: index + 1,
                      photographer: item.photographer,
                    })}
                    className="h-7 rounded-md border border-zinc-700 bg-[#0c0c10]/90 px-2.5 text-[11px] font-medium text-zinc-100 shadow-md hover:bg-zinc-100 hover:text-zinc-950"
                  >
                    {downloadingId === item.id ? (
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 size-3" />
                    )}
                    {t("bg.hdButton")}
                  </Button>
                </div>

                {/* Minimal Bottom Metadata + Mobile Touch Controls */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/65 to-transparent p-2 pt-9">
                  <p className="line-clamp-1 text-[11px] font-medium text-zinc-100">
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-1.5">
                    <span className="flex min-w-0 items-center gap-1 text-[10px] text-zinc-400">
                      <Camera className="size-3 shrink-0" />
                      <span className="truncate">{item.photographer}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1 sm:hidden">
                      <button
                        type="button"
                        onClick={() => void handlePlaceModel(item, index)}
                        disabled={swappingItemId === item.id}
                        aria-label={t("bg.placeModelAria", {
                          index: index + 1,
                          photographer: item.photographer,
                        })}
                        title={t("bg.placeModelTitle", { index: index + 1 })}
                        className="inline-flex h-7 items-center gap-1 rounded bg-violet-600 px-2 text-[10px] font-medium text-white active:scale-95"
                      >
                        {swappingItemId === item.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Wand2 className="size-3" />
                        )}
                        <span>{t("bg.placeModelShort")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(item, index)}
                        disabled={downloadingId === item.id}
                        aria-label={t("bg.downloadSingleAria", {
                          index: index + 1,
                          photographer: item.photographer,
                        })}
                        title={t("bg.downloadSingleTitle", {
                          index: index + 1,
                        })}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-zinc-700 bg-[#0c0c10]/90 text-zinc-100 hover:bg-zinc-100 hover:text-zinc-950"
                      >
                        {downloadingId === item.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Download className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Model-in-Scene Compositor Preview Dialog */}
      <Dialog open={swapModalOpen} onOpenChange={setSwapModalOpen}>
        <DialogContent className="border border-zinc-800/90 bg-[#0c0c10] p-5 text-[#f4f4f6] shadow-2xl sm:max-w-md">
          <DialogHeader className="space-y-1.5 pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100 sm:text-base">
                <Wand2 className="size-4 shrink-0 text-violet-400" />
                <span>{t("bg.swapModal.title")}</span>
              </DialogTitle>
              {swapEngine && (
                <span className="rounded border border-zinc-800 bg-[#131318] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                  {swapEngine}
                </span>
              )}
            </div>
            <DialogDescription className="text-xs text-[#8a8a95]">
              {swapTargetItem?.title || t("bg.swapModal.subtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isSwapping ? (
              <div className="flex aspect-[9/16] max-h-[58vh] w-full flex-col items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-[#070709] p-6 text-center">
                <Loader2 className="size-7 animate-spin text-violet-400" />
                <p className="text-xs font-semibold text-zinc-100">
                  {t("bg.swapModal.generating")}
                </p>
                <p className="text-[11px] text-[#8a8a95]">
                  {t("bg.swapModal.generatingHint")}
                </p>
              </div>
            ) : swapResultUrl ? (
              <div className="space-y-3">
                <div className="mx-auto aspect-[9/16] max-h-[58vh] overflow-hidden rounded-lg border border-zinc-800 bg-[#070709]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={swapResultUrl}
                    alt={t("bg.swapModal.previewAlt")}
                    className="h-full w-full object-cover"
                  />
                </div>
                {swapIsFallback && (
                  <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    {t("bg.swapModal.fallbackNote")}
                  </p>
                )}
                <Button
                  type="button"
                  onClick={handleDownloadSwapResult}
                  className="h-9 w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Download className="mr-1.5 size-4 shrink-0" />
                  <span>{t("bg.swapModal.downloadButton")}</span>
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
