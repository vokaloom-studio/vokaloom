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
  KeyRound,
  Trash2,
  X,
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
import type { SecretKeyName } from "@/lib/server-secrets";
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

type MaskedKeysMap = Partial<Record<SecretKeyName, string | null>>;

interface AdminApiGetResponse {
  authenticated: boolean;
  config?: BusinessConfig;
  health?: EngineHealth;
  maskedKeys?: MaskedKeysMap;
  vipClientCodes?: string[];
}

const VAULT_KEY_FIELDS: ReadonlyArray<{
  keyName: SecretKeyName;
  serviceHint: string;
}> = [
  { keyName: "GEMINI_API_KEY", serviceHint: "Gemini 2.5 Vision / Swap / TTS" },
  { keyName: "PEXELS_API_KEY", serviceHint: "Pexels Portrait Stock" },
  { keyName: "UNSPLASH_ACCESS_KEY", serviceHint: "Unsplash Portrait Stock" },
  { keyName: "FAL_KEY", serviceHint: "Fal.ai Kokoro-82M & F5-TTS" },
];

const EMPTY_VAULT_INPUTS: Record<SecretKeyName, string> = {
  GEMINI_API_KEY: "",
  PEXELS_API_KEY: "",
  UNSPLASH_ACCESS_KEY: "",
  FAL_KEY: "",
};

export default function VokaloomAdminPage() {
  const { locale, t } = useLocale();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [loginError, setLoginError] = useState<string>("");
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState<boolean>(false);

  const [health, setHealth] = useState<EngineHealth>({
    geminiConfigured: false,
    pexelsConfigured: false,
    unsplashConfigured: false,
    falConfigured: false,
  });
  const [maskedKeys, setMaskedKeys] = useState<MaskedKeysMap>({});
  const [vaultInputs, setVaultInputs] = useState<Record<SecretKeyName, string>>(
    { ...EMPTY_VAULT_INPUTS }
  );
  const [isSavingVault, setIsSavingVault] = useState<boolean>(false);
  const [isClearingVault, setIsClearingVault] = useState<boolean>(false);

  const [vipCodes, setVipCodes] = useState<string[]>([]);
  const [customInviteCode, setCustomInviteCode] = useState<string>("");

  const [businessForm, setBusinessForm] = useState<BusinessConfig>({
    priceCop: "$60,000 COP",
    priceUsd: "$15 USD",
    maxTrialCredits: 3,
    checkoutUrlCop: "https://checkout.wompi.co/l/your_60000_cop_link",
    checkoutUrlUsd: "https://buy.stripe.com/your_15_usd_link",
  });
  const [savedBusinessConfig, setSavedBusinessConfig] = useState<BusinessConfig>(
    {
      priceCop: "$60,000 COP",
      priceUsd: "$15 USD",
      maxTrialCredits: 3,
      checkoutUrlCop: "https://checkout.wompi.co/l/your_60000_cop_link",
      checkoutUrlUsd: "https://buy.stripe.com/your_15_usd_link",
    }
  );
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
        if (data.maskedKeys) {
          setMaskedKeys(data.maskedKeys);
        }
        if (Array.isArray(data.vipClientCodes)) {
          setVipCodes(data.vipClientCodes);
          setCustomInviteCode(data.vipClientCodes[0] ?? "");
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
      const initialConfig = getBusinessConfig();
      setBusinessForm(initialConfig);
      setSavedBusinessConfig(initialConfig);
      setLocalQuota(getQuotaState());
      void fetchAdminStatus();
    });
  }, [fetchAdminStatus]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = passwordInput.trim();
    if (!trimmed) {
      const msg = t("admin.toast.enterPassword");
      setLoginError(msg);
      toast.error(msg);
      return;
    }

    setLoginError("");
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
        const msg = data.error || t("admin.toast.invalidPassword");
        setLoginError(msg);
        toast.error(msg);
        return;
      }

      const updatedQuota = enableOperatorMode("operator");
      setLocalQuota(updatedQuota);
      setPasswordInput("");
      setLoginError("");
      await fetchAdminStatus(trimmed);
      toast.success(t("admin.toast.authenticated"));
    } catch {
      const msg = t("admin.toast.verifyFailed");
      setLoginError(msg);
      toast.error(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveVaultKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Record<SecretKeyName, string>> = {};
    for (const field of VAULT_KEY_FIELDS) {
      const val = vaultInputs[field.keyName].trim();
      if (val) {
        payload[field.keyName] = val;
      }
    }

    if (Object.keys(payload).length === 0) {
      toast.error(t("admin.vault.toast.noInput"));
      return;
    }

    setIsSavingVault(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        body: JSON.stringify({
          action: "update-keys",
          keys: payload,
          locale,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        persistedToDisk?: boolean;
        health?: EngineHealth;
        maskedKeys?: MaskedKeysMap;
        error?: string;
      };

      if (!res.ok || !data.success) {
        toast.error(data.error || t("admin.vault.toast.saveError"));
        return;
      }

      if (data.health) setHealth(data.health);
      if (data.maskedKeys) setMaskedKeys(data.maskedKeys);
      setVaultInputs({ ...EMPTY_VAULT_INPUTS });
      toast.success(
        data.persistedToDisk
          ? t("admin.vault.toast.savedDisk")
          : t("admin.vault.toast.savedCookie")
      );
    } catch {
      toast.error(t("admin.vault.toast.saveError"));
    } finally {
      setIsSavingVault(false);
    }
  };

  const handleClearSingleVaultKey = async (keyName: SecretKeyName) => {
    setIsSavingVault(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        body: JSON.stringify({
          action: "update-keys",
          keys: { [keyName]: "CLEAR" },
          locale,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        health?: EngineHealth;
        maskedKeys?: MaskedKeysMap;
        error?: string;
      };

      if (!res.ok || !data.success) {
        toast.error(data.error || t("admin.vault.toast.saveError"));
        return;
      }

      if (data.health) setHealth(data.health);
      if (data.maskedKeys) setMaskedKeys(data.maskedKeys);
      setVaultInputs((prev) => ({ ...prev, [keyName]: "" }));
      toast.info(t("admin.vault.toast.clearedSingle", { keyName }));
    } catch {
      toast.error(t("admin.vault.toast.saveError"));
    } finally {
      setIsSavingVault(false);
    }
  };

  const handleClearVault = async () => {
    setIsClearingVault(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [LOCALE_HEADER]: locale,
        },
        body: JSON.stringify({
          action: "clear-vault",
          locale,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        health?: EngineHealth;
        maskedKeys?: MaskedKeysMap;
        error?: string;
      };

      if (!res.ok || !data.success) {
        toast.error(data.error || t("admin.vault.toast.clearError"));
        return;
      }

      if (data.health) setHealth(data.health);
      if (data.maskedKeys) setMaskedKeys(data.maskedKeys);
      setVaultInputs({ ...EMPTY_VAULT_INPUTS });
      toast.info(t("admin.vault.toast.cleared"));
    } catch {
      toast.error(t("admin.vault.toast.clearError"));
    } finally {
      setIsClearingVault(false);
    }
  };

  const handleSaveBusinessConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveBusinessConfig(businessForm);
    setBusinessForm(saved);
    setSavedBusinessConfig(saved);
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

  const totalEngineCount = engineList.length;
  const liveEngineCount = engineList.filter((eng) => eng.active).length;
  const fallbackEngineCount = totalEngineCount - liveEngineCount;
  const stripLeadingIndex = (title: string): string =>
    title.replace(/^\d+\.\s*/, "");
  const hasVaultInput = VAULT_KEY_FIELDS.some(
    (field) => vaultInputs[field.keyName].trim().length > 0
  );
  const hasUnsavedBusinessChanges =
    businessForm.priceCop !== savedBusinessConfig.priceCop ||
    businessForm.priceUsd !== savedBusinessConfig.priceUsd ||
    businessForm.maxTrialCredits !== savedBusinessConfig.maxTrialCredits ||
    businessForm.checkoutUrlCop !== savedBusinessConfig.checkoutUrlCop ||
    businessForm.checkoutUrlUsd !== savedBusinessConfig.checkoutUrlUsd;

  return (
    <div className="min-h-screen flex flex-col bg-[#060608] text-[#F4F4F5]">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#060608]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/35 bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-base font-semibold tracking-tight text-[#F4F4F5] sm:text-lg">
                  {t("admin.headerTitle")}
                </h1>
                <Badge className="rounded-md border border-emerald-500/35 bg-emerald-500/10 font-mono text-[10px] font-medium text-emerald-400">
                  {t("admin.operatorConsoleBadge")}
                </Badge>
              </div>
              <p className="text-xs text-[#8B8D98]">
                {t("admin.headerSubtitle")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                localQuota.isOperator
                  ? "h-9 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 font-mono text-[11px] font-medium text-emerald-400 md:h-7"
                  : "h-9 rounded-md border border-white/[0.08] bg-[#050507] px-2.5 font-mono text-[11px] font-medium text-zinc-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] md:h-7"
              }
            >
              {localQuota.isOperator
                ? t("admin.browserModeOperator")
                : t("admin.browserModeTrial", {
                    remaining: localQuota.creditsRemaining,
                    max: localQuota.maxTrialCredits,
                  })}
            </Badge>
            <LanguageSwitcher />
            <span
              aria-hidden="true"
              className="mx-0.5 hidden h-4 w-px shrink-0 bg-white/[0.1] sm:block"
            />
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#13151D] px-3 text-xs font-medium text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-white/[0.18] hover:bg-[#191c26] md:h-7 md:px-2.5"
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
            <Loader2 className="size-6 animate-spin text-amber-400" />
          </div>
        ) : !isAuthenticated ? (
          /* Admin Login Gate */
          <div className="mx-auto my-auto w-full max-w-md py-12">
            <Card className="studio-deck rounded-lg ring-0 text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_64px_-12px_rgba(0,0,0,0.85)]">
              <CardHeader className="space-y-2.5 text-center">
                <div
                  aria-hidden="true"
                  className="mx-auto flex size-12 items-center justify-center rounded-lg border border-amber-500/35 bg-[#050507] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-7"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect
                      x="2.5"
                      y="2.5"
                      width="19"
                      height="19"
                      rx="4"
                      stroke="rgba(244,244,245,0.22)"
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
                <CardTitle className="font-heading text-lg font-semibold text-[#F4F4F5]">
                  {t("admin.loginTitle")}
                </CardTitle>
                <CardDescription className="text-xs text-[#8B8D98]">
                  {t("admin.loginDescBefore")}{" "}
                  <code className="text-zinc-200">ADMIN_MASTER_KEY</code>{" "}
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
                      aria-invalid={Boolean(loginError)}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        if (loginError) setLoginError("");
                      }}
                      placeholder={t("admin.passwordPlaceholder")}
                      className={`h-11 bg-[#050507] font-mono text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] placeholder:text-zinc-600 md:h-10 md:text-sm ${
                        loginError
                          ? "border-destructive/85 focus-visible:border-destructive focus-visible:ring-destructive/30"
                          : "border-white/[0.08] focus-visible:border-ring"
                      }`}
                    />
                    {loginError && (
                      <p
                        role="alert"
                        data-testid="admin-login-error"
                        className="text-[11px] font-medium text-red-400"
                      >
                        {loginError}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoggingIn}
                    className="h-11 w-full border border-amber-400/60 bg-amber-500 text-sm font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-amber-400 md:h-10"
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
          /* Engine Summary Strip + 5 Administrative Control Cards */
          <div className="space-y-5">
            {/* Compact Top Engine Telemetry Summary Strip */}
            <div
              data-testid="admin-health-summary"
              className="studio-deck flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-[#050507] px-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#8B8D98] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                  {locale === "es" ? "TELEMETRÍA" : "TELEMETRY"}
                </span>
                <span className="truncate text-xs font-medium text-zinc-200">
                  {locale === "es"
                    ? `Resumen de Motores IA y Stock (${liveEngineCount} de ${totalEngineCount} en vivo)`
                    : `AI & Stock Engine Summary (${liveEngineCount} of ${totalEngineCount} live)`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span>
                    {locale === "es"
                      ? `${liveEngineCount}/${totalEngineCount} En Vivo`
                      : `${liveEngineCount}/${totalEngineCount} Live`}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-amber-300">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  <span>
                    {locale === "es"
                      ? `${fallbackEngineCount}/${totalEngineCount} Respaldo`
                      : `${fallbackEngineCount}/${totalEngineCount} Fallback`}
                  </span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Card 01: API & AI Engine Health Status */}
              <Card className="studio-deck flex flex-col rounded-lg ring-0 text-[#F4F4F5]">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold text-[#F4F4F5]">
                      <span className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-[#050507] px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[#8B8D98] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                        01
                      </span>
                      <Activity className="size-4 shrink-0 text-emerald-400" />
                      <span>{stripLeadingIndex(t("admin.card1Title"))}</span>
                    </CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void fetchAdminStatus()}
                      disabled={isRefreshingHealth}
                      className="h-9 border-white/[0.1] bg-[#13151D] text-zinc-200 hover:border-white/[0.18] hover:bg-[#191c26] hover:text-[#F4F4F5] md:h-6"
                    >
                      <RefreshCw
                        className={`mr-1.5 size-3 ${
                          isRefreshingHealth ? "animate-spin" : ""
                        }`}
                      />
                      {t("admin.refreshHealth")}
                    </Button>
                  </div>
                  <CardDescription className="text-xs text-[#8B8D98]">
                    {t("admin.card1Desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-2.5">
                  {engineList.map((eng) => (
                    <div
                      key={eng.key}
                      className="studio-well flex flex-wrap items-center justify-between gap-2 rounded-lg px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#F4F4F5]">
                          {eng.name}
                        </p>
                        <p className="font-mono text-[10px] text-[#8B8D98]">
                          {t("admin.envLabel", { envVar: eng.envVar })}
                        </p>
                      </div>
                      {eng.active ? (
                        <Badge className="shrink-0 rounded-md border border-emerald-500/35 bg-emerald-500/10 font-mono text-[10.5px] font-medium text-emerald-400">
                          <CheckCircle2 className="mr-1 size-3" />
                          {t("admin.statusActive")}
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 rounded-md border border-amber-500/35 bg-amber-500/10 font-mono text-[10.5px] font-medium text-amber-300">
                          <AlertTriangle className="mr-1 size-3" />
                          {t("admin.statusFallback")}
                        </Badge>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Card 02: Runtime API Keys Vault (AES-256-GCM HttpOnly Cookie + Local Dev .env.local) */}
              <Card className="studio-deck flex flex-col rounded-lg ring-0 text-[#F4F4F5]">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold text-[#F4F4F5]">
                      <span className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-[#050507] px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[#8B8D98] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                        02
                      </span>
                      <KeyRound className="size-4 shrink-0 text-amber-400" />
                      <span>{stripLeadingIndex(t("admin.vault.title"))}</span>
                    </CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      data-testid="btn-clear-vault"
                      disabled={isClearingVault}
                      onClick={() => void handleClearVault()}
                      className="h-7 shrink-0 rounded-md px-2 font-mono text-[10.5px] font-medium text-[#8B8D98] transition-colors hover:bg-red-500/10 hover:text-red-300"
                    >
                      {isClearingVault ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 size-3" />
                      )}
                      {t("admin.vault.clearButton")}
                    </Button>
                  </div>
                  <CardDescription className="text-xs text-[#8B8D98]">
                    {t("admin.vault.desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <form
                    onSubmit={handleSaveVaultKeys}
                    className="flex flex-1 flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-2.5">
                      {VAULT_KEY_FIELDS.map(({ keyName, serviceHint }) => {
                        const masked = maskedKeys[keyName];
                        return (
                          <div
                            key={keyName}
                            className="studio-well space-y-1.5 rounded-lg px-3.5 py-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label
                                htmlFor={`vault-${keyName}`}
                                className="min-w-0 font-mono text-[11px] font-semibold text-[#F4F4F5]"
                              >
                                {keyName}{" "}
                                <span className="font-sans font-normal text-[#8B8D98]">
                                  · {serviceHint}
                                </span>
                              </label>
                              {masked ? (
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <Badge className="rounded-md border border-emerald-500/35 bg-emerald-500/10 font-mono text-[10.5px] font-medium text-emerald-400">
                                    {t("admin.vault.activeBadge", { masked })}
                                  </Badge>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleClearSingleVaultKey(keyName)
                                    }
                                    disabled={isSavingVault}
                                    title={t("admin.vault.clearSingleTitle", {
                                      keyName,
                                    })}
                                    aria-label={t(
                                      "admin.vault.clearSingleTitle",
                                      {
                                        keyName,
                                      }
                                    )}
                                    className="inline-flex size-7 items-center justify-center rounded border border-white/[0.08] bg-[#13151D] text-[#8B8D98] transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 rounded-md border-white/[0.08] bg-[#0B0C10] font-mono text-[10.5px] text-[#8B8D98]"
                                >
                                  {t("admin.vault.unsetBadge")}
                                </Badge>
                              )}
                            </div>
                            <Input
                              id={`vault-${keyName}`}
                              type="password"
                              autoComplete="off"
                              value={vaultInputs[keyName]}
                              onChange={(e) =>
                                setVaultInputs((prev) => ({
                                  ...prev,
                                  [keyName]: e.target.value,
                                }))
                              }
                              placeholder={t("admin.vault.placeholder")}
                              className="h-11 border-white/[0.08] bg-[#0B0C10]/90 font-mono text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] placeholder:text-zinc-600 focus-visible:border-ring md:h-8 md:text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-1">
                      <Button
                        type="submit"
                        data-testid="btn-save-vault"
                        disabled={isSavingVault || !hasVaultInput}
                        className="h-11 w-full border border-amber-400/60 bg-amber-500 text-xs font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-45 md:h-9"
                      >
                        {isSavingVault ? (
                          <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin" />
                        ) : (
                          <Lock className="mr-1.5 size-3.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {isSavingVault
                            ? t("admin.vault.savingButton")
                            : t("admin.vault.saveButton")}
                        </span>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Card 03: Commercial & Paywall Configuration */}
              <Card className="studio-deck flex flex-col rounded-lg ring-0 text-[#F4F4F5]">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold text-[#F4F4F5]">
                      <span className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-[#050507] px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[#8B8D98] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                        03
                      </span>
                      <DollarSign className="size-4 shrink-0 text-amber-400" />
                      <span>{stripLeadingIndex(t("admin.card2Title"))}</span>
                    </CardTitle>
                    {hasUnsavedBusinessChanges && (
                      <Badge
                        data-testid="badge-unsaved-config"
                        className="shrink-0 rounded-md border border-amber-500/35 bg-amber-500/10 font-mono text-[10px] font-medium text-amber-300"
                      >
                        {t("admin.unsavedChangesBadge")}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs text-[#8B8D98]">
                    {t("admin.card2Desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <form
                    onSubmit={handleSaveBusinessConfig}
                    className="flex flex-1 flex-col justify-between gap-3.5"
                  >
                    <div className="space-y-3.5">
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
                            className="h-11 border-white/[0.08] bg-[#050507] text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] focus-visible:border-ring md:h-9 md:text-xs"
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
                            className="h-11 border-white/[0.08] bg-[#050507] text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] focus-visible:border-ring md:h-9 md:text-xs"
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
                            className="h-11 border-white/[0.08] bg-[#050507] font-mono text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] focus-visible:border-ring md:h-9 md:text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-3.5 border-t border-white/[0.06] pt-3.5">
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
                            className="h-11 border-white/[0.08] bg-[#050507] font-mono text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] focus-visible:border-ring md:h-9 md:text-xs"
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
                            className="h-11 border-white/[0.08] bg-[#050507] font-mono text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] focus-visible:border-ring md:h-9 md:text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="h-11 w-full border border-amber-400/60 bg-amber-500 text-xs font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:bg-amber-400 md:h-9"
                    >
                      <span className="truncate">
                        {t("admin.saveSettingsButton")}
                      </span>
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Card 04: Client Access Links & WhatsApp Invite Generator */}
              <Card className="studio-deck flex flex-col rounded-lg ring-0 text-[#F4F4F5]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold text-[#F4F4F5]">
                    <span className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-[#050507] px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[#8B8D98] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                      04
                    </span>
                    <Share2 className="size-4 shrink-0 text-amber-400" />
                    <span>{stripLeadingIndex(t("admin.card3Title"))}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-[#8B8D98]">
                    {t("admin.card3Desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-zinc-300">
                      {t("admin.vipCodesLabelBefore")}
                      <code className="text-[#8B8D98]">VIP_CLIENT_CODES</code>
                      {t("admin.vipCodesLabelAfter")}
                    </span>
                    {vipCodes.length === 0 ? (
                      <div
                        data-testid="vip-codes-empty"
                        className="studio-well flex items-start gap-2.5 rounded-lg border-dashed px-3.5 py-3 text-xs text-[#8B8D98]"
                      >
                        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
                        <p className="leading-relaxed">
                          {t("admin.vipCodesEmpty")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {vipCodes.map((code) => (
                          <div
                            key={code}
                            className="studio-well flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Sparkles className="size-3.5 shrink-0 text-amber-400" />
                              <code className="truncate text-xs font-semibold text-[#F4F4F5]">
                                {code}
                              </code>
                            </div>
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              onClick={() => void handleCopyInviteLink(code)}
                              className="h-9 shrink-0 border border-white/[0.1] bg-[#13151D] text-zinc-200 hover:border-white/[0.18] hover:bg-[#191c26] hover:text-[#F4F4F5] md:h-6"
                            >
                              <Copy className="mr-1.5 size-3" />
                              {t("admin.copyInviteButton")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="studio-well space-y-1.5 rounded-lg p-3">
                    <label
                      htmlFor="admin-custom-invite"
                      className="text-xs font-medium text-zinc-300"
                    >
                      {t("admin.customInviteLabel")}
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="admin-custom-invite"
                        value={customInviteCode}
                        onChange={(e) => setCustomInviteCode(e.target.value)}
                        placeholder={t("admin.customInvitePlaceholder")}
                        className="h-11 min-w-0 flex-1 border-white/[0.08] bg-[#050507] font-mono text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] focus-visible:border-ring md:h-8 md:text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!customInviteCode.trim()}
                        onClick={() =>
                          void handleCopyInviteLink(customInviteCode)
                        }
                        className="h-11 shrink-0 border border-white/[0.12] bg-[#13151D] px-3 text-xs font-semibold text-[#F4F4F5] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/[0.2] hover:bg-[#191c26] md:h-8"
                      >
                        <Copy className="mr-1.5 size-3.5" />
                        {t("admin.copyInviteButton")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 05: Operator Sandbox & Device Controls (Clean 3-Column Equal-Height Grid) */}
              <Card className="studio-deck rounded-lg ring-0 text-[#F4F4F5] lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-heading text-base font-semibold text-[#F4F4F5]">
                    <span className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-[#050507] px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[#8B8D98] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                      05
                    </span>
                    <Sliders className="size-4 shrink-0 text-emerald-400" />
                    <span>{stripLeadingIndex(t("admin.card4Title"))}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-[#8B8D98]">
                    {t("admin.card4Desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-3">
                  <Button
                    type="button"
                    onClick={handleEnableOperatorBrowser}
                    className="h-full min-h-11 w-full justify-start whitespace-normal border border-emerald-400/50 bg-emerald-500 px-3.5 py-2.5 text-left text-xs font-semibold text-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-emerald-400 md:min-h-10"
                  >
                    <UserCheck className="mr-2 size-4 shrink-0" />
                    <span>{t("admin.enableOperatorButton")}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSwitchToNormalClientView}
                    className="h-full min-h-11 w-full justify-start whitespace-normal border-white/[0.1] bg-[#13151D] px-3.5 py-2.5 text-left text-xs font-medium text-zinc-200 hover:border-white/[0.18] hover:bg-[#191c26] hover:text-[#F4F4F5] md:min-h-10"
                  >
                    <Eye className="mr-2 size-4 shrink-0 text-[#8B8D98]" />
                    <span>{t("admin.switchClientButton")}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResetLocalTrial}
                    className="h-full min-h-11 w-full justify-start whitespace-normal border-white/[0.1] bg-[#13151D] px-3.5 py-2.5 text-left text-xs font-medium text-zinc-200 hover:border-white/[0.18] hover:bg-[#191c26] hover:text-[#F4F4F5] md:min-h-10"
                  >
                    <RotateCcw className="mr-2 size-4 shrink-0 text-[#8B8D98]" />
                    <span>
                      {t("admin.resetTrialButton", {
                        max: businessForm.maxTrialCredits,
                      })}
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
