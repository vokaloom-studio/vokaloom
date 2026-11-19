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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top Minimalist Command Bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#050507]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* Brand Identity */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-violet-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
              <Sparkles className="size-3.5" />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-tight text-white">
                Vokaloom Studio
              </h1>
              <Badge
                variant="outline"
                className="hidden border-white/[0.08] bg-white/[0.03] px-1.5 py-0 font-mono text-[10px] font-medium text-zinc-400 sm:inline-flex"
              >
                MIT
              </Badge>
            </div>
          </div>

          {/* Right Status & Grouped Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Live Quota / Mode Status Pill */}
            {quota.isOperator ? (
              <Badge
                variant="outline"
                className="h-7 border-emerald-500/30 bg-emerald-500/10 px-2.5 font-mono text-[11px] font-medium text-emerald-300"
              >
                <ShieldCheck className="mr-1.5 size-3" />
                {quota.role === "operator" ? "Operator" : "Pro Pass"}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={`h-7 px-2.5 font-mono text-[11px] font-medium tabular-nums ${
                  quota.creditsRemaining > 0
                    ? "border-white/[0.08] bg-white/[0.03] text-zinc-300"
                    : "border-amber-500/35 bg-amber-500/10 text-amber-300"
                }`}
              >
                <span
                  className={`mr-1.5 size-1.5 rounded-full ${
                    quota.creditsRemaining > 0
                      ? "bg-violet-400"
                      : "bg-amber-400"
                  }`}
                />
                {quota.creditsRemaining}/{quota.maxTrialCredits} credits
              </Badge>
            )}

            <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />

            {/* Admin Panel Link (visible when Operator / Pro Mode is active) */}
            {quota.isOperator && (
              <Link
                href="/admin"
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
              >
                <Settings className="size-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}

            {/* Upgrade to Pro CTA */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPaywallOpen(true)}
              className="h-7 border-violet-500/35 bg-violet-500/15 px-2.5 text-xs font-medium text-violet-200 hover:border-violet-400/50 hover:bg-violet-500/25 hover:text-white"
            >
              <Crown className="mr-1.5 size-3.5 text-violet-300" />
              <span>Upgrade</span>
            </Button>

            {/* Install App PWA Hint */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallPwa}
              className="h-7 border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-zinc-300 hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
            >
              <Download className="size-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Install App</span>
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
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            {/* Floating Pill-Style Segmented Control Switcher */}
            <TabsList className="inline-flex h-10 w-full items-center rounded-full border border-white/[0.08] bg-zinc-900/60 p-1 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] sm:w-auto">
              <TabsTrigger
                value="backgrounds"
                className="flex items-center gap-2 rounded-full border border-transparent px-4 py-1.5 text-xs font-medium text-zinc-400 transition-all hover:text-zinc-200 data-active:border-white/10 data-active:bg-white/[0.1] data-active:text-white data-active:shadow-sm dark:data-active:border-white/10 dark:data-active:bg-white/[0.1] dark:data-active:text-white"
              >
                <ImageIcon className="size-3.5 text-violet-400" />
                Aesthetic Backgrounds (15x)
              </TabsTrigger>
              <TabsTrigger
                value="voice"
                className="flex items-center gap-2 rounded-full border border-transparent px-4 py-1.5 text-xs font-medium text-zinc-400 transition-all hover:text-zinc-200 data-active:border-white/10 data-active:bg-white/[0.1] data-active:text-white data-active:shadow-sm dark:data-active:border-white/10 dark:data-active:bg-white/[0.1] dark:data-active:text-white"
              >
                <Mic className="size-3.5 text-violet-400" />
                Realistic Voice Studio
              </TabsTrigger>
            </TabsList>

            <p className="hidden font-mono text-[11px] text-zinc-500 md:block">
              Pexels · Unsplash · Gemini 2.5 · Kokoro-82M · F5-TTS
            </p>
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
