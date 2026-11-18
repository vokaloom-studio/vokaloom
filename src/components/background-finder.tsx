"use client";

import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Sparkles,
  Shuffle,
  Download,
  Upload,
  X,
  Camera,
  Eye,
  FolderArchive,
  Search,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { consumeCredit } from "@/lib/quota";
import type { BackgroundItem } from "@/app/api/backgrounds/route";

export interface BackgroundFinderProps {
  onRequirePaywall: () => void;
}

const VIBE_PRESETS = [
  "Luxury Travel",
  "Candid Lifestyle",
  "Minimalist Cafe",
  "Urban Street POV",
  "Nature Sunset",
] as const;

interface BackgroundsApiResponse {
  items: BackgroundItem[];
  count: number;
  resolvedQuery: string;
  extractedTags: string[];
  visionUsed: boolean;
  isCuratedFallback: boolean;
  page: number;
}

/**
 * Compresses any uploaded reference photo (up to 5 MB) down to ~120 KB JPEG
 * using an HTML5 Canvas so Vercel's 4.5 MB serverless body limit is never exceeded.
 */
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

async function generateOfflineVerticalFallbackBlob(
  item: BackgroundItem,
  index: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
    grad.addColorStop(0, "#1e1b4b");
    grad.addColorStop(0.5, "#311042");
    grad.addColorStop(1, "#09090b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "bold 46px sans-serif";
    ctx.fillText(`Vokaloom 9:16 Aesthetic #${index + 1}`, 80, 880);
    ctx.font = "34px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(item.title.slice(0, 42), 80, 950);
    ctx.fillText(`Photo by ${item.photographer}`, 80, 1010);
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
  index: number
): Promise<Blob> {
  const proxiedEndpoint = `/api/backgrounds?proxyUrl=${encodeURIComponent(
    item.downloadUrl
  )}`;
  try {
    const proxyRes = await fetch(proxiedEndpoint);
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

  return generateOfflineVerticalFallbackBlob(item, index);
}

export function BackgroundFinder({ onRequirePaywall }: BackgroundFinderProps) {
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

  // Reference Image State
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceMimeType, setReferenceMimeType] =
    useState<string>("image/jpeg");
  const [referenceFileName, setReferenceFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ZIP Export State
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchBatch = async (opts: {
    targetPage: number;
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
          "Free trial credits exhausted (0/3). Unlock Vokaloom Pro or enter your Operator Key!"
        );
        onRequirePaywall();
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/backgrounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: opts.queryOverride ?? query,
          vibe: opts.vibeOverride ?? selectedVibe,
          page: opts.targetPage,
          referenceImageBase64:
            opts.refBase64 !== undefined
              ? opts.refBase64 || undefined
              : referencePreview || undefined,
          mimeType: opts.refMime || referenceMimeType,
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

      if (opts.consumeQuota) {
        toast.success(
          `Loaded ${data.items.length} vertical (9:16) backgrounds for "${data.resolvedQuery}"`
        );
      }
    } catch (error) {
      console.error("Failed to fetch backgrounds:", error);
      toast.error(
        "Network error fetching backgrounds. Please try again in a moment."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Load initial showcase batch on mount without deducting a trial credit
  useEffect(() => {
    let active = true;
    fetch("/api/backgrounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "",
        vibe: "Luxury Travel",
        page: 1,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BackgroundsApiResponse | null) => {
        if (!active || !data) return;
        setItems(data.items || []);
        setResolvedQuery(data.resolvedQuery || "Luxury Travel candid vertical");
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
      consumeQuota: true,
    });
  };

  const handleShuffleMore = () => {
    const nextPage = page + 1;
    void fetchBatch({
      targetPage: nextPage,
      consumeQuota: true,
    });
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
      toast.error("Please upload a .JPG, .PNG, or .WEBP reference image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Reference image must be 5 MB or smaller.");
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
      toast.info(
        "Analyzing Boss Reference Image aesthetic & matching 15 backgrounds..."
      );
      void fetchBatch({
        targetPage: 1,
        refBase64: base64,
        refMime: mimeType,
        consumeQuota: true,
      });
    } catch {
      toast.error("Could not process reference image.");
    }
  };

  const handleClearReference = () => {
    setReferencePreview(null);
    setReferenceFileName("");
    setVisionUsed(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast.info("Cleared reference image filter.");
  };

  const handleDownloadSingle = async (item: BackgroundItem, index: number) => {
    setDownloadingId(item.id);
    try {
      const blob = await fetchImageBlobWithCorsProxy(item, index);

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
      toast.success(`Downloaded #${index + 1} (${item.photographer})`);
    } catch {
      toast.error("Could not download photo.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAllZip = async () => {
    if (items.length === 0) {
      toast.warning("Generate a batch of 15 backgrounds first.");
      return;
    }

    setIsZipping(true);
    setZipProgress(5);

    try {
      const zip = new JSZip();
      const folder = zip.folder("vokaloom-15-backgrounds");
      let completedCount = 0;

      await Promise.all(
        items.map(async (item, index) => {
          const blob = await fetchImageBlobWithCorsProxy(item, index);

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

      // Include commercial attribution & query metadata inside the ZIP archive
      const attributionLines = [
        "VOKALOOM STUDIO — 15x AESTHETIC BACKGROUND BATCH",
        `Generated Query: ${resolvedQuery}`,
        `Vibe Preset: ${selectedVibe}`,
        `Aspect Ratio: 9:16 Vertical (Instagram Reels / Stories / Posts)`,
        "",
        "PHOTOGRAPHER ATTRIBUTIONS (Pexels / Unsplash Commercial Safe):",
        ...items.map(
          (item, i) =>
            `${String(i + 1).padStart(2, "0")}. "${item.title}" — Photo by ${item.photographer} (${item.source.toUpperCase()})`
        ),
      ];
      folder?.file("README-ATTRIBUTION.txt", attributionLines.join("\n"));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      setZipProgress(100);

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vokaloom-15-backgrounds.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Downloaded vokaloom-15-backgrounds.zip (15 HD photos)!");
    } catch (error) {
      console.error("ZIP compression error:", error);
      toast.error("Failed to package ZIP archive. Try individual downloads.");
    } finally {
      setTimeout(() => {
        setIsZipping(false);
        setZipProgress(0);
      }, 600);
    }
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12">
      {/* Left Inspector (4 Columns): Compact, Dense Ergonomic Controls */}
      <aside className="glass-panel overflow-hidden rounded-xl divide-y divide-white/[0.06] lg:sticky lg:top-20 lg:col-span-4">
        {/* Inspector Title Bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-violet-400" />
            <h2 className="text-xs font-semibold tracking-tight text-white">
              Aesthetic Inspector
            </h2>
          </div>
          <Badge
            variant="outline"
            className="border-white/10 bg-white/[0.04] px-2 py-0 font-mono text-[10px] font-medium text-zinc-300"
          >
            15x · 9:16 HD
          </Badge>
        </div>

        {/* Section 1: Vibe Presets */}
        <div className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Vibe Presets
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {selectedVibe}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VIBE_PRESETS.map((vibe) => {
              const isActive = selectedVibe === vibe;
              return (
                <button
                  key={vibe}
                  type="button"
                  onClick={() => handleVibeSelect(vibe)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all ${
                    isActive
                      ? "border-violet-500/60 bg-violet-500/20 text-white shadow-xs"
                      : "border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:bg-white/[0.05] hover:text-zinc-200"
                  }`}
                >
                  {vibe}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Custom Scene Search & Generation Actions */}
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <label
              htmlFor="aesthetic-search-input"
              className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400"
            >
              Scene / Keyword Modifier
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
                placeholder="Mediterranean balcony morning sunlight..."
                className="h-8 border-white/[0.08] bg-zinc-950/80 pl-8 pr-7 text-xs text-white placeholder:text-zinc-500 focus-visible:border-violet-500/60"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search query"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleGenerateClick}
              disabled={isLoading}
              className="h-8 bg-violet-600 text-xs font-medium text-white hover:bg-violet-500"
            >
              {isLoading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              Generate 15 Backgrounds
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleShuffleMore}
              disabled={isLoading}
              title={`Load 15 more photos (Page #${page + 1})`}
              className="h-8 border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-zinc-200 hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
            >
              <Shuffle className="mr-1.5 size-3.5 text-zinc-400" />
              Shuffle #{page + 1}
            </Button>
          </div>
        </div>

        {/* Section 3: Compact Boss Reference Matcher (Gemini 2.5 Flash Vision) */}
        <div className="space-y-2.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Eye className="size-3.5 text-violet-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Boss Reference Matcher
              </span>
            </div>
            <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
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
              className="group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/[0.12] bg-zinc-950/60 p-2.5 transition-colors hover:border-violet-500/50 hover:bg-zinc-950/90"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-violet-500/25 bg-violet-500/10 text-violet-400 transition-colors group-hover:bg-violet-500/20">
                <Upload className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-200">
                  Upload reference image
                </p>
                <p className="text-[10px] text-zinc-500">
                  JPG, PNG, WEBP · auto-matches 15 photos
                </p>
              </div>
            </label>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-violet-500/30 bg-zinc-950/80 p-2.5">
              <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referencePreview}
                  alt="Boss Reference Preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate text-xs font-medium text-white">
                    {referenceFileName || "Reference Image"}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearReference}
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                    title="Remove reference image"
                  >
                    <X className="size-3" />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400">
                  {visionUsed
                    ? "Gemini 2.5 Vision DNA:"
                    : "Extracted Search DNA:"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {extractedTags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Active Aesthetic DNA Telemetry */}
        <div className="space-y-2 bg-zinc-950/40 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
            <span className="shrink-0 text-zinc-500">Resolved:</span>
            <span className="truncate font-medium text-zinc-200" title={resolvedQuery}>
              &ldquo;{resolvedQuery}&rdquo;
            </span>
          </div>
          {extractedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {extractedTags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Right Canvas (8 Columns): Floating Header + Elevated 9:16 Photo Grid */}
      <section className="space-y-4 lg:col-span-8">
        {/* Floating Canvas Header */}
        <div className="glass-panel rounded-xl px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h2 className="text-sm font-semibold tracking-tight text-white">
                Aesthetic Canvas:{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {items.length} / 15
                </span>
              </h2>

              <Badge
                variant="outline"
                className="border-white/10 bg-white/[0.05] px-2 py-0 font-mono text-[10px] font-medium text-zinc-300 backdrop-blur-md"
              >
                Page #{page}
              </Badge>

              <div className="hidden items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[11px] text-zinc-400 sm:inline-flex">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span className="max-w-[240px] truncate" title={resolvedQuery}>
                  {resolvedQuery}
                </span>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleDownloadAllZip}
              disabled={isZipping || items.length === 0}
              className="h-8 shrink-0 border border-emerald-500/30 bg-emerald-500/15 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 hover:text-white"
            >
              {isZipping ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <FolderArchive className="mr-1.5 size-3.5" />
              )}
              Download All (.ZIP)
            </Button>
          </div>

          {/* Live ZIP Progress Bar */}
          {isZipping && (
            <div className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>
                  Packaging 15 vertical HD photos into{" "}
                  <code className="text-violet-300">
                    vokaloom-15-backgrounds.zip
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

        {/* 15-Photo Frameless 9:16 Grid */}
        <div className="relative">
          {isLoading && items.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-black/40 pt-16 backdrop-blur-[2px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-3.5 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-md">
                <Loader2 className="size-3.5 animate-spin text-violet-400" />
                Curating 15 vertical backgrounds...
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="group relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/[0.08] transition-all duration-300 hover:ring-white/25"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />

                {/* Top Glassmorphic Telemetry Badges */}
                <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between gap-1">
                  <span className="inline-flex items-center rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/90 tabular-nums backdrop-blur-md">
                    #{index + 1} · {item.aspect}
                  </span>
                  <span className="inline-flex items-center rounded-md border border-white/10 bg-black/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-200 backdrop-blur-md">
                    {item.source}
                  </span>
                </div>

                {/* Hover Quick Download Pill (Top/Center-Right Action on Hover, Always Accessible on Focus/Loading) */}
                <div
                  className={`absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${
                    downloadingId === item.id
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100"
                  }`}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownloadSingle(item, index)}
                    disabled={downloadingId === item.id}
                    title={`Download #${index + 1} HD`}
                    className="h-8 rounded-full border border-white/15 bg-black/70 px-3 text-[11px] font-medium text-white shadow-lg backdrop-blur-md hover:bg-white hover:text-zinc-950"
                  >
                    {downloadingId === item.id ? (
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 size-3" />
                    )}
                    HD
                  </Button>
                </div>

                {/* Bottom Attribution & Mobile-Accessible Quick Download */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 pt-10">
                  <p className="line-clamp-1 text-[11px] font-medium tracking-tight text-white/95">
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-1.5">
                    <span className="flex min-w-0 items-center gap-1 text-[10px] text-zinc-300/90">
                      <Camera className="size-3 shrink-0 text-violet-400" />
                      <span className="truncate">{item.photographer}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingle(item, index)}
                      disabled={downloadingId === item.id}
                      aria-label={`Download photo #${index + 1} by ${item.photographer}`}
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/60 text-zinc-200 backdrop-blur-md transition-colors hover:bg-white hover:text-zinc-950 sm:hidden"
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
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
