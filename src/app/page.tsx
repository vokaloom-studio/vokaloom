"use client";

import React, { useEffect, useState } from "react";
import {
  Sparkles,
  Image as ImageIcon,
  Mic,
  KeyRound,
  Download,
  ShieldCheck,
  RotateCcw,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackgroundFinder } from "@/components/background-finder";
import { VoiceStudio } from "@/components/voice-studio";
import {
  getQuotaState,
  activateOperatorKey,
  resetTrialForDemo,
  QUOTA_UPDATED_EVENT,
  type QuotaState,
} from "@/lib/quota";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function VokaloomStudioPage() {
  const [quota, setQuota] = useState<QuotaState>({
    creditsRemaining: 3,
    maxTrialCredits: 3,
    isOperator: false,
    totalGenerations: 0,
  });
  const [activeTab, setActiveTab] = useState<string>("backgrounds");
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [operatorKeyInput, setOperatorKeyInput] = useState<string>("");
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setQuota(getQuotaState());

    const handleQuotaUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<QuotaState>;
      if (customEvent.detail) {
        setQuota(customEvent.detail);
      } else {
        setQuota(getQuotaState());
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener(QUOTA_UPDATED_EVENT, handleQuotaUpdate);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(QUOTA_UPDATED_EVENT, handleQuotaUpdate);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);

  const handleUnlockOperator = (e: React.FormEvent) => {
    e.preventDefault();
    const result = activateOperatorKey(operatorKeyInput);
    if (result.success) {
      setQuota(result.state);
      setOperatorKeyInput("");
      setIsKeyModalOpen(false);
      toast.success("Operator Mode Activated — Unlimited production unlocked!");
    } else {
      toast.error(
        "Invalid Operator Key. Try VOKALOOM-ADMIN-2026 for demo operator mode."
      );
    }
  };

  const handleResetTrial = () => {
    const fresh = resetTrialForDemo();
    setQuota(fresh);
    toast.info("Trial reset to 3/3 free credits for demo testing.");
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        toast.success("Installing Vokaloom Studio as a standalone app...");
      }
      setDeferredPrompt(null);
      return;
    }
    toast.info(
      "Install PWA: Click the Install icon in your browser's address bar (or 'Add to Home Screen' on iOS/Android) to run Vokaloom Studio as a standalone app."
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Top Studio Header Bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/20">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                  Vokaloom Studio
                </h1>
                <Badge
                  variant="outline"
                  className="hidden border-zinc-700 bg-zinc-900 text-[10px] font-medium text-zinc-400 sm:inline-flex"
                >
                  MIT Commercial Safe
                </Badge>
              </div>
              <p className="text-xs text-zinc-400">
                15x Aesthetic Background Engine &amp; Realistic AI Voiceover
                Workstation
              </p>
            </div>
          </div>

          {/* Right Status & Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Live Credit Badge */}
            {quota.isOperator ? (
              <Badge className="border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                <ShieldCheck className="mr-1.5 size-3.5" />
                Operator Mode: Unlimited
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className={`border px-2.5 py-1 text-xs font-semibold ${
                  quota.creditsRemaining > 0
                    ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                    : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                }`}
              >
                Trial Credits: {quota.creditsRemaining}/{quota.maxTrialCredits}{" "}
                left
              </Badge>
            )}

            {/* Unlock Pro / Operator Key Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsKeyModalOpen(true)}
              className="border-violet-500/40 bg-violet-500/10 text-xs font-medium text-violet-200 hover:bg-violet-500/20 hover:text-white"
            >
              <KeyRound className="mr-1.5 size-3.5" />
              Unlock Pro / Operator Key
            </Button>

            {/* Demo Reset Trial Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetTrial}
              title="Reset trial credits to 3/3 for demo"
              className="text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            >
              <RotateCcw className="mr-1 size-3.5" />
              <span className="hidden md:inline">Reset Demo</span>
            </Button>

            {/* Install App PWA Hint */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallPwa}
              className="border-zinc-800 bg-zinc-900/90 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <Download className="mr-1.5 size-3.5" />
              Install App
            </Button>
          </div>
        </div>
      </header>

      {/* Main Two-Tab Studio Workspace */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            if (val) setActiveTab(String(val));
          }}
          className="flex flex-1 flex-col gap-6"
        >
          <div className="flex flex-col items-start justify-between gap-4 border-b border-zinc-800/80 pb-4 sm:flex-row sm:items-center">
            <TabsList className="h-10 w-full bg-zinc-900/90 p-1 sm:w-auto">
              <TabsTrigger
                value="backgrounds"
                className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold sm:text-sm data-active:bg-violet-600 data-active:text-white"
              >
                <ImageIcon className="size-4" />
                Aesthetic Backgrounds (15x)
              </TabsTrigger>
              <TabsTrigger
                value="voice"
                className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold sm:text-sm data-active:bg-violet-600 data-active:text-white"
              >
                <Mic className="size-4" />
                Realistic Voice Studio
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span> Commercial-Safe Pipeline:</span>
              <Badge
                variant="outline"
                className="border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-300"
              >
                Pexels + Unsplash + Gemini 2.5 Flash
              </Badge>
              <Badge
                variant="outline"
                className="border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-300"
              >
                Kokoro-82M (Apache-2.0) + F5-TTS (MIT)
              </Badge>
            </div>
          </div>

          {/* Tab 1: Aesthetic Backgrounds (15x) */}
          <TabsContent value="backgrounds" className="mt-0 flex-1">
            <BackgroundFinder
              onRequirePaywall={() => setIsKeyModalOpen(true)}
            />
          </TabsContent>

          {/* Tab 2: Realistic Voice Studio */}
          <TabsContent value="voice" className="mt-0 flex-1">
            <VoiceStudio onRequirePaywall={() => setIsKeyModalOpen(true)} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Operator Key / Pro Pass Modal Shell */}
      <Dialog open={isKeyModalOpen} onOpenChange={setIsKeyModalOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Crown className="size-5 text-violet-400" />
              Unlock Vokaloom Pro / Operator Mode
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Enter your Operator Master Key for unlimited daily agency
              production or upgrade to the $15 USD ($60,000 COP) Pro Pass.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUnlockOperator} className="space-y-4 py-2">
            <div className="space-y-2">
              <label
                htmlFor="operator-key-input"
                className="text-xs font-medium text-zinc-300"
              >
                Operator / VIP Access Key
              </label>
              <Input
                id="operator-key-input"
                placeholder="e.g. VOKALOOM-ADMIN-2026"
                value={operatorKeyInput}
                onChange={(e) => setOperatorKeyInput(e.target.value)}
                className="border-zinc-800 bg-zinc-900 text-white"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                className="w-full bg-violet-600 text-white hover:bg-violet-500"
              >
                Activate Operator Key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
