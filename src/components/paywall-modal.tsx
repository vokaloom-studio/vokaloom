"use client";

import React, { useEffect, useState } from "react";
import {
  Crown,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/locale-provider";
import type { TranslationKey } from "@/lib/i18n";
import {
  getBusinessConfig,
  verifyAndActivateAccessCode,
  type BusinessConfig,
  type QuotaState,
} from "@/lib/quota";

export interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quota: QuotaState;
  onQuotaChange?: (state: QuotaState) => void;
}

const PRO_BENEFIT_KEYS: readonly TranslationKey[] = [
  "paywall.benefit1",
  "paywall.benefit2",
  "paywall.benefit3",
  "paywall.benefit4",
  "paywall.benefit5",
];

export function PaywallModal({
  open,
  onOpenChange,
  quota,
  onQuotaChange,
}: PaywallModalProps) {
  const { locale, t } = useLocale();
  const [accessCode, setAccessCode] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig>({
    priceCop: "$60,000 COP",
    priceUsd: "$15 USD",
    maxTrialCredits: 3,
    checkoutUrlCop:
      process.env.NEXT_PUBLIC_CHECKOUT_URL_COP ||
      "https://checkout.wompi.co/l/your_60000_cop_link",
    checkoutUrlUsd:
      process.env.NEXT_PUBLIC_CHECKOUT_URL_USD ||
      "https://buy.stripe.com/your_15_usd_link",
  });

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setBusinessConfig(getBusinessConfig());
      });
    }
  }, [open]);

  const handleOpenCheckout = (url: string, label: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    toast.info(t("paywall.toast.openedCheckout", { label }));
  };

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      toast.error(t("paywall.toast.enterCode"));
      return;
    }

    setIsVerifying(true);
    try {
      const res = await verifyAndActivateAccessCode(accessCode, locale);
      if (res.success) {
        onQuotaChange?.(res.state);
        setAccessCode("");
        onOpenChange(false);
        toast.success(
          res.role === "operator"
            ? t("paywall.toast.operatorActivated")
            : t("paywall.toast.proActivated")
        );
      } else {
        toast.error(t("paywall.toast.invalidCode"));
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relative overflow-hidden border border-white/[0.09] bg-[#08080c]/90 p-0 text-zinc-100 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.9)] backdrop-blur-2xl ring-1 ring-white/[0.06] sm:max-w-lg">
        {/* Subtle Purple Ambient Glow & Top Specular Edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/45 to-transparent"
        />

        <div className="relative space-y-5 p-6">
          <DialogHeader className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <Badge
                variant="outline"
                className="border-violet-500/35 bg-violet-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-violet-200"
              >
                <Sparkles className="mr-1.5 size-3 text-violet-300" />
                {t("paywall.badgeTitle")}
              </Badge>
              {quota.isOperator ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[11px] text-emerald-300"
                >
                  <ShieldCheck className="mr-1 size-3" />
                  {t("paywall.badgeActive")}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 font-mono text-[11px] tabular-nums text-amber-300"
                >
                  {t("paywall.badgeTrial", {
                    remaining: quota.creditsRemaining,
                    max: quota.maxTrialCredits,
                  })}
                </Badge>
              )}
            </div>

            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white sm:text-xl">
              <Crown className="size-5 shrink-0 text-violet-400" />
              <span>{t("paywall.title")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-zinc-400">
              {t("paywall.description")}
            </DialogDescription>
          </DialogHeader>

          {/* High-End Obsidian Pricing Card */}
          <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-3.5">
              <div className="space-y-0.5">
                <span className="block text-xs font-semibold tracking-tight text-white">
                  {t("paywall.planName")}
                </span>
                <span className="block font-mono text-[11px] text-zinc-400">
                  {t("paywall.planSubtitle")}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums text-white">
                    {businessConfig.priceUsd}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {t("paywall.perMonthShort")}
                  </span>
                </div>
                <span className="block font-mono text-[11px] tabular-nums text-zinc-400">
                  {t("paywall.approxCopPerMonth", {
                    priceCop: businessConfig.priceCop,
                  })}
                </span>
              </div>
            </div>

            <ul className="space-y-2.5 pt-3.5">
              {PRO_BENEFIT_KEYS.map((benefitKey) => (
                <li
                  key={benefitKey}
                  className="flex items-start gap-2.5 text-xs text-zinc-200"
                >
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                  <span className="leading-snug">{t(benefitKey)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Local (COP) & Global (USD) Payment Buttons */}
          <div className="space-y-2">
            <Button
              type="button"
              onClick={() =>
                handleOpenCheckout(
                  businessConfig.checkoutUrlCop,
                  t("paywall.checkoutCopLabel", {
                    priceCop: businessConfig.priceCop,
                  })
                )
              }
              className="h-auto min-h-10 w-full whitespace-normal bg-violet-600 px-3 py-2 text-center text-xs font-semibold tracking-tight text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500 sm:text-sm"
            >
              <CreditCard className="mr-2 size-4 shrink-0" />
              <span>
                {t("paywall.checkoutCopButton", {
                  priceCop: businessConfig.priceCop,
                })}
              </span>
              <ExternalLink className="ml-1.5 size-3.5 shrink-0 opacity-80" />
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                handleOpenCheckout(
                  businessConfig.checkoutUrlUsd,
                  t("paywall.checkoutUsdLabel", {
                    priceUsd: businessConfig.priceUsd,
                  })
                )
              }
              className="h-auto min-h-10 w-full whitespace-normal border-white/[0.1] bg-white/[0.04] px-3 py-2 text-center text-xs font-semibold tracking-tight text-zinc-100 hover:border-white/20 hover:bg-white/[0.08] hover:text-white sm:text-sm"
            >
              <CreditCard className="mr-2 size-4 shrink-0 text-violet-400" />
              <span>
                {t("paywall.checkoutUsdButton", {
                  priceUsd: businessConfig.priceUsd,
                })}
              </span>
              <ExternalLink className="ml-1.5 size-3.5 shrink-0 opacity-80" />
            </Button>
          </div>

          {/* Translucent Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <span className="text-center font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {t("paywall.dividerLabel")}
            </span>
            <div className="h-px flex-1 bg-white/[0.07]" />
          </div>

          {/* Pro Pass / Client Access Code Form */}
          <form onSubmit={handleActivateKey} className="space-y-2">
            <label
              htmlFor="paywall-access-code"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
            >
              <KeyRound className="size-3.5 shrink-0 text-violet-400" />
              <span>{t("paywall.codeLabel")}</span>
            </label>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input
                id="paywall-access-code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder={t("paywall.codePlaceholder")}
                disabled={isVerifying}
                className="h-9 min-w-0 flex-1 border-white/[0.08] bg-zinc-950/75 font-mono text-xs text-white placeholder:text-zinc-500 focus-visible:border-violet-500/60"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={isVerifying}
                className="h-9 shrink-0 border border-violet-500/35 bg-violet-500/15 px-4 text-xs font-semibold text-violet-100 hover:border-violet-400/50 hover:bg-violet-500/25 hover:text-white"
              >
                {isVerifying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  t("paywall.unlockButton")
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
