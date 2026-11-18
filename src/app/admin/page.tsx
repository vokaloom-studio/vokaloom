"use client";

import React, { useCallback, useEffect, useState } from "react";
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
      const headers: Record<string, string> = {};
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
      toast.error("Please enter the Master Admin Password.");
      return;
    }

    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin-login",
          code: trimmed,
        }),
      });

      if (!res.ok) {
        toast.error("Invalid Master Admin Password.");
        return;
      }

      const data = (await res.json()) as { valid?: boolean; role?: string };
      if (data.valid) {
        const updatedQuota = enableOperatorMode("operator");
        setLocalQuota(updatedQuota);
        setPasswordInput("");
        await fetchAdminStatus(trimmed);
        toast.success("Authenticated into Vokaloom Admin Control Center.");
      } else {
        toast.error("Invalid Master Admin Password.");
      }
    } catch {
      toast.error("Failed to verify admin credentials.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveBusinessConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveBusinessConfig(businessForm);
    setBusinessForm(saved);
    toast.success(
      "Saved Commercial & Paywall Configuration for this workstation."
    );
  };

  const handleCopyInviteLink = async (code: string) => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000";
    const inviteUrl = `${origin}/?key=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success(`Copied VIP Invite Link: ${inviteUrl}`);
    } catch {
      toast.info(`Invite Link: ${inviteUrl}`);
    }
  };

  const handleEnableOperatorBrowser = () => {
    const updated = enableOperatorMode("operator");
    setLocalQuota(updated);
    toast.success("Unlimited Operator Mode enabled on this browser.");
  };

  const handleSwitchToNormalClientView = () => {
    const updated = deactivateOperatorMode();
    setLocalQuota(updated);
    toast.info(
      "Switched to Normal Client View. You can now test the trial counter and paywall."
    );
  };

  const handleResetLocalTrial = () => {
    const updated = resetTrialForDemo();
    setLocalQuota(updated);
    toast.success(
      `Reset local trial credits to ${updated.creditsRemaining}/${updated.maxTrialCredits}.`
    );
  };

  const engineList = [
    {
      name: "Gemini 2.5 Flash Vision (Boss Reference Matcher)",
      active: health.geminiConfigured,
      envVar: "GEMINI_API_KEY",
    },
    {
      name: "Gemini 2.5 Native Neural TTS (Voiceover Engine)",
      active: health.geminiConfigured,
      envVar: "GEMINI_API_KEY",
    },
    {
      name: "Pexels Portrait Stock API",
      active: health.pexelsConfigured,
      envVar: "PEXELS_API_KEY",
    },
    {
      name: "Unsplash Portrait Stock API",
      active: health.unsplashConfigured,
      envVar: "UNSPLASH_ACCESS_KEY",
    },
    {
      name: "Fal.ai Serverless GPU (Kokoro-82M & F5-TTS Voice Cloning)",
      active: health.falConfigured,
      envVar: "FAL_KEY",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/20">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                  Vokaloom Admin Control Center
                </h1>
                <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-300">
                  Operator Console
                </Badge>
              </div>
              <p className="text-xs text-zinc-400">
                Server-Side API Engine Diagnostics, Paywall Configuration &amp;
                VIP Client Invite Generator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300"
            >
              Browser Mode:{" "}
              {localQuota.isOperator
                ? "Unlimited Operator"
                : `Client Trial (${localQuota.creditsRemaining}/${localQuota.maxTrialCredits})`}
            </Badge>
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              Return to Studio (/)
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
                  Operator Authentication Required
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Enter your server-side{" "}
                  <code className="text-zinc-300">ADMIN_MASTER_KEY</code> to
                  access engine diagnostics, paywall settings, and VIP invite
                  links.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-master-password"
                      className="text-xs font-medium text-zinc-300"
                    >
                      Master Admin Password
                    </label>
                    <Input
                      id="admin-master-password"
                      type="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Enter ADMIN_MASTER_KEY..."
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
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Verifying with Server...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 size-4" />
                        Unlock Admin Control Center
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
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                    <Activity className="size-4 text-emerald-400" />
                    1. API &amp; AI Engine Health Status
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
                    Refresh Health Status
                  </Button>
                </div>
                <CardDescription className="text-xs text-zinc-400">
                  Live server-side check of `.env.local` / Vercel environment
                  variables without exposing secret keys to the browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {engineList.map((eng) => (
                  <div
                    key={eng.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/80 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-xs font-semibold text-zinc-100">
                        {eng.name}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        Env: {eng.envVar}
                      </p>
                    </div>
                    {eng.active ? (
                      <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-[11px] font-semibold text-emerald-300">
                        <CheckCircle2 className="mr-1 size-3" />
                        Live Neural / API Active
                      </Badge>
                    ) : (
                      <Badge className="border border-amber-500/30 bg-amber-500/15 text-[11px] font-semibold text-amber-300">
                        <AlertTriangle className="mr-1 size-3" />
                        Zero-Key Fallback Active
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
                  <DollarSign className="size-4 text-violet-400" />
                  2. Commercial &amp; Paywall Configuration
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Customize the Pro Pass pricing, Wompi/Stripe checkout links,
                  and guest trial credit limit.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleSaveBusinessConfig}
                  className="space-y-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-300">
                        Price (COP)
                      </label>
                      <Input
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
                      <label className="text-xs font-medium text-zinc-300">
                        Price (USD)
                      </label>
                      <Input
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
                      <label className="text-xs font-medium text-zinc-300">
                        Free Trial Credits
                      </label>
                      <Input
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
                    <label className="text-xs font-medium text-zinc-300">
                      Wompi / Nequi / PSE Checkout URL (COP)
                    </label>
                    <Input
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
                    <label className="text-xs font-medium text-zinc-300">
                      Stripe Global Checkout URL (USD)
                    </label>
                    <Input
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
                    Save Paywall &amp; Pricing Settings
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Card 3: Client Access Links & WhatsApp Invite Generator */}
            <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <Share2 className="size-4 text-violet-400" />
                  3. Client Access Links &amp; WhatsApp Invite Generator
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Generate 1-click auto-unlock links (`/?key=...`) for paying
                  clients or VIP testers on WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-medium text-zinc-300">
                    Active Server-Side VIP Client Codes (
                    <code className="text-zinc-400">VIP_CLIENT_CODES</code>)
                  </span>
                  <div className="space-y-2">
                    {vipCodes.map((code) => (
                      <div
                        key={code}
                        className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="size-3.5 text-violet-400" />
                          <code className="text-xs font-semibold text-violet-200">
                            {code}
                          </code>
                        </div>
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={() => void handleCopyInviteLink(code)}
                          className="border border-violet-500/30 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                        >
                          <Copy className="mr-1.5 size-3" />
                          Copy VIP Invite Link
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                  <label className="text-xs font-medium text-zinc-300">
                    Custom Invite Code Link Builder
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={customInviteCode}
                      onChange={(e) => setCustomInviteCode(e.target.value)}
                      placeholder="Enter access code..."
                      className="h-8 border-zinc-800 bg-zinc-900 font-mono text-xs text-white"
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
                      Copy VIP Invite Link
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Operator Sandbox & Device Controls */}
            <Card className="border-zinc-800/90 bg-zinc-900/50 text-zinc-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                  <Sliders className="size-4 text-emerald-400" />
                  4. Operator Sandbox &amp; Device Controls
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Switch this browser between Unlimited Operator Mode and Normal
                  Client View to test the 3-credit trial and paywall experience.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  type="button"
                  onClick={handleEnableOperatorBrowser}
                  className="h-9 w-full justify-start bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <UserCheck className="mr-2 size-4" />
                  Enable Unlimited Operator Mode on This Browser
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSwitchToNormalClientView}
                  className="h-9 w-full justify-start border-zinc-700 bg-zinc-950 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  <Eye className="mr-2 size-4 text-amber-400" />
                  Switch to Normal Client View (Test Paywall)
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetLocalTrial}
                  className="h-9 w-full justify-start border-zinc-700 bg-zinc-950 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  <RotateCcw className="mr-2 size-4 text-violet-400" />
                  Reset Local Trial Credits to 3/3
                </Button>

                <Link
                  href="/"
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-500/25 hover:text-white"
                >
                  <ArrowLeft className="size-4" />
                  Return to Studio (/)
                </Link>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
