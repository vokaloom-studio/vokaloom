"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
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
  hasOperatorAccess,
  hasProAccess,
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
    isPro: false,
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

  const isBackgroundsActive = activeTab === "backgrounds";
  const isVoiceActive = activeTab === "voice";
  const proActive = hasProAccess(quota);
  const isAdminOperator = hasOperatorAccess(quota);

  return (
    <div className="min-h-screen flex flex-col bg-[#060608] text-[#F4F4F5]">
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          if (val) setActiveTab(String(val));
        }}
        className="flex flex-1 flex-col gap-0"
      >
        {/* Top Hardware Workbench Bar (3-Zone Executive Header) */}
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#060608]/92 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:h-13 lg:flex-nowrap lg:py-0">
            {/* Zone 1 (Left): Geometric Aperture/Waveform Mark & Wordmark */}
            <div className="order-1 flex min-w-0 items-center gap-2.5">
              <div
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/[0.1] bg-[#0B0C10] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-4"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="2.5"
                    y="2.5"
                    width="19"
                    height="19"
                    rx="4"
                    stroke="rgba(244,244,245,0.2)"
                    strokeWidth="1.25"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="6.25"
                    stroke="#F4F4F5"
                    strokeWidth="1.25"
                    strokeDasharray="6 3"
                  />
                  <path
                    d="M8.5 13V11M12 15.25V8.75M15.5 13V11"
                    stroke="#F59E0B"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h1 className="truncate font-heading text-[13px] font-semibold tracking-tight text-[#F4F4F5] sm:text-sm">
                {t("page.brandName")}
              </h1>
            </div>

            {/* Zone 2 (Center): Crisp Segmented Mode Switcher */}
            <div className="order-3 w-full border-t border-white/[0.06] pt-2 lg:order-2 lg:w-auto lg:border-0 lg:pt-0">
              <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg border border-white/[0.08] bg-[#050507] p-0.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] md:h-8.5 lg:inline-flex lg:w-auto">
                <TabsTrigger
                  value="backgrounds"
                  data-testid="tab-backgrounds"
                  className="flex min-w-0 items-center justify-center gap-1.5 rounded-[5px] border border-transparent px-2.5 py-1 text-xs font-medium text-[#8B8D98] transition-colors hover:text-zinc-200 data-active:border-white/[0.11] data-active:bg-[#13151D] data-active:text-[#F4F4F5] data-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:data-active:border-white/[0.11] dark:data-active:bg-[#13151D] dark:data-active:text-[#F4F4F5] lg:flex-initial lg:px-3.5"
                >
                  <ImageIcon
                    className={`size-3.5 shrink-0 ${
                      isBackgroundsActive ? "text-amber-400" : "text-zinc-500"
                    }`}
                  />
                  <span className="truncate">{t("page.tabBackgrounds")}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="voice"
                  data-testid="tab-voice"
                  className="flex min-w-0 items-center justify-center gap-1.5 rounded-[5px] border border-transparent px-2.5 py-1 text-xs font-medium text-[#8B8D98] transition-colors hover:text-zinc-200 data-active:border-white/[0.11] data-active:bg-[#13151D] data-active:text-[#F4F4F5] data-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:data-active:border-white/[0.11] dark:data-active:bg-[#13151D] dark:data-active:text-[#F4F4F5] lg:flex-initial lg:px-3.5"
                >
                  <Mic
                    className={`size-3.5 shrink-0 ${
                      isVoiceActive ? "text-amber-400" : "text-zinc-500"
                    }`}
                  />
                  <span className="truncate">{t("page.tabVoice")}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Zone 3 (Right): Single Status Pill, Language Switcher & Single Primary Action */}
            <div className="order-2 flex shrink-0 items-center gap-1.5 lg:order-3">
              {proActive ? (
                <span
                  data-testid={
                    isAdminOperator ? "badge-operator" : "badge-pro-pass"
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 font-mono text-[11px] font-medium text-emerald-400 md:h-7"
                >
                  <ShieldCheck className="size-3 shrink-0" />
                  <span>
                    {isAdminOperator
                      ? t("page.badgeOperator")
                      : t("page.badgeProPass")}
                  </span>
                </span>
              ) : (
                <span
                  data-testid="status-quota"
                  title={t("page.creditsBadge", {
                    remaining: quota.creditsRemaining,
                    max: quota.maxTrialCredits,
                  })}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] font-medium tabular-nums shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] md:h-7 ${
                    quota.creditsRemaining > 0
                      ? "border-white/[0.08] bg-[#050507] text-zinc-200"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-300"
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

              {isAdminOperator ? (
                <Link
                  href="/admin"
                  data-testid="link-admin"
                  title={t("page.adminTitle")}
                  aria-label={t("page.adminTitle")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#13151D] px-2.5 text-xs font-medium text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-white/[0.18] hover:bg-[#191c26] md:h-7"
                >
                  <Settings className="size-3.5 text-amber-400" />
                  <span className="hidden sm:inline">{t("page.adminLink")}</span>
                </Link>
              ) : !proActive ? (
                <Button
                  size="sm"
                  data-testid="btn-upgrade"
                  onClick={() => setIsPaywallOpen(true)}
                  title={t("page.upgradeButton")}
                  aria-label={t("page.upgradeButton")}
                  className="h-9 rounded-md border border-amber-400/60 bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-amber-400 md:h-7"
                >
                  <Crown className="size-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">
                    {t("page.upgradeButton")}
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Main Studio Workspace */}
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

      {/* Minimal Bottom Studio Status Rail */}
      <footer className="border-t border-white/[0.08] bg-[#0B0C10] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mx-auto flex min-h-8 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-1.5 sm:px-6 lg:h-8 lg:flex-nowrap lg:py-0">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] tracking-wide text-[#8B8D98] sm:text-[11px]">
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span className="truncate">{t("page.footerNotice")}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="btn-install-pwa"
            onClick={handleInstallPwa}
            title={t("page.installAppButton")}
            aria-label={t("page.installAppButton")}
            className="h-8 shrink-0 rounded border-white/[0.1] bg-[#13151D] px-2.5 font-mono text-[10px] font-medium text-zinc-200 hover:border-amber-500/40 hover:bg-[#191c26] hover:text-amber-200 md:h-5.5 md:px-2"
          >
            <Download className="size-3" />
            <span>{t("page.installAppButton")}</span>
          </Button>
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
