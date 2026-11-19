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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/locale-provider";
import type { TranslationKey } from "@/lib/i18n";
import {
  DEFAULT_CHECKOUT_URL_COP,
  DEFAULT_CHECKOUT_URL_USD,
  getBusinessConfig,
  hasProAccess,
  sanitizeCheckoutUrl,
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
];

export function PaywallModal({
  open,
  onOpenChange,
  quota,
  onQuotaChange,
}: PaywallModalProps) {
  const { locale, t } = useLocale();
  const [currency, setCurrency] = useState<"cop" | "usd">("cop");
  const [accessCode, setAccessCode] = useState<string>("");
  const [codeError, setCodeError] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig>({
    priceCop: "$60,000 COP",
    priceUsd: "$15 USD",
    maxTrialCredits: 3,
    checkoutUrlCop: DEFAULT_CHECKOUT_URL_COP,
    checkoutUrlUsd: DEFAULT_CHECKOUT_URL_USD,
  });

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setBusinessConfig(getBusinessConfig());
        setCodeError("");
      });
    }
  }, [open]);

  const handleOpenCheckout = (
    url: string,
    label: string,
    fallbackUrl: string = DEFAULT_CHECKOUT_URL_COP
  ) => {
    const safeUrl = sanitizeCheckoutUrl(url, fallbackUrl);
    if (safeUrl !== url.trim()) {
      setBusinessConfig(getBusinessConfig());
    }
    window.open(safeUrl, "_blank", "noopener,noreferrer");
    toast.info(t("paywall.toast.openedCheckout", { label }));
  };

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      const msg = t("paywall.toast.enterCode");
      setCodeError(msg);
      toast.error(msg);
      return;
    }

    setCodeError("");
    setIsVerifying(true);
    try {
      const res = await verifyAndActivateAccessCode(accessCode, locale);
      if (res.success) {
        onQuotaChange?.(res.state);
        setAccessCode("");
        setCodeError("");
        onOpenChange(false);
        toast.success(
          res.role === "operator"
            ? t("paywall.toast.operatorActivated")
            : t("paywall.toast.proActivated")
        );
      } else {
        const msg = res.error || t("paywall.toast.invalidCode");
        setCodeError(msg);
        toast.error(msg);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const proActive = hasProAccess(quota);
  const copCheckout = {
    url: businessConfig.checkoutUrlCop,
    fallbackUrl: DEFAULT_CHECKOUT_URL_COP,
    label: t("paywall.checkoutCopLabel", { priceCop: businessConfig.priceCop }),
    buttonText: t("paywall.checkoutCopButton", {
      priceCop: businessConfig.priceCop,
    }),
  };
  const usdCheckout = {
    url: businessConfig.checkoutUrlUsd,
    fallbackUrl: DEFAULT_CHECKOUT_URL_USD,
    label: t("paywall.checkoutUsdLabel", { priceUsd: businessConfig.priceUsd }),
    buttonText: t("paywall.checkoutUsdButton", {
      priceUsd: businessConfig.priceUsd,
    }),
  };
  const primaryCheckout = currency === "cop" ? copCheckout : usdCheckout;
  const secondaryCheckout = currency === "cop" ? usdCheckout : copCheckout;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="studio-deck max-h-[94vh] overflow-y-auto border-white/[0.12] border-t-2 border-t-amber-500/80 bg-[#0B0C10] p-0 text-[#F4F4F5] sm:max-w-xl">
        <div className="space-y-3.5 p-4 sm:p-5">
          <DialogHeader className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 pr-10 font-mono text-[11px] md:pr-8">
              <span className="text-amber-400">{t("paywall.badgeTitle")}</span>
              <span className="text-zinc-600">·</span>
              {proActive ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="size-3" />
                  {t("paywall.badgeActive")}
                </span>
              ) : (
                <span className="tabular-nums text-amber-300">
                  {t("paywall.badgeTrial", {
                    remaining: quota.creditsRemaining,
                    max: quota.maxTrialCredits,
                  })}
                </span>
              )}
            </div>

            <DialogTitle
              data-testid="paywall-title"
              className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight text-[#F4F4F5] sm:text-lg"
            >
              <Crown className="size-4 shrink-0 text-amber-400" />
              <span>{t("paywall.title")}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Active Pro / Operator Summary (Foregrounded when active) */}
          {proActive && (
            <div
              data-testid="paywall-active-summary"
              className="rounded-lg border border-emerald-500/45 bg-emerald-500/10 p-3.5 shadow-[inset_0_1px_0_rgba(16,185,129,0.18)]"
            >
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-semibold text-emerald-300">
                    {quota.isOperator || quota.role === "operator"
                      ? t("paywall.activeSummaryOperator")
                      : t("paywall.activeSummaryTitle")}
                  </p>
                  <p className="text-[11px] leading-snug text-zinc-300">
                    {t("paywall.activeSummaryDesc")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Currency Selector Switch (Side-by-side 2 equal columns on ALL viewports) */}
          <div
            role="group"
            aria-label={t("paywall.currencyAria")}
            className={`studio-well grid grid-cols-2 gap-1 rounded-lg p-1 transition-opacity ${
              proActive ? "opacity-60" : ""
            }`}
          >
            <button
              type="button"
              data-testid="currency-cop"
              onClick={() => setCurrency("cop")}
              aria-pressed={currency === "cop"}
              className={`studio-segment flex min-h-10 min-w-0 items-center justify-center rounded-md px-2 py-1.5 text-center font-mono text-[10.5px] font-medium md:min-h-0 ${
                currency === "cop"
                  ? "border border-white/[0.12] bg-[#13151D] text-[#F4F4F5]"
                  : "border border-transparent text-[#8B8D98] hover:text-zinc-200"
              }`}
            >
              <span className="truncate sm:hidden">
                {t("paywall.currencyShort.cop")}
              </span>
              <span className="hidden truncate sm:inline">
                {t("paywall.currency.cop")}
              </span>
            </button>
            <button
              type="button"
              data-testid="currency-usd"
              onClick={() => setCurrency("usd")}
              aria-pressed={currency === "usd"}
              className={`studio-segment flex min-h-10 min-w-0 items-center justify-center rounded-md px-2 py-1.5 text-center font-mono text-[10.5px] font-medium md:min-h-0 ${
                currency === "usd"
                  ? "border border-white/[0.12] bg-[#13151D] text-[#F4F4F5]"
                  : "border border-transparent text-[#8B8D98] hover:text-zinc-200"
              }`}
            >
              <span className="truncate sm:hidden">
                {t("paywall.currencyShort.usd")}
              </span>
              <span className="hidden truncate sm:inline">
                {t("paywall.currency.usd")}
              </span>
            </button>
          </div>

          {/* Pricing & Benefit Summary Deck */}
          <div
            className={`studio-elevated rounded-lg p-3.5 transition-opacity ${
              proActive ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-baseline gap-1.5 border-b border-white/[0.08] pb-2.5">
              <span
                data-testid="paywall-price"
                className="font-heading text-xl font-semibold tracking-tight tabular-nums text-[#F4F4F5]"
              >
                {currency === "cop"
                  ? businessConfig.priceCop
                  : businessConfig.priceUsd}
              </span>
              <span className="text-xs text-[#8B8D98]">
                {t("paywall.perMonthShort")}
              </span>
            </div>

            <ul className="space-y-1.5 pt-2.5">
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

          {/* Single Warm Amber Primary Checkout + Quiet Single-Line Secondary Link */}
          <div
            className={`space-y-1.5 transition-opacity ${
              proActive ? "opacity-50" : ""
            }`}
          >
            <Button
              type="button"
              data-testid="btn-checkout-primary"
              onClick={() =>
                handleOpenCheckout(
                  primaryCheckout.url,
                  primaryCheckout.label,
                  primaryCheckout.fallbackUrl
                )
              }
              className="studio-amber-cta h-auto min-h-11 w-full whitespace-normal border border-amber-400/60 bg-amber-500 px-3 py-2 text-center text-xs font-semibold text-zinc-950 hover:bg-amber-400 md:min-h-9.5"
            >
              <CreditCard className="mr-2 size-3.5 shrink-0" />
              <span>{primaryCheckout.buttonText}</span>
              <ExternalLink className="ml-1.5 size-3 shrink-0 opacity-80" />
            </Button>

            <button
              type="button"
              data-testid="btn-checkout-secondary"
              onClick={() =>
                handleOpenCheckout(
                  secondaryCheckout.url,
                  secondaryCheckout.label,
                  secondaryCheckout.fallbackUrl
                )
              }
              className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#8B8D98] transition-colors hover:bg-white/[0.04] hover:text-zinc-200 md:h-8"
            >
              <span className="truncate">
                {currency === "cop"
                  ? t("paywall.secondaryCheckoutToUsd")
                  : t("paywall.secondaryCheckoutToCop")}
              </span>
              <ExternalLink className="size-3 shrink-0 opacity-75" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-center font-mono text-[10px] font-medium uppercase tracking-wider text-[#8B8D98]">
              {t("paywall.dividerLabel")}
            </span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          {/* Pro Pass / Client Access Code Form */}
          <form onSubmit={handleActivateKey} className="space-y-2">
            <label
              htmlFor="paywall-access-code"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
            >
              <KeyRound className="size-3.5 shrink-0 text-amber-400" />
              <span>{t("paywall.codeLabel")}</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input
                  id="paywall-access-code"
                  data-testid="input-access-code"
                  value={accessCode}
                  aria-invalid={Boolean(codeError)}
                  onChange={(e) => {
                    setAccessCode(e.target.value);
                    if (codeError) setCodeError("");
                  }}
                  placeholder={t("paywall.codePlaceholder")}
                  disabled={isVerifying}
                  className={`h-11 w-full bg-[#050507] font-mono text-base text-[#F4F4F5] shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] placeholder:text-zinc-600 md:h-9 md:text-xs ${
                    codeError
                      ? "border-destructive/85 focus-visible:border-destructive focus-visible:ring-destructive/30"
                      : "border-white/[0.08] focus-visible:border-ring"
                  }`}
                />
                {codeError && (
                  <p
                    role="alert"
                    data-testid="paywall-code-error"
                    className="text-[11px] font-medium text-red-400"
                  >
                    {codeError}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                data-testid="btn-unlock-code"
                variant="secondary"
                disabled={isVerifying}
                className="h-11 shrink-0 border border-white/[0.12] bg-[#13151D] px-4 text-xs font-semibold text-[#F4F4F5] hover:border-white/[0.2] hover:bg-[#191c26] md:h-9"
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
