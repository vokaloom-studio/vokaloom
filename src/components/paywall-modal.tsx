"use client";

import React, { useEffect, useState } from "react";
import {
  Crown,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
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
      <DialogContent className="relative overflow-hidden border border-zinc-800/90 border-t-2 border-t-violet-500/60 bg-[#0c0c10] p-0 text-[#f4f4f6] shadow-2xl sm:max-w-lg">
        <div className="space-y-4 p-5 sm:p-6">
          <DialogHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 pr-8 font-mono text-[11px]">
              <span className="text-violet-400">{t("paywall.badgeTitle")}</span>
              <span className="text-zinc-600">·</span>
              {quota.isOperator ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="size-3" />
                  {t("paywall.badgeActive")}
                </span>
              ) : (
                <span className="tabular-nums text-amber-400">
                  {t("paywall.badgeTrial", {
                    remaining: quota.creditsRemaining,
                    max: quota.maxTrialCredits,
                  })}
                </span>
              )}
            </div>

            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-100 sm:text-lg">
              <Crown className="size-4 shrink-0 text-violet-400" />
              <span>{t("paywall.title")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-[#8a8a95]">
              {t("paywall.description")}
            </DialogDescription>
          </DialogHeader>

          {/* Pricing & Benefit Summary */}
          <div className="rounded-lg border border-zinc-800/80 bg-[#131318] p-4">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 pb-3">
              <div className="space-y-0.5">
                <span className="block text-xs font-semibold text-zinc-100">
                  {t("paywall.planName")}
                </span>
                <span className="block font-mono text-[11px] text-[#8a8a95]">
                  {t("paywall.planSubtitle")}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-xl font-semibold tracking-tight tabular-nums text-zinc-100">
                    {businessConfig.priceUsd}
                  </span>
                  <span className="text-xs text-[#8a8a95]">
                    {t("paywall.perMonthShort")}
                  </span>
                </div>
                <span className="block font-mono text-[11px] tabular-nums text-[#8a8a95]">
                  {t("paywall.approxCopPerMonth", {
                    priceCop: businessConfig.priceCop,
                  })}
                </span>
              </div>
            </div>

            <ul className="space-y-2 pt-3">
              {PRO_BENEFIT_KEYS.map((benefitKey) => (
                <li
                  key={benefitKey}
                  className="flex items-start gap-2 text-xs text-zinc-300"
                >
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                  <span className="leading-snug">{t(benefitKey)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Local (COP) & Global (USD) Checkout Actions */}
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
              className="h-auto min-h-9 w-full whitespace-normal bg-violet-600 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-violet-500"
            >
              <CreditCard className="mr-2 size-3.5 shrink-0" />
              <span>
                {t("paywall.checkoutCopButton", {
                  priceCop: businessConfig.priceCop,
                })}
              </span>
              <ExternalLink className="ml-1.5 size-3 shrink-0 opacity-80" />
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
              className="h-auto min-h-9 w-full whitespace-normal border-zinc-800 bg-[#131318] px-3 py-2 text-center text-xs font-semibold text-zinc-100 hover:border-zinc-700 hover:bg-zinc-800"
            >
              <CreditCard className="mr-2 size-3.5 shrink-0 text-zinc-400" />
              <span>
                {t("paywall.checkoutUsdButton", {
                  priceUsd: businessConfig.priceUsd,
                })}
              </span>
              <ExternalLink className="ml-1.5 size-3 shrink-0 opacity-80" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800/80" />
            <span className="text-center font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              {t("paywall.dividerLabel")}
            </span>
            <div className="h-px flex-1 bg-zinc-800/80" />
          </div>

          {/* Pro Pass / Client Access Code Form */}
          <form onSubmit={handleActivateKey} className="space-y-2">
            <label
              htmlFor="paywall-access-code"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
            >
              <KeyRound className="size-3.5 shrink-0 text-zinc-400" />
              <span>{t("paywall.codeLabel")}</span>
            </label>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input
                id="paywall-access-code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder={t("paywall.codePlaceholder")}
                disabled={isVerifying}
                className="h-9 min-w-0 flex-1 border-zinc-800 bg-[#070709] font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:border-zinc-600"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={isVerifying}
                className="h-9 shrink-0 border border-zinc-700 bg-[#131318] px-4 text-xs font-semibold text-zinc-100 hover:bg-zinc-800"
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
