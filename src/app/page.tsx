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
        {/* Top Hardware Workbench Bar (Single-Row 52px Mobile + 3-Zone Executive Desktop Header) */}
        <header className="sticky top-0 z-40">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 border-b border-white/[0.08] bg-[#060608]/95 shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-lg"
          />
          <div className="relative mx-auto flex h-13 max-w-7xl flex-nowrap items-center justify-between gap-1 px-2 sm:gap-2 sm:px-6">
            {/* Zone 1 (Left): Geometric Aperture/Waveform Mark & Wordmark */}
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
              <div
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/[0.1] bg-[#0E1016] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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
              <h1 className="truncate font-heading text-[11.5px] font-semibold tracking-tight text-[#F4F4F5] min-[380px]:text-[13px] sm:text-sm">
                {t("page.brandName")}
              </h1>
            </div>

            {/* Zone 2 (Center on Desktop lg+, Native Docked Bottom Thumb-Arc Tab Bar below lg) */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#060608]/95 px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.65)] backdrop-blur-lg lg:static lg:z-auto lg:w-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
              <TabsList className="mx-auto grid h-auto min-h-13 w-full max-w-md grid-cols-2 rounded-lg border border-white/[0.08] bg-[#050507] p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] lg:inline-flex lg:h-8.5 lg:min-h-0 lg:w-auto lg:max-w-none lg:p-0.5">
                <TabsTrigger
                  value="backgrounds"
                  data-testid="tab-backgrounds"
                  className="studio-segment flex h-auto min-w-0 flex-col items-center justify-center gap-0.5 rounded-[5px] border border-transparent px-2 py-1.5 text-[11px] leading-tight font-medium text-[#8B8D98] hover:text-zinc-200 data-active:border-white/[0.12] data-active:bg-[#13151D] data-active:text-[#F4F4F5] dark:data-active:border-white/[0.12] dark:data-active:bg-[#13151D] dark:data-active:text-[#F4F4F5] lg:flex-initial lg:flex-row lg:gap-1.5 lg:px-3.5 lg:py-1 lg:text-xs"
                >
                  <ImageIcon
                    className={`size-4 shrink-0 transition-colors duration-150 lg:size-3.5 ${
                      isBackgroundsActive ? "text-amber-400" : "text-zinc-500"
                    }`}
                  />
                  <span className="whitespace-normal text-center lg:whitespace-nowrap">
                    {t("page.tabBackgrounds")}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="voice"
                  data-testid="tab-voice"
                  className="studio-segment flex h-auto min-w-0 flex-col items-center justify-center gap-0.5 rounded-[5px] border border-transparent px-2 py-1.5 text-[11px] leading-tight font-medium text-[#8B8D98] hover:text-zinc-200 data-active:border-white/[0.12] data-active:bg-[#13151D] data-active:text-[#F4F4F5] dark:data-active:border-white/[0.12] dark:data-active:bg-[#13151D] dark:data-active:text-[#F4F4F5] lg:flex-initial lg:flex-row lg:gap-1.5 lg:px-3.5 lg:py-1 lg:text-xs"
                >
                  <Mic
                    className={`size-4 shrink-0 transition-colors duration-150 lg:size-3.5 ${
                      isVoiceActive ? "text-amber-400" : "text-zinc-500"
                    }`}
                  />
                  <span className="whitespace-normal text-center lg:whitespace-nowrap">
                    {t("page.tabVoice")}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Zone 3 (Right): Status / Interactive Trial Badge, Language Switcher, Divider & Primary Action */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {proActive ? (
                <button
                  type="button"
                  data-testid={
                    isAdminOperator ? "badge-operator" : "badge-pro-pass"
                  }
                  onClick={() => setIsPaywallOpen(true)}
                  className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 font-mono text-[11px] font-medium text-emerald-400 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15 sm:gap-1.5 sm:px-2 md:h-7"
                >
                  <ShieldCheck className="size-3 shrink-0" />
                  <span>
                    {isAdminOperator
                      ? t("page.badgeOperator")
                      : t("page.badgeProPass")}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="status-quota"
                  onClick={() => setIsPaywallOpen(true)}
                  title={t("page.creditsBadge", {
                    remaining: quota.creditsRemaining,
                    max: quota.maxTrialCredits,
                  })}
                  className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-1.5 font-mono text-[11px] font-medium tabular-nums shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] transition-colors sm:gap-1.5 sm:px-2 md:h-7 ${
                    quota.creditsRemaining > 0
                      ? "border-white/[0.08] bg-[#050507] text-zinc-200 hover:border-white/[0.16] hover:bg-[#0E1016]"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/18"
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
                </button>
              )}

              <LanguageSwitcher />

              {(isAdminOperator || !proActive) && (
                <span
                  aria-hidden="true"
                  className="mx-0.5 hidden h-4 w-px shrink-0 bg-white/[0.1] sm:block"
                />
              )}

              {isAdminOperator ? (
                <Link
                  href="/admin"
                  data-testid="link-admin"
                  title={t("page.adminTitle")}
                  aria-label={t("page.adminTitle")}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-white/[0.1] bg-[#13151D] px-2 text-xs font-medium text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-white/[0.18] hover:bg-[#191c26] sm:gap-1.5 sm:px-2.5 md:h-7"
                >
                  <Settings className="size-3.5 shrink-0 text-amber-400" />
                  <span>{t("page.adminLink")}</span>
                </Link>
              ) : !proActive ? (
                <Button
                  size="sm"
                  data-testid="btn-upgrade"
                  onClick={() => setIsPaywallOpen(true)}
                  title={t("page.upgradeButton")}
                  aria-label={t("page.upgradeButton")}
                  className="studio-amber-cta h-9 gap-1 rounded-md border border-amber-400/60 bg-amber-500 px-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 sm:px-2.5 md:h-7"
                >
                  <Crown className="size-3.5 shrink-0" />
                  <span>{t("page.upgradeButton")}</span>
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        {/* Main Studio Workspace */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 lg:py-5">
          <TabsContent value="backgrounds" className="studio-tab-panel mt-0 flex-1">
            <BackgroundFinder
              onRequirePaywall={() => setIsPaywallOpen(true)}
            />
          </TabsContent>

          <TabsContent value="voice" className="studio-tab-panel mt-0 flex-1">
            <VoiceStudio onRequirePaywall={() => setIsPaywallOpen(true)} />
          </TabsContent>
        </main>
      </Tabs>

      {/* Minimal Bottom Studio Status Rail (40px tall, cleared above mobile bottom dock) */}
      <footer className="mb-[68px] border-t border-white/[0.08] bg-[#0E1016] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:mb-0">
        <div className="mx-auto flex h-10 max-w-7xl flex-nowrap items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] tracking-wide text-[#8B8D98] sm:text-[11px]">
            <span className="size-1.5 shrink-0 rounded-full bg-zinc-500" />
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
            className="h-8 shrink-0 rounded-md border-white/[0.1] bg-[#13151D] px-2.5 font-mono text-[11px] font-medium text-zinc-200 hover:border-amber-500/40 hover:bg-[#191c26] hover:text-amber-200 md:h-7.5"
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
