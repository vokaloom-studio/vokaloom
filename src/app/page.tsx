"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Image as ImageIcon,
  Mic,
  Crown,
  Download,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackgroundFinder } from "@/components/background-finder";
import { VoiceStudio } from "@/components/voice-studio";
import { PaywallModal } from "@/components/paywall-modal";
import {
  getQuotaState,
  verifyAndActivateAccessCode,
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
    role: "guest",
    totalGenerations: 0,
  });
  const [activeTab, setActiveTab] = useState<string>("backgrounds");
  const [isPaywallOpen, setIsPaywallOpen] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const keyParam = params.get("key");

      if (keyParam) {
        void verifyAndActivateAccessCode(keyParam).then((res) => {
          if (res.success) {
            setQuota(res.state);
            toast.success(
              "VIP Access unlocked via invite link! Unlimited generations active."
            );
          } else {
            setQuota(getQuotaState());
          }
        });
      } else {
        setQuota(getQuotaState());
      }
    });

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
                {quota.role === "operator"
                  ? "Operator Mode: Unlimited"
                  : "Pro Pass: Unlimited"}
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

            {/* Admin Panel Link (visible when Operator / Pro Mode is active) */}
            {quota.isOperator && (
              <Link
                href="/admin"
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 hover:text-white"
              >
                <Settings className="size-3.5" />
                Admin Panel
              </Link>
            )}

            {/* Upgrade to Pro Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPaywallOpen(true)}
              className="border-violet-500/40 bg-violet-500/10 text-xs font-medium text-violet-200 hover:bg-violet-500/20 hover:text-white"
            >
              <Crown className="mr-1.5 size-3.5" />
              Upgrade to Pro
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

            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>Commercial-Safe Pipeline:</span>
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
                Gemini Neural TTS + Kokoro-82M + F5-TTS
              </Badge>
            </div>
          </div>

          {/* Tab 1: Aesthetic Backgrounds (15x) */}
          <TabsContent value="backgrounds" className="mt-0 flex-1">
            <BackgroundFinder
              onRequirePaywall={() => setIsPaywallOpen(true)}
            />
          </TabsContent>

          {/* Tab 2: Realistic Voice Studio */}
          <TabsContent value="voice" className="mt-0 flex-1">
            <VoiceStudio onRequirePaywall={() => setIsPaywallOpen(true)} />
          </TabsContent>
        </Tabs>
      </main>

      {/* $15 USD / $60,000 COP Paywall & Client Access Code Activation Modal */}
      <PaywallModal
        open={isPaywallOpen}
        onOpenChange={setIsPaywallOpen}
        quota={quota}
        onQuotaChange={setQuota}
      />
    </div>
  );
}
