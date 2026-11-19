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
  Check,
  UserPlus,
  Wand2,
  Scan,
  MoveHorizontal,
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

function sampleSceneTemperatureTint(bgImg: HTMLImageElement): string {
  try {
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = 16;
    probeCanvas.height = 28;
    const pCtx = probeCanvas.getContext("2d");
    if (!pCtx) return "rgba(255, 205, 150, 0.14)";
    pCtx.drawImage(bgImg, 0, 0, 16, 28);
    const pixels = pCtx.getImageData(0, 0, 16, 28).data;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    const count = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      rSum += pixels[i];
      gSum += pixels[i + 1];
      bSum += pixels[i + 2];
    }
    const r = Math.round(rSum / count);
    const g = Math.round(gSum / count);
    const b = Math.round(bSum / count);
    if (r - b > 14) {
      return "rgba(255, 198, 138, 0.16)";
    }
    if (b - r > 14) {
      return "rgba(130, 178, 255, 0.16)";
    }
    return `rgba(${r}, ${g}, ${b}, 0.14)`;
  } catch {
    return "rgba(255, 205, 150, 0.14)";
  }
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

  let sceneTint = "rgba(255, 205, 150, 0.14)";
  const bgBlob = await fetchImageBlobWithCorsProxy(item, index, locale);
  const bgObjectUrl = URL.createObjectURL(bgBlob);
  try {
    const bgImg = await loadImageElement(bgObjectUrl);
    sceneTint = sampleSceneTemperatureTint(bgImg);
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

  // Subtle grounded depth falloff toward bottom frame edge
  const bottomGrad = ctx.createLinearGradient(0, 1120, 0, 1920);
  bottomGrad.addColorStop(0, "rgba(0,0,0,0)");
  bottomGrad.addColorStop(1, "rgba(6,6,8,0.42)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, 1120, 1080, 800);

  const modelImg = await loadImageElement(modelBase64);
  const targetH = 1040;
  const safeRatio =
    modelImg.width > 0 && modelImg.height > 0
      ? modelImg.width / modelImg.height
      : 0.72;
  const targetW = Math.min(840, Math.max(420, Math.round(safeRatio * targetH)));
  const x = Math.round((canvas.width - targetW) / 2);
  const y = canvas.height - targetH - 64;

  // Ambient elliptical ground contact shadow
  ctx.save();
  const shadowCx = canvas.width * 0.5;
  const shadowCy = y + targetH * 0.88;
  const shadowRx = targetW * 0.44;
  ctx.translate(shadowCx, shadowCy);
  ctx.scale(1, 0.28);
  const shadowGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, shadowRx);
  shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.48)");
  shadowGrad.addColorStop(0.55, "rgba(0, 0, 0, 0.18)");
  shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.arc(0, 0, shadowRx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Offscreen soft-feathered elliptical composite with color-temperature grading
  const subjectCanvas = document.createElement("canvas");
  subjectCanvas.width = targetW;
  subjectCanvas.height = targetH;
  const sCtx = subjectCanvas.getContext("2d");

  if (sCtx) {
    sCtx.drawImage(modelImg, 0, 0, targetW, targetH);

    // Match background ambient temperature cast across subject
    sCtx.save();
    sCtx.globalCompositeOperation = "source-atop";
    sCtx.fillStyle = sceneTint;
    sCtx.fillRect(0, 0, targetW, targetH);

    // Natural lower falloff toward ground shadow
    const footShade = sCtx.createLinearGradient(
      0,
      targetH * 0.65,
      0,
      targetH
    );
    footShade.addColorStop(0, "rgba(0, 0, 0, 0)");
    footShade.addColorStop(1, "rgba(0, 0, 0, 0.26)");
    sCtx.fillStyle = footShade;
    sCtx.fillRect(0, 0, targetW, targetH);
    sCtx.restore();

    // Soft elliptical alpha mask feathering all edges smoothly
    sCtx.save();
    sCtx.globalCompositeOperation = "destination-in";
    sCtx.translate(targetW * 0.5, targetH * 0.48);
    sCtx.scale(targetW * 0.5, targetH * 0.48);
    const alphaMask = sCtx.createRadialGradient(0, 0, 0.45, 0, 0, 0.99);
    alphaMask.addColorStop(0, "rgba(255, 255, 255, 1)");
    alphaMask.addColorStop(0.66, "rgba(255, 255, 255, 0.98)");
    alphaMask.addColorStop(0.86, "rgba(255, 255, 255, 0.45)");
    alphaMask.addColorStop(1, "rgba(255, 255, 255, 0)");
    sCtx.fillStyle = alphaMask;
    sCtx.fillRect(-1.2, -1.2, 2.4, 2.4);
    sCtx.restore();

    ctx.drawImage(subjectCanvas, x, y);
  } else {
    ctx.drawImage(modelImg, x, y, targetW, targetH);
  }

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
  const [visionUsed, setVisionUsed] = useState<boolean>(false);
  const [isCuratedFallback, setIsCuratedFallback] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);

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
  const [comparePosition, setComparePosition] = useState<number>(50);

  // ZIP Export State
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [zipTargetCount, setZipTargetCount] = useState<number>(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
        const errPayload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (response.status === 402) {
          onRequirePaywall();
        }
        throw new Error(errPayload.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as BackgroundsApiResponse;
      setItems(data.items || []);
      setSelectedIds(new Set());
      setResolvedQuery(data.resolvedQuery || "");
      setVisionUsed(Boolean(data.visionUsed));
      setIsCuratedFallback(Boolean(data.isCuratedFallback));
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
        preload: true,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BackgroundsApiResponse | null) => {
        if (!active || !data) return;
        setItems(data.items || []);
        setResolvedQuery(
          data.resolvedQuery || "Luxury Travel candid vertical"
        );
        setVisionUsed(Boolean(data.visionUsed));
        setIsCuratedFallback(Boolean(data.isCuratedFallback));
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

  const handleToggleSelectFrame = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
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
    setComparePosition(50);
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
        if (res.status === 402) {
          onRequirePaywall();
        }
        throw new Error(data.error || t("bg.toast.modelSwapError"));
      }

      if (data.resultImageUrl) {
        const resolvedEngine = data.engine || t("api.modelSwap.geminiEngine");
        setSwapResultUrl(data.resultImageUrl);
        setSwapEngine(resolvedEngine);
        setSwapIsFallback(Boolean(data.isFallback));
        toast.success(
          t("bg.toast.modelSwapReady", {
            engine: resolvedEngine,
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

  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const selectedCount = selectedItems.length;
  const isLiveStock =
    !isCuratedFallback &&
    items.some(
      (item) => item.source === "pexels" || item.source === "unsplash"
    );

  const handleDownloadAllZip = async () => {
    if (items.length === 0) {
      toast.warning(t("bg.toast.generateFirst"));
      return;
    }

    const exportItems = selectedCount > 0 ? selectedItems : items;
    setZipTargetCount(exportItems.length);
    setIsZipping(true);
    setZipProgress(5);

    try {
      const zip = new JSZip();
      const folderName = `vokaloom-${exportItems.length}-backgrounds`;
      const folder = zip.folder(folderName);
      let completedCount = 0;

      await Promise.all(
        exportItems.map(async (item, index) => {
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
            Math.min(
              90,
              Math.round((completedCount / exportItems.length) * 85) + 5
            )
          );
        })
      );

      const attributionLines = [
        t("bg.readme.header", { count: exportItems.length }),
        t("bg.readme.query", { query: resolvedQuery }),
        t("bg.readme.vibe", { vibe: selectedVibe }),
        t("bg.readme.aspect"),
        "",
        t("bg.readme.attributionsHeader"),
        ...exportItems.map((item, i) =>
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

      toast.success(
        t("bg.toast.downloadedZip", { count: exportItems.length })
      );
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

  const resolvedModalEngine = swapIsFallback
    ? t("api.modelSwap.fallbackEngine")
    : swapEngine === "Gemini 2.5 Visual Compositor" ||
        swapEngine === "Compositor Visual Gemini 2.5"
      ? t("api.modelSwap.geminiEngine")
      : swapEngine;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      {/* Director's Inspector Rail (4 Columns) */}
      <aside className="studio-deck min-w-0 overflow-hidden rounded-lg divide-y divide-white/[0.06] lg:sticky lg:top-18 lg:col-span-4">
        {/* Section 1: Query & Vibe */}
        <div className="space-y-3.5 p-4">
          <h2 className="font-heading text-xs font-semibold tracking-tight text-[#F4F4F5]">
            {t("bg.section.queryVibe")}
          </h2>

          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] font-medium uppercase tracking-wider text-[#8B8D98]">
              {t("bg.vibePresets")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {VIBE_PRESETS.map((vibe) => {
                const isActive = selectedVibe === vibe.value;
                return (
                  <button
                    key={vibe.value}
                    type="button"
                    onClick={() => handleVibeSelect(vibe.value)}
                    aria-pressed={isActive}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      isActive
                        ? "border-amber-500/45 bg-[#13151D] text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "border-white/[0.08] bg-[#13151D]/70 text-[#8B8D98] hover:border-white/[0.15] hover:text-zinc-200"
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
              className="block font-mono text-[10px] font-medium uppercase tracking-wider text-[#8B8D98]"
            >
              {t("bg.sceneLabel")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[#8B8D98]" />
              <Input
                id="aesthetic-search-input"
                data-testid="input-scene-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGenerateClick();
                  }
                }}
                placeholder={t("bg.searchPlaceholder")}
                className="h-8 border-white/[0.08] bg-[#050507] pl-8 pr-7 text-xs text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] placeholder:text-zinc-600 focus-visible:border-amber-500/50"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("bg.clearSearchAria")}
                  title={t("bg.clearSearchAria")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[#8B8D98] hover:text-[#F4F4F5]"
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
              data-testid="btn-generate"
              onClick={handleGenerateClick}
              disabled={isLoading}
              className="h-8.5 min-w-0 flex-1 border border-amber-400/60 bg-amber-500 text-xs font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-amber-400"
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
              data-testid="btn-shuffle"
              onClick={handleShuffleMore}
              disabled={isLoading}
              title={t("bg.shuffleTitle", {
                count: batchSize,
                page: page + 1,
              })}
              className="h-8.5 shrink-0 border-white/[0.1] bg-[#13151D] px-2.5 text-xs font-medium text-zinc-200 hover:border-white/[0.2] hover:bg-[#191c26]"
            >
              <Shuffle className="mr-1.5 size-3.5 shrink-0 text-[#8B8D98]" />
              <span>{t("bg.shuffleButton", { page: page + 1 })}</span>
            </Button>
          </div>
        </div>

        {/* Section 2: Model & Reference */}
        <div className="space-y-3 p-4">
          <h3 className="font-heading text-xs font-semibold tracking-tight text-[#F4F4F5]">
            {t("bg.section.modelReference")}
          </h3>

          {/* My Model Reference Slot */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-200">
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
                className="studio-well group flex cursor-pointer items-center gap-2.5 rounded-md border-dashed p-2.5 transition-colors hover:border-white/[0.2] hover:bg-[#13151D]"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <UserPlus className="size-3.5" />
                </div>
                <span className="min-w-0 truncate text-xs font-medium text-zinc-200">
                  {t("bg.model.uploadTitle")}
                </span>
              </label>
            ) : (
              <div className="studio-elevated flex items-center gap-2.5 rounded-md p-2">
                <div className="relative h-10 w-7.5 shrink-0 overflow-hidden rounded border border-white/[0.12] bg-[#050507]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={myModelPreview}
                    alt={t("bg.model.previewAlt")}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#F4F4F5]">
                  {myModelName || t("bg.model.fallbackName")}
                </span>
                <button
                  type="button"
                  onClick={handleClearMyModel}
                  className="shrink-0 rounded p-1 text-[#8B8D98] transition-colors hover:bg-white/[0.08] hover:text-[#F4F4F5]"
                  title={t("bg.model.removeTitle")}
                  aria-label={t("bg.model.removeTitle")}
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>

          {/* Reference Image Slot */}
          <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
            <span className="block text-[11px] font-medium text-zinc-200">
              {t("bg.referenceTitle")}
            </span>

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
                className="studio-well group flex cursor-pointer items-center gap-2.5 rounded-md border-dashed p-2.5 transition-colors hover:border-white/[0.2] hover:bg-[#13151D]"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded border border-violet-500/30 bg-violet-500/10 text-violet-400">
                  <Eye className="size-3.5" />
                </div>
                <span className="min-w-0 truncate text-xs font-medium text-zinc-200">
                  {t("bg.uploadReference")}
                </span>
              </label>
            ) : (
              <div className="studio-elevated flex items-center gap-2.5 rounded-md p-2">
                <div className="relative h-10 w-7.5 shrink-0 overflow-hidden rounded border border-white/[0.12] bg-[#050507]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={referencePreview}
                    alt={t("bg.referencePreviewAlt")}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-[#F4F4F5]">
                    {referenceFileName || t("bg.referenceFallbackName")}
                  </span>
                  <span className="block text-[10px] text-[#8B8D98]">
                    {visionUsed ? t("bg.visionDna") : t("bg.extractedDna")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearReference}
                  className="shrink-0 rounded p-1 text-[#8B8D98] transition-colors hover:bg-white/[0.08] hover:text-[#F4F4F5]"
                  title={t("bg.removeReferenceTitle")}
                  aria-label={t("bg.removeReferenceTitle")}
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Concise Active Query Readout */}
        <div className="flex items-center gap-1.5 bg-[#050507]/80 px-4 py-2.5 text-[11px] text-[#8B8D98]">
          <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
          <span className="shrink-0">{t("bg.resolvedLabel")}</span>
          <span
            className="truncate font-mono text-zinc-200"
            title={resolvedQuery}
          >
            {resolvedQuery}
          </span>
        </div>
      </aside>

      {/* Right Scene Lightbox Grid (8 Columns) */}
      <section className="min-w-0 space-y-3.5 lg:col-span-8">
        {/* Clean Lightbox Toolbar Header */}
        <div className="studio-deck rounded-lg px-3.5 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="font-heading text-xs font-semibold tracking-tight text-[#F4F4F5] sm:text-sm">
                {t("bg.canvasTitle")}{" "}
                <span
                  data-testid="canvas-count"
                  className="font-mono tabular-nums text-[#8B8D98]"
                >
                  {items.length}/{batchSize}
                </span>
              </h2>

              <span className="rounded border border-white/[0.08] bg-[#13151D] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-300">
                {t("bg.pageBadge", { page })}
              </span>

              {/* Single Clean Batch Source Indicator */}
              <span
                data-testid="badge-batch-source"
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide ${
                  isLiveStock
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                    : "border-white/[0.08] bg-[#13151D] text-zinc-300"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    isLiveStock ? "bg-emerald-400" : "bg-zinc-400"
                  }`}
                />
                <span>
                  {isLiveStock
                    ? t("bg.source.liveStock")
                    : t("bg.source.curatedArchive")}
                </span>
              </span>

              {/* Single Unified 5x / 15x Batch Toggle */}
              <div
                role="group"
                aria-label={t("bg.batch.label")}
                className="studio-well inline-flex h-6 items-center rounded p-0.5 font-mono text-[10px]"
              >
                <button
                  type="button"
                  data-testid="batch-5"
                  onClick={() => handleBatchSizeChange(5)}
                  aria-pressed={batchSize === 5}
                  aria-label={t("bg.batch.fast5")}
                  className={`rounded-[3px] px-1.5 py-0.5 font-medium transition-colors ${
                    batchSize === 5
                      ? "bg-[#F4F4F5] text-[#09090B]"
                      : "text-[#8B8D98] hover:text-[#F4F4F5]"
                  }`}
                >
                  {t("bg.batch.short5")}
                </button>
                <button
                  type="button"
                  data-testid="batch-15"
                  onClick={() => handleBatchSizeChange(15)}
                  aria-pressed={batchSize === 15}
                  aria-label={t("bg.batch.full15")}
                  className={`rounded-[3px] px-1.5 py-0.5 font-medium transition-colors ${
                    batchSize === 15
                      ? "bg-[#F4F4F5] text-[#09090B]"
                      : "text-[#8B8D98] hover:text-[#F4F4F5]"
                  }`}
                >
                  {t("bg.batch.short15")}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* 9:16 Safe Zones Guide Toggle */}
              <button
                type="button"
                data-testid="btn-safe-zones"
                onClick={() => setShowSafeZones((prev) => !prev)}
                aria-pressed={showSafeZones}
                title={t("bg.safeZonesTitle")}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] font-medium transition-colors ${
                  showSafeZones
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                    : "border-white/[0.09] bg-[#13151D] text-zinc-300 hover:border-white/[0.18] hover:text-[#F4F4F5]"
                }`}
              >
                <Scan className="size-3 shrink-0" />
                <span>{t("bg.safeZonesButton")}</span>
              </button>

              {selectedCount > 0 && (
                <button
                  type="button"
                  data-testid="btn-clear-selection"
                  onClick={handleClearSelection}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 font-mono text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
                >
                  <span>
                    {t("bg.clearSelectionButton", { count: selectedCount })}
                  </span>
                  <X className="size-3 shrink-0" />
                </button>
              )}

              <Button
                type="button"
                size="sm"
                data-testid="btn-export-zip"
                onClick={handleDownloadAllZip}
                disabled={isZipping || items.length === 0}
                className={`h-7 max-w-full shrink-0 border px-2.5 text-xs font-semibold transition-colors ${
                  selectedCount > 0
                    ? "border-emerald-400/60 bg-emerald-500 text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-emerald-400"
                    : "border-emerald-500/35 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/22 hover:text-emerald-200"
                }`}
              >
                {isZipping ? (
                  <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin" />
                ) : (
                  <FolderArchive className="mr-1.5 size-3.5 shrink-0" />
                )}
                <span className="truncate">
                  {selectedCount > 0
                    ? t("bg.downloadSelectedZipButton", {
                        count: selectedCount,
                      })
                    : t("bg.downloadZipButton")}
                </span>
              </Button>
            </div>
          </div>

          {isZipping && (
            <div className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
                <span>
                  {t("bg.zipPackaging", {
                    count: zipTargetCount || items.length,
                  })}{" "}
                  <code className="text-[#F4F4F5]">
                    vokaloom-{zipTargetCount || items.length}-backgrounds.zip
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

        {/* 9:16 Scene Plate Grid */}
        <div className="relative">
          {isLoading && items.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-black/50 pt-16 backdrop-blur-[1px]">
              <div className="studio-elevated inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-[#F4F4F5]">
                <Loader2 className="size-3.5 animate-spin text-amber-400" />
                {t("bg.loadingOverlay", { count: batchSize })}
              </div>
            </div>
          )}

          <div
            data-testid="bg-grid"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
          >
            {items.map((item, index) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  data-testid="bg-card"
                  className={`group relative aspect-[9/16] w-full overflow-hidden rounded-lg border bg-[#0B0C10] transition-colors ${
                    isSelected
                      ? "border-amber-400/90 ring-2 ring-amber-500/45"
                      : "border-white/[0.08] hover:border-white/[0.22]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />

                  {/* Minimal Non-Interactive 9:16 Reels / TikTok Safe-Zone Margin Guides */}
                  {showSafeZones && (
                    <div
                      aria-hidden="true"
                      data-testid="safe-zone-guide"
                      className="pointer-events-none absolute inset-0 z-10 select-none"
                    >
                      <div className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-amber-400/60" />
                      <div className="absolute inset-x-0 bottom-0 h-[24%] border-t border-dashed border-amber-400/60" />
                      <div className="absolute top-[12%] right-0 bottom-[24%] w-[14%] border-l border-dashed border-amber-400/60" />
                    </div>
                  )}

                  {/* Calm Top Corner Index + Selection Toggle */}
                  <div className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-center justify-between gap-1 font-mono text-[10px]">
                    <span className="rounded bg-black/75 px-1.5 py-0.5 tabular-nums text-zinc-100">
                      #{index + 1}
                    </span>

                    <button
                      type="button"
                      role="checkbox"
                      data-testid={`select-frame-${index + 1}`}
                      aria-checked={isSelected}
                      aria-label={
                        isSelected
                          ? t("bg.selectFrameRemoveAria", { index: index + 1 })
                          : t("bg.selectFrameAria", { index: index + 1 })
                      }
                      title={
                        isSelected
                          ? t("bg.selectFrameRemoveTitle")
                          : t("bg.selectFrameTitle")
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelectFrame(item.id);
                      }}
                      className={`pointer-events-auto inline-flex size-6 items-center justify-center rounded-md border transition-all ${
                        isSelected
                          ? "border-amber-300 bg-amber-500 text-zinc-950 shadow-sm"
                          : "border-white/25 bg-black/60 text-zinc-200 opacity-85 hover:border-amber-400/75 hover:bg-black/80 hover:opacity-100 sm:opacity-70 sm:group-hover:opacity-100"
                      }`}
                    >
                      <Check
                        className={`size-3.5 ${
                          isSelected ? "stroke-[2.75]" : "opacity-65"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Desktop Hover/Focus Actions */}
                  <div
                    className={`absolute top-1/2 left-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 transition-opacity duration-150 sm:flex ${
                      downloadingId === item.id || swappingItemId === item.id
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    }`}
                  >
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`btn-place-model-${index + 1}`}
                      onClick={() => void handlePlaceModel(item, index)}
                      disabled={swappingItemId === item.id}
                      title={t("bg.placeModelTitle", { index: index + 1 })}
                      aria-label={t("bg.placeModelAria", {
                        index: index + 1,
                        photographer: item.photographer,
                      })}
                      className="h-7 rounded-md border border-amber-400/60 bg-amber-500 px-2.5 text-[11px] font-semibold text-zinc-950 shadow-md hover:bg-amber-400"
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
                      data-testid={`btn-download-single-${index + 1}`}
                      onClick={() => handleDownloadSingle(item, index)}
                      disabled={downloadingId === item.id}
                      title={t("bg.downloadSingleTitle", { index: index + 1 })}
                      aria-label={t("bg.downloadSingleAria", {
                        index: index + 1,
                        photographer: item.photographer,
                      })}
                      className="h-7 rounded-md border border-white/[0.16] bg-[#0B0C10]/90 px-2.5 text-[11px] font-medium text-[#F4F4F5] shadow-md hover:bg-[#F4F4F5] hover:text-zinc-950"
                    >
                      {downloadingId === item.id ? (
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 size-3" />
                      )}
                      {t("bg.hdButton")}
                    </Button>
                  </div>

                  {/* Calm Bottom Scrim & Mobile Touch Controls */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/65 to-transparent p-2 pt-9">
                    <p className="line-clamp-1 text-[11px] font-medium text-[#F4F4F5]">
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-1.5">
                      <span className="flex min-w-0 items-center gap-1 text-[10px] text-zinc-400">
                        <Camera className="size-3 shrink-0" />
                        <span className="truncate">{item.photographer}</span>
                      </span>
                      <div className="pointer-events-auto flex shrink-0 items-center gap-1 sm:hidden">
                        <button
                          type="button"
                          onClick={() => void handlePlaceModel(item, index)}
                          disabled={swappingItemId === item.id}
                          aria-label={t("bg.placeModelAria", {
                            index: index + 1,
                            photographer: item.photographer,
                          })}
                          title={t("bg.placeModelTitle", { index: index + 1 })}
                          className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2 text-[10px] font-semibold text-zinc-950 active:scale-95"
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
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-white/[0.16] bg-[#0B0C10]/90 text-[#F4F4F5] hover:bg-[#F4F4F5] hover:text-zinc-950"
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
              );
            })}
          </div>
        </div>
      </section>

      {/* Model-in-Scene Compositor Before/After Preview Dialog */}
      <Dialog open={swapModalOpen} onOpenChange={setSwapModalOpen}>
        <DialogContent
          data-testid="dialog-model-swap"
          className="studio-deck border-white/[0.12] bg-[#0B0C10] p-5 text-[#F4F4F5] shadow-2xl sm:max-w-md"
        >
          <DialogHeader className="space-y-1 pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="flex items-center gap-2 font-heading text-sm font-semibold text-[#F4F4F5] sm:text-base">
                <Wand2 className="size-4 shrink-0 text-amber-400" />
                <span>{t("bg.swapModal.title")}</span>
              </DialogTitle>
              {resolvedModalEngine && (
                <span className="rounded border border-white/[0.1] bg-[#13151D] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                  {resolvedModalEngine}
                </span>
              )}
            </div>
            {swapTargetItem?.title && (
              <DialogDescription className="text-xs text-[#8B8D98]">
                {swapTargetItem.title}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3">
            {isSwapping ? (
              <div className="studio-well flex aspect-[9/16] max-h-[58vh] w-full flex-col items-center justify-center gap-3 rounded-lg p-6 text-center">
                <Loader2 className="size-7 animate-spin text-amber-400" />
                <p className="text-xs font-semibold text-[#F4F4F5]">
                  {t("bg.swapModal.generating")}
                </p>
              </div>
            ) : swapResultUrl ? (
              <div className="space-y-3">
                {/* Clean Horizontal Before / After Split Comparator */}
                <div className="relative mx-auto aspect-[9/16] max-h-[58vh] overflow-hidden rounded-lg border border-white/[0.12] bg-[#050507] select-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={swapTargetItem?.previewUrl || swapResultUrl}
                    alt={swapTargetItem?.title || t("bg.swapModal.beforeLabel")}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />

                  <div
                    aria-hidden="true"
                    style={{
                      clipPath: `inset(0 0 0 ${comparePosition}%)`,
                    }}
                    className="pointer-events-none absolute inset-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={swapResultUrl}
                      alt={t("bg.swapModal.previewAlt")}
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  {comparePosition > 14 && (
                    <span className="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-200">
                      {t("bg.swapModal.beforeLabel")}
                    </span>
                  )}
                  {comparePosition < 86 && (
                    <span className="pointer-events-none absolute top-2.5 right-2.5 z-10 rounded border border-emerald-400/40 bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                      {t("bg.swapModal.afterLabel")}
                    </span>
                  )}

                  <div
                    aria-hidden="true"
                    style={{ left: `${comparePosition}%` }}
                    className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.85)]"
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      left: `clamp(14px, ${comparePosition}%, calc(100% - 14px))`,
                    }}
                    className="pointer-events-none absolute top-1/2 z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-[#0B0C10]/95 text-amber-400 shadow-lg"
                  >
                    <MoveHorizontal className="size-3.5" />
                  </div>

                  <input
                    type="range"
                    data-testid="slider-compare"
                    min={0}
                    max={100}
                    value={comparePosition}
                    onChange={(e) => setComparePosition(Number(e.target.value))}
                    aria-label={t("bg.swapModal.compareAria")}
                    className="absolute inset-0 z-20 m-0 h-full w-full cursor-ew-resize opacity-0"
                  />
                </div>

                {swapIsFallback && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    {t("bg.swapModal.fallbackNote")}
                  </p>
                )}

                <Button
                  type="button"
                  data-testid="btn-download-composite"
                  onClick={handleDownloadSwapResult}
                  className="h-9 w-full border border-emerald-400/50 bg-emerald-500 text-xs font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-emerald-400"
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
