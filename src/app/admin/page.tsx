"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Activity,
  RefreshCw,
  DollarSign,
  Copy,
  Share2,
  Sliders,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  UserCheck,
  Eye,
  Loader2,
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
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";
import { LOCALE_HEADER } from "@/lib/i18n";
import {
  getQuotaState,
  getBusinessConfig,
  saveBusinessConfig,
  enableOperatorMode,
  deactivateOperatorMode,
  resetTrialForDemo,
  type BusinessConfig,
  type QuotaState,
} from "@/lib/quota";

interface EngineHealth {
  geminiConfigured: boolean;
  pexelsConfigured: boolean;
  unsplashConfigured: boolean;
  falConfigured: boolean;
}

interface AdminApiGetResponse {
  authenticated: boolean;
  config?: BusinessConfig;
  health?: EngineHealth;
  vipClientCodes?: string[];
}

export default function VokaloomAdminPage() {
  const { locale, t } = useLocale();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState<boolean>(false);

  const [health, setHealth] = useState<EngineHealth>({
    geminiConfigured: false,
    pexelsConfigured: false,
    unsplashConfigured: false,
    falConfigured: false,
  });
  const [vipCodes, setVipCodes] = useState<string[]>([
    "VOKALOOM-PRO-2026",
    "CLIENT-VIP-01",
  ]);
  const [customInviteCode, setCustomInviteCode] =
    useState<string>("VOKALOOM-PRO-2026");

  const [businessForm, setBusinessForm] = useState<BusinessConfig>({
    priceCop: "$60,000 COP",
    priceUsd: "$15 USD",
    maxTrialCredits: 3,
    checkoutUrlCop: "https://checkout.wompi.co/l/your_60000_cop_link",
    checkoutUrlUsd: "https://buy.stripe.com/your_15_usd_link",
  });
  const [localQuota, setLocalQuota] = useState<QuotaState>({
    creditsRemaining: 3,
    maxTrialCredits: 3,
    isOperator: false,
    role: "guest",
    totalGenerations: 0,
  });

  const fetchAdminStatus = useCallback(async (adminKeyHeader?: string) => {
    setIsRefreshingHealth(true);
    try {
      const headers: Record<string, string> = {
        [LOCALE_HEADER]: localeRef.current,
      };
      if (adminKeyHeader) {
        headers["x-admin-key"] = adminKeyHeader;
      }
      const res = await fetch("/api/admin", { headers });
      if (!res.ok) return;

      const data = (await res.json()) as AdminApiGetResponse;
      if (data.authenticated) {
        setIsAuthenticated(true);
        if (data.health) {
          setHealth(data.health);
        }
        if (data.vipClientCodes && data.vipClientCodes.length > 0) {
          setVipCodes(data.vipClientCodes);
          setCustomInviteCode(data.vipClientCodes[0]);
        }
      }
    } catch {
      // Ignore network error during initial status check
    } finally {
      setIsCheckingSession(false);
      setIsRefreshingHealth(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setBusinessForm(getBusinessConfig());
      setLocalQuota(getQuotaState());
      void fetchAdminStatus();
    });
  }, [fetchAdminStatus]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = passwordInput.trim();
    if (!trimmed) {
      toast.error(t("admin.toast.enterPassword"));
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        body: JSON.stringify({
          action: "admin-login",
          code: trimmed,
          locale,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        role?: string;
        error?: string;
      };

      if (!res.ok || !data.valid) {
        toast.error(data.error || t("admin.toast.invalidPassword"));
        return;
      }

      const updatedQuota = enableOperatorMode("operator");
      setLocalQuota(updatedQuota);
      setPasswordInput("");
      await fetchAdminStatus(trimmed);
      toast.success(t("admin.toast.authenticated"));
    } catch {
      toast.error(t("admin.toast.verifyFailed"));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveBusinessConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveBusinessConfig(businessForm);
    setBusinessForm(saved);
    toast.success(t("admin.toast.savedConfig"));
  };

  const handleCopyInviteLink = async (code: string) => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000";
    const inviteUrl = `${origin}/?key=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success(t("admin.toast.copiedInvite", { url: inviteUrl }));
    } catch {
      toast.info(t("admin.toast.inviteFallback", { url: inviteUrl }));
    }
  };

  const handleEnableOperatorBrowser = () => {
    const updated = enableOperatorMode("operator");
    setLocalQuota(updated);
    toast.success(t("admin.toast.operatorEnabled"));
  };

  const handleSwitchToNormalClientView = () => {
    const updated = deactivateOperatorMode();
    setLocalQuota(updated);
    toast.info(t("admin.toast.clientViewEnabled"));
  };

  const handleResetLocalTrial = () => {
    const updated = resetTrialForDemo();
    setLocalQuota(updated);
    toast.success(
      t("admin.toast.trialReset", {
        remaining: updated.creditsRemaining,
        max: updated.maxTrialCredits,
      })
    );
  };

  const engineList = [
    {
      key: "gemini-vision",
      name: t("admin.engine.geminiVision"),
      active: health.geminiConfigured,
      envVar: "GEMINI_API_KEY",
    },
    {
      key: "gemini-tts",
      name: t("admin.engine.geminiTts"),
      active: health.geminiConfigured,
      envVar: "GEMINI_API_KEY",
    },
    {
      key: "pexels",
      name: t("admin.engine.pexels"),
      active: health.pexelsConfigured,
      envVar: "PEXELS_API_KEY",
    },
    {
      key: "unsplash",
      name: t("admin.engine.unsplash"),
      active: health.unsplashConfigured,
      envVar: "UNSPLASH_ACCESS_KEY",
    },
    {
      key: "fal",
      name: t("admin.engine.fal"),
      active: health.falConfigured,
      envVar: "FAL_KEY",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/20">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                  {t("admin.headerTitle")}
                </h1>
                <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-300">
                  {t("admin.operatorConsoleBadge")}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400">
                {t("admin.headerSubtitle")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300"
            >
              {localQuota.isOperator
                ? t("admin.browserModeOperator")
                : t("admin.browserModeTrial", {
                    remaining: localQuota.creditsRemaining,
                    max: localQuota.maxTrialCredits,
                  })}
            </Badge>
            <LanguageSwitcher />
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ArrowLeft className="size-3.5 shrink-0" />
              <span>{t("admin.returnToStudio")}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6">
        {isCheckingSession ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-violet-400" />
          </div>
        ) : !isAuthenticated ? (
          /* Admin Login Gate */
          <div className="mx-auto my-auto w-full max-w-md py-12">
            <Card className="border-zinc-800 bg-zinc-900/60 text-zinc-100 shadow-2xl">
              <CardHeader className="space-y-2 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/15 text-violet-300">
                  <Lock className="size-6" />
                </div>
                <CardTitle className="text-lg font-bold text-white">
                  {t("admin.loginTitle")}
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  {t("admin.loginDescBefore")}{" "}
                  <code className="text-zinc-300">ADMIN_MASTER_KEY</code>{" "}
                  {t("admin.loginDescAfter")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-master-password"
                      className="text-xs font-medium text-zinc-300"
                    >
                      {t("admin.passwordLabel")}
                    </label>
                    <Input
                      id="admin-master-password"
                      type="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder={t("admin.passwordPlaceholder")}
                      className="h-10 border-zinc-800 bg-zinc-950 font-mono text-sm text-white"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoggingIn}
                    className="h-10 w-full bg-violet-600 text-sm font-semibold text-white hover:bg-violet-500"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                        <span className="truncate">
                          {t("admin.verifyingButton")}
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 size-4 shrink-0" />
                        <span className="truncate">
                          {t("admin.unlockButton")}
                        </span>
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* 4 Administrative Control Cards */
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Card 1: API & AI Engine Health Status */}
            <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                    <Activity className="size-4 shrink-0 text-emerald-400" />
                    <span>{t("admin.card1Title")}</span>
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void fetchAdminStatus()}
                    disabled={isRefreshingHealth}
                    className="border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800"
                  >
                    <RefreshCw
                      className={`mr-1.5 size-3 ${
                        isRefreshingHealth ? "animate-spin" : ""
                      }`}
                    />
                    {t("admin.refreshHealth")}
                  </Button>
                </div>
                <CardDescription className="text-xs text-zinc-400">
                  {t("admin.card1Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {engineList.map((eng) => (
                  <div
                    key={eng.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/80 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-100">
                        {eng.name}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        {t("admin.envLabel", { envVar: eng.envVar })}
                      </p>
                    </div>
                    {eng.active ? (
                      <Badge className="shrink-0 border border-emerald-500/30 bg-emerald-500/15 text-[11px] font-semibold text-emerald-300">
                        <CheckCircle2 className="mr-1 size-3" />
                        {t("admin.statusActive")}
                      </Badge>
                    ) : (
                      <Badge className="shrink-0 border border-amber-500/30 bg-amber-500/15 text-[11px] font-semibold text-amber-300">
                        <AlertTriangle className="mr-1 size-3" />
                        {t("admin.statusFallback")}
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Card 2: Commercial & Paywall Configuration */}
            <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <DollarSign className="size-4 shrink-0 text-violet-400" />
                  <span>{t("admin.card2Title")}</span>
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  {t("admin.card2Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleSaveBusinessConfig}
                  className="space-y-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="admin-price-cop"
                        className="text-xs font-medium text-zinc-300"
                      >
                        {t("admin.priceCopLabel")}
                      </label>
                      <Input
                        id="admin-price-cop"
                        value={businessForm.priceCop}
                        onChange={(e) =>
                          setBusinessForm({
                            ...businessForm,
                            priceCop: e.target.value,
                          })
                        }
                        className="h-9 border-zinc-800 bg-zinc-950 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="admin-price-usd"
                        className="text-xs font-medium text-zinc-300"
                      >
                        {t("admin.priceUsdLabel")}
                      </label>
                      <Input
                        id="admin-price-usd"
                        value={businessForm.priceUsd}
                        onChange={(e) =>
                          setBusinessForm({
                            ...businessForm,
                            priceUsd: e.target.value,
                          })
                        }
                        className="h-9 border-zinc-800 bg-zinc-950 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="admin-trial-credits"
                        className="text-xs font-medium text-zinc-300"
                      >
                        {t("admin.trialCreditsLabel")}
                      </label>
                      <Input
                        id="admin-trial-credits"
                        type="number"
                        min={0}
                        max={50}
                        value={businessForm.maxTrialCredits}
                        onChange={(e) =>
                          setBusinessForm({
                            ...businessForm,
                            maxTrialCredits: Math.max(
                              0,
                              Number(e.target.value) || 0
                            ),
                          })
                        }
                        className="h-9 border-zinc-800 bg-zinc-950 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="admin-checkout-cop"
                      className="text-xs font-medium text-zinc-300"
                    >
                      {t("admin.checkoutCopLabel")}
                    </label>
                    <Input
                      id="admin-checkout-cop"
                      value={businessForm.checkoutUrlCop}
                      onChange={(e) =>
                        setBusinessForm({
                          ...businessForm,
                          checkoutUrlCop: e.target.value,
                        })
                      }
                      className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="admin-checkout-usd"
                      className="text-xs font-medium text-zinc-300"
                    >
                      {t("admin.checkoutUsdLabel")}
                    </label>
                    <Input
                      id="admin-checkout-usd"
                      value={businessForm.checkoutUrlUsd}
                      onChange={(e) =>
                        setBusinessForm({
                          ...businessForm,
                          checkoutUrlUsd: e.target.value,
                        })
                      }
                      className="h-9 border-zinc-800 bg-zinc-950 font-mono text-xs text-white"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="h-9 w-full bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500"
                  >
                    <span className="truncate">
                      {t("admin.saveSettingsButton")}
                    </span>
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Card 3: Client Access Links & WhatsApp Invite Generator */}
            <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <Share2 className="size-4 shrink-0 text-violet-400" />
                  <span>{t("admin.card3Title")}</span>
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  {t("admin.card3Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-medium text-zinc-300">
                    {t("admin.vipCodesLabelBefore")}
                    <code className="text-zinc-400">VIP_CLIENT_CODES</code>
                    {t("admin.vipCodesLabelAfter")}
                  </span>
                  <div className="space-y-2">
                    {vipCodes.map((code) => (
                      <div
                        key={code}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Sparkles className="size-3.5 shrink-0 text-violet-400" />
                          <code className="truncate text-xs font-semibold text-violet-200">
                            {code}
                          </code>
                        </div>
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={() => void handleCopyInviteLink(code)}
                          className="shrink-0 border border-violet-500/30 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                        >
                          <Copy className="mr-1.5 size-3" />
                          {t("admin.copyInviteButton")}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                  <label
                    htmlFor="admin-custom-invite"
                    className="text-xs font-medium text-zinc-300"
                  >
                    {t("admin.customInviteLabel")}
                  </label>
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <Input
                      id="admin-custom-invite"
                      value={customInviteCode}
                      onChange={(e) => setCustomInviteCode(e.target.value)}
                      placeholder={t("admin.customInvitePlaceholder")}
                      className="h-8 min-w-0 flex-1 border-zinc-800 bg-zinc-900 font-mono text-xs text-white"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        void handleCopyInviteLink(customInviteCode)
                      }
                      className="h-8 shrink-0 bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      <Copy className="mr-1.5 size-3.5" />
                      {t("admin.copyInviteButton")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Operator Sandbox & Device Controls */}
            <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <Sliders className="size-4 shrink-0 text-emerald-400" />
                  <span>{t("admin.card4Title")}</span>
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  {t("admin.card4Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  type="button"
                  onClick={handleEnableOperatorBrowser}
                  className="h-auto min-h-9 w-full justify-start whitespace-normal bg-emerald-600 py-2 text-left text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <UserCheck className="mr-2 size-4 shrink-0" />
                  <span>{t("admin.enableOperatorButton")}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSwitchToNormalClientView}
                  className="h-auto min-h-9 w-full justify-start whitespace-normal border-zinc-700 bg-zinc-950 py-2 text-left text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  <Eye className="mr-2 size-4 shrink-0 text-amber-400" />
                  <span>{t("admin.switchClientButton")}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetLocalTrial}
                  className="h-auto min-h-9 w-full justify-start whitespace-normal border-zinc-700 bg-zinc-950 py-2 text-left text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  <RotateCcw className="mr-2 size-4 shrink-0 text-violet-400" />
                  <span>
                    {t("admin.resetTrialButton", {
                      max: businessForm.maxTrialCredits,
                    })}
                  </span>
                </Button>

                <Link
                  href="/"
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-500/25 hover:text-white"
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <span>{t("admin.returnToStudio")}</span>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
