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

const PRO_BENEFITS = [
  "Unlimited 15-Image Aesthetic Batches (9:16 Vertical HD + ZIP Export)",
  "Unlimited Boss Reference Image Matching (Gemini 2.5 Flash Vision)",
  "Unlimited Realistic AI Voiceovers (Spanish & English Neural TTS)",
  "Unlimited Zero-Shot Custom Voice Cloning (10–20s Audio via MIT F5-TTS)",
  "100% Commercial & Agency Service-Fulfillment License",
];

export function PaywallModal({
  open,
  onOpenChange,
  quota,
  onQuotaChange,
}: PaywallModalProps) {
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
    toast.info(`Opened ${label} checkout in a new tab.`);
  };

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      toast.error("Please enter your access code.");
      return;
    }

    setIsVerifying(true);
    try {
      const res = await verifyAndActivateAccessCode(accessCode);
      if (res.success) {
        onQuotaChange?.(res.state);
        setAccessCode("");
        onOpenChange(false);
        toast.success(
          res.role === "operator"
            ? "Operator Mode Activated! Unlimited generations unlocked."
            : "Pro Pass Activated! Unlimited generations unlocked."
        );
      } else {
        toast.error(
          "Invalid Access Code. Please verify your Pro Pass code or complete checkout above."
        );
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
                Vokaloom Pro Pass
              </Badge>
              {quota.isOperator ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[11px] text-emerald-300"
                >
                  <ShieldCheck className="mr-1 size-3" />
                  Active
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 font-mono text-[11px] tabular-nums text-amber-300"
                >
                  Trial: {quota.creditsRemaining}/{quota.maxTrialCredits} left
                </Badge>
              )}
            </div>

            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white sm:text-xl">
              <Crown className="size-5 shrink-0 text-violet-400" />
              Unlimited Aesthetic Batches &amp; AI Voiceovers
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-zinc-400">
              Unlock full agency production speed with unlimited 15-image
              vertical batches, Gemini Vision aesthetic matching, and neural
              Spanish &amp; English voice synthesis.
            </DialogDescription>
          </DialogHeader>

          {/* High-End Obsidian Pricing Card */}
          <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-3.5">
              <div className="space-y-0.5">
                <span className="block text-xs font-semibold tracking-tight text-white">
                  All-In-One Fulfillment Pass
                </span>
                <span className="block font-mono text-[11px] text-zinc-400">
                  Commercial &amp; Agency License
                </span>
              </div>
              <div className="text-right">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums text-white">
                    {businessConfig.priceUsd}
                  </span>
                  <span className="text-xs text-zinc-400">/ mo</span>
                </div>
                <span className="block font-mono text-[11px] tabular-nums text-zinc-400">
                  ~{businessConfig.priceCop} · mes
                </span>
              </div>
            </div>

            <ul className="space-y-2.5 pt-3.5">
              {PRO_BENEFITS.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 text-xs text-zinc-200"
                >
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                  <span className="leading-snug">{benefit}</span>
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
                  `Wompi / Nequi / PSE (${businessConfig.priceCop})`
                )
              }
              className="h-10 w-full bg-violet-600 text-xs font-semibold tracking-tight text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500 sm:text-sm"
            >
              <CreditCard className="mr-2 size-4" />
              Suscribirse por {businessConfig.priceCop} / mes (Nequi / PSE /
              Wompi)
              <ExternalLink className="ml-1.5 size-3.5 opacity-80" />
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                handleOpenCheckout(
                  businessConfig.checkoutUrlUsd,
                  `Stripe Global (${businessConfig.priceUsd})`
                )
              }
              className="h-10 w-full border-white/[0.1] bg-white/[0.04] text-xs font-semibold tracking-tight text-zinc-100 hover:border-white/20 hover:bg-white/[0.08] hover:text-white sm:text-sm"
            >
              <CreditCard className="mr-2 size-4 text-violet-400" />
              Subscribe for {businessConfig.priceUsd} / month (Stripe Global)
              <ExternalLink className="ml-1.5 size-3.5 opacity-80" />
            </Button>
          </div>

          {/* Translucent Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.07]" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Or Instant Key Activation
            </span>
            <div className="h-px flex-1 bg-white/[0.07]" />
          </div>

          {/* Pro Pass / Client Access Code Form */}
          <form onSubmit={handleActivateKey} className="space-y-2">
            <label
              htmlFor="paywall-access-code"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
            >
              <KeyRound className="size-3.5 text-violet-400" />
              Have a Pro Pass or Client Access Code?
            </label>
            <div className="flex gap-2">
              <Input
                id="paywall-access-code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Enter your access code..."
                disabled={isVerifying}
                className="h-9 border-white/[0.08] bg-zinc-950/75 font-mono text-xs text-white placeholder:text-zinc-500 focus-visible:border-violet-500/60"
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
                  "Unlock Unlimited"
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
