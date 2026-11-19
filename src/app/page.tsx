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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackgroundFinder } from "@/components/background-finder";
import { VoiceStudio } from "@/components/voice-studio";
import { PaywallModal } from "@/components/paywall-modal";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";
import { getStoredClientLocale, translate } from "@/lib/i18n";
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
  const { t } = useLocale();
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
      const currentLocale = getStoredClientLocale();
      const params = new URLSearchParams(window.location.search);
      const keyParam = params.get("key");

      if (keyParam) {
        void verifyAndActivateAccessCode(keyParam, currentLocale).then(
          (res) => {
            if (res.success) {
              setQuota(res.state);
              toast.success(
                translate(getStoredClientLocale(), "page.vipUnlockedToast")
              );
            } else {
              setQuota(getQuotaState());
            }
          }
        );
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
        toast.success(t("page.installAcceptedToast"));
      }
      setDeferredPrompt(null);
      return;
    }
    toast.info(t("page.installHintToast"));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070709] text-[#f4f4f6]">
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          if (val) setActiveTab(String(val));
        }}
        className="flex flex-1 flex-col gap-0"
      >
        {/* Top Workbench Tool Header */}
        <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#070709]/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:h-13 lg:flex-nowrap lg:py-0">
            {/* Left: Clean Brand Identity */}
            <div className="order-1 flex min-w-0 items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-[#131318] text-zinc-100">
                <Sparkles className="size-3.5 text-violet-400" />
              </div>
              <h1 className="truncate text-[13px] font-semibold tracking-tight text-zinc-100 sm:text-sm">
                {t("page.brandName")}
              </h1>
            </div>

            {/* Center: Segmented Workbench Tab Switcher */}
            <div className="order-3 w-full border-t border-zinc-800/80 pt-2 lg:order-2 lg:w-auto lg:border-0 lg:pt-0">
              <TabsList className="grid h-8 w-full grid-cols-2 rounded-md border border-zinc-800/80 bg-[#0c0c10] p-0.5 lg:inline-flex lg:w-auto">
                <TabsTrigger
                  value="backgrounds"
                  className="flex min-w-0 items-center justify-center gap-1.5 rounded-[4px] border border-transparent px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200 data-active:border-zinc-700/80 data-active:bg-[#16161d] data-active:text-zinc-100 data-active:shadow-none dark:data-active:border-zinc-700/80 dark:data-active:bg-[#16161d] dark:data-active:text-zinc-100 lg:flex-initial lg:px-3.5"
                >
                  <ImageIcon className="size-3.5 shrink-0 text-violet-400" />
                  <span className="truncate">{t("page.tabBackgrounds")}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="voice"
                  className="flex min-w-0 items-center justify-center gap-1.5 rounded-[4px] border border-transparent px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200 data-active:border-zinc-700/80 data-active:bg-[#16161d] data-active:text-zinc-100 data-active:shadow-none dark:data-active:border-zinc-700/80 dark:data-active:bg-[#16161d] dark:data-active:text-zinc-100 lg:flex-initial lg:px-3.5"
                >
                  <Mic className="size-3.5 shrink-0 text-violet-400" />
                  <span className="truncate">{t("page.tabVoice")}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Right: Quota Status, Locale, Admin, Upgrade & Install */}
            <div className="order-2 flex shrink-0 items-center gap-1.5 lg:order-3">
              {quota.isOperator ? (
                <span className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 font-mono text-[11px] font-medium text-emerald-400">
                  <ShieldCheck className="size-3 shrink-0" />
                  <span>
                    {quota.role === "operator"
                      ? t("page.badgeOperator")
                      : t("page.badgeProPass")}
                  </span>
                </span>
              ) : (
                <span
                  title={t("page.creditsBadge", {
                    remaining: quota.creditsRemaining,
                    max: quota.maxTrialCredits,
                  })}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] font-medium tabular-nums ${
                    quota.creditsRemaining > 0
                      ? "border-zinc-800/80 bg-[#0c0c10] text-zinc-300"
                      : "border-amber-500/35 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      quota.creditsRemaining > 0
                        ? "bg-emerald-400"
                        : "bg-amber-400"
                    }`}
                  />
                  <span className="min-[440px]:hidden">
                    {quota.creditsRemaining}/{quota.maxTrialCredits} cr.
                  </span>
                  <span className="hidden min-[440px]:inline">
                    {t("page.creditsBadge", {
                      remaining: quota.creditsRemaining,
                      max: quota.maxTrialCredits,
                    })}
                  </span>
                </span>
              )}

              <LanguageSwitcher />

              {quota.isOperator && (
                <Link
                  href="/admin"
                  title={t("page.adminTitle")}
                  aria-label={t("page.adminTitle")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-800/80 bg-[#0c0c10] px-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-[#131318] hover:text-zinc-100"
                >
                  <Settings className="size-3.5 text-zinc-400" />
                  <span className="hidden sm:inline">{t("page.adminLink")}</span>
                </Link>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPaywallOpen(true)}
                title={t("page.upgradeButton")}
                aria-label={t("page.upgradeButton")}
                className="h-7 rounded-md border-zinc-800 bg-[#131318] px-2 text-xs font-medium text-zinc-100 hover:border-zinc-700 hover:bg-zinc-800 sm:px-2.5"
              >
                <Crown className="size-3.5 text-violet-400 sm:mr-1.5" />
                <span className="hidden sm:inline">
                  {t("page.upgradeButton")}
                </span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleInstallPwa}
                title={t("page.installAppButton")}
                aria-label={t("page.installAppButton")}
                className="h-7 rounded-md border-zinc-800/80 bg-[#0c0c10] px-2 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:bg-[#131318] hover:text-zinc-100 sm:px-2.5"
              >
                <Download className="size-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">
                  {t("page.installAppButton")}
                </span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Workbench Workspace */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-4 sm:px-6 sm:py-5">
          <TabsContent value="backgrounds" className="mt-0 flex-1">
            <BackgroundFinder
              onRequirePaywall={() => setIsPaywallOpen(true)}
            />
          </TabsContent>

          <TabsContent value="voice" className="mt-0 flex-1">
            <VoiceStudio onRequirePaywall={() => setIsPaywallOpen(true)} />
          </TabsContent>
        </main>
      </Tabs>

      <footer className="border-t border-zinc-800/80 bg-[#070709]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-1 px-3 py-2.5 font-mono text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:px-6">
          <span>{t("page.footerNotice")}</span>
          <span>{t("page.engineStrip")}</span>
        </div>
      </footer>

      <PaywallModal
        open={isPaywallOpen}
        onOpenChange={setIsPaywallOpen}
        quota={quota}
        onQuotaChange={setQuota}
      />
    </div>
  );
}
