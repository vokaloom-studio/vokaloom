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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  const handleReferenceFileChange = (
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

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "");
      setReferencePreview(base64);
      setReferenceMimeType(file.type);
      setReferenceFileName(file.name);
      toast.info(
        "Analyzing Boss Reference Image aesthetic & matching 15 backgrounds..."
      );
      void fetchBatch({
        targetPage: 1,
        refBase64: base64,
        refMime: file.type,
        consumeQuota: true,
      });
    };
    reader.readAsDataURL(file);
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
      let blob: Blob;
      try {
        const res = await fetch(item.downloadUrl);
        if (!res.ok) throw new Error("Image fetch failed");
        blob = await res.blob();
      } catch {
        blob = await generateOfflineVerticalFallbackBlob(item, index);
      }

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
          let blob: Blob;
          try {
            const response = await fetch(item.downloadUrl);
            if (!response.ok) throw new Error("Direct fetch failed");
            blob = await response.blob();
          } catch {
            blob = await generateOfflineVerticalFallbackBlob(item, index);
          }

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
    <div className="space-y-6">
      {/* Control Deck: Vibe Presets, Search & Boss Reference Image Dropzone */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 7 Columns: Vibe Preset Chips + Keyword Input + Action Bar */}
        <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100 lg:col-span-7">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                <Sparkles className="size-4 text-violet-400" />
                1. Aesthetic Vibe &amp; Keyword Engine
              </CardTitle>
              <Badge
                variant="outline"
                className="border-violet-500/30 bg-violet-500/10 text-[11px] text-violet-300"
              >
                Batch Size: 15x Vertical (9:16)
              </Badge>
            </div>
            <CardDescription className="text-xs text-zinc-400">
              Select a candid Instagram vibe preset or type specific scene
              details to pull 15 real portrait backgrounds.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Vibe Preset Chips */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-300">
                Vibe Presets
              </span>
              <div className="flex flex-wrap gap-2">
                {VIBE_PRESETS.map((vibe) => {
                  const isActive = selectedVibe === vibe;
                  return (
                    <button
                      key={vibe}
                      type="button"
                      onClick={() => handleVibeSelect(vibe)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        isActive
                          ? "border-violet-500 bg-violet-600 text-white shadow-sm shadow-violet-600/30"
                          : "border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
                      }`}
                    >
                      {vibe}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Keyword Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="aesthetic-search-input"
                className="text-xs font-medium text-zinc-300"
              >
                Custom Scene / Aesthetic Modifier (Optional)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
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
                  placeholder="e.g. Mediterranean balcony morning espresso sunlight..."
                  className="h-9 border-zinc-800 bg-zinc-950/90 pl-9 text-sm text-white placeholder:text-zinc-500"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Button
                type="button"
                onClick={handleGenerateClick}
                disabled={isLoading}
                className="bg-violet-600 text-white hover:bg-violet-500"
              >
                {isLoading ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 size-4" />
                )}
                Generate 15 Backgrounds
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleShuffleMore}
                disabled={isLoading}
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
              >
                <Shuffle className="mr-1.5 size-4" />
                Shuffle 15 More (Page #{page + 1})
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={handleDownloadAllZip}
                disabled={isZipping || items.length === 0}
                className="ml-auto border border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              >
                {isZipping ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <FolderArchive className="mr-1.5 size-4" />
                )}
                Download All 15 (.ZIP)
              </Button>
            </div>

            {/* Live ZIP Progress Bar */}
            {isZipping && (
              <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span>
                    Bundling 15 vertical HD photos into{" "}
                    <code className="text-violet-300">
                      vokaloom-15-backgrounds.zip
                    </code>
                    ...
                  </span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {zipProgress}%
                  </span>
                </div>
                <Progress value={zipProgress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right 5 Columns: Boss Reference Image Aesthetic Matcher (Gemini 2.5 Flash) */}
        <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100 lg:col-span-5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                <Eye className="size-4 text-violet-400" />
                2. Boss Reference Image Matcher
              </CardTitle>
              <Badge
                variant="outline"
                className="border-zinc-700 bg-zinc-950 text-[10px] text-zinc-300"
              >
                Gemini 2.5 Flash Vision
              </Badge>
            </div>
            <CardDescription className="text-xs text-zinc-400">
              Drop a screenshot or sample photo from your boss/client to extract
              its aesthetic DNA and auto-pull 15 matching photos.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
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
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-800 bg-zinc-950/60 px-4 py-6 text-center transition-colors hover:border-violet-500/60 hover:bg-zinc-950"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-violet-500/10 text-violet-400">
                  <Upload className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">
                    Click to upload Boss Reference Photo
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Supports .JPG, .PNG, .WEBP (up to 5 MB)
                  </p>
                </div>
              </label>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-violet-500/30 bg-zinc-950/80 p-3">
                <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={referencePreview}
                    alt="Boss Reference Preview"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-white">
                      {referenceFileName || "Reference Image"}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearReference}
                      className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      title="Remove reference image"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    {visionUsed
                      ? "Analyzed with Gemini 2.5 Flash Vision:"
                      : "Extracted Aesthetic Search DNA:"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {extractedTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="border border-violet-500/30 bg-violet-500/15 px-1.5 py-0 text-[10px] text-violet-200"
                      >
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Resolved Aesthetic Query Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                <span>Active Query:</span>
                <span className="font-medium text-zinc-200">
                  &ldquo;{resolvedQuery}&rdquo;
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {extractedTags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3x5 Responsive Portrait Grid (15 Cards) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">
              Vertical 9:16 Aesthetic Batch ({items.length} / 15 Photos)
            </h2>
            <Badge
              variant="outline"
              className="border-zinc-800 bg-zinc-900 text-[11px] text-zinc-400"
            >
              Page #{page}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400">
            Click any card to download individual 1080×1920 vertical HD or use{" "}
            <strong className="text-zinc-200">Download All 15 (.ZIP)</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-900/70 transition-all hover:border-violet-500/60 hover:shadow-lg hover:shadow-violet-950/30"
            >
              {/* 9:16 Portrait Container */}
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* Top Badges */}
                <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-1">
                  <Badge className="bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                    #{index + 1} · {item.aspect}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-white/20 bg-black/65 px-1.5 py-0.5 text-[10px] uppercase text-zinc-200 backdrop-blur-xs"
                  >
                    {item.source}
                  </Badge>
                </div>

                {/* Bottom Overlay with Attribution & 1-Click Download */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-8">
                  <p className="line-clamp-1 text-[11px] font-medium text-white">
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1 truncate text-[10px] text-zinc-300">
                      <Camera className="size-3 shrink-0 text-violet-400" />
                      <span className="truncate">{item.photographer}</span>
                    </span>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="secondary"
                      onClick={() => handleDownloadSingle(item, index)}
                      disabled={downloadingId === item.id}
                      title={`Download #${index + 1} HD`}
                      className="shrink-0 bg-white/90 text-zinc-950 hover:bg-white"
                    >
                      {downloadingId === item.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Download className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
