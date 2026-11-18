"use client";

import React, { useState } from "react";
import {
  Crown,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  CreditCard,
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
import { activateOperatorKey, type QuotaState } from "@/lib/quota";

export interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quota: QuotaState;
  onQuotaChange?: (state: QuotaState) => void;
}

const PRO_BENEFITS = [
  "Unlimited 15-Image Aesthetic Batches (9:16 Vertical HD + ZIP Export)",
  "Unlimited Boss Reference Image Matching (Gemini 2.5 Flash Vision)",
  "Unlimited Realistic AI Voiceovers (Spanish & English via Kokoro-82M)",
  "Unlimited Zero-Shot Custom Voice Cloning (10–30s Audio via MIT F5-TTS)",
  "100% Commercial & Agency Service-Fulfillment License",
];

export function PaywallModal({
  open,
  onOpenChange,
  quota,
  onQuotaChange,
}: PaywallModalProps) {
  const [operatorKey, setOperatorKey] = useState<string>("");

  const checkoutUrlCop =
    process.env.NEXT_PUBLIC_CHECKOUT_URL_COP ||
    "https://checkout.wompi.co/l/your_60000_cop_link";
  const checkoutUrlUsd =
    process.env.NEXT_PUBLIC_CHECKOUT_URL_USD ||
    "https://buy.stripe.com/your_15_usd_link";

  const handleOpenCheckout = (url: string, label: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    toast.info(`Opened ${label} checkout in a new tab.`);
  };

  const handleActivateKey = (e: React.FormEvent) => {
    e.preventDefault();
    const res = activateOperatorKey(operatorKey);
    if (res.success) {
      onQuotaChange?.(res.state);
      setOperatorKey("");
      onOpenChange(false);
      toast.success(
        "Operator / VIP Mode Activated! Unlimited generations unlocked."
      );
    } else {
      toast.error(
        "Invalid Access Key. Enter VOKALOOM-ADMIN-2026 to unlock Operator Mode."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 p-6 text-zinc-100 sm:max-w-lg">
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge className="border border-violet-500/40 bg-violet-500/15 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
              <Sparkles className="mr-1 size-3" />
              Vokaloom Pro Pass
            </Badge>
            {quota.isOperator ? (
              <Badge className="border border-emerald-500/40 bg-emerald-500/15 text-xs text-emerald-300">
                <ShieldCheck className="mr-1 size-3" />
                Operator Active
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-xs text-amber-300"
              >
                Trial Credits: {quota.creditsRemaining}/{quota.maxTrialCredits}{" "}
                left
              </Badge>
            )}
          </div>

          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
            <Crown className="size-5 text-violet-400" />
            Unlimited Aesthetic Batches &amp; AI Voiceovers
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-zinc-400">
            Unlock full agency production speed with unlimited 15-image
            aesthetic background batches, Gemini Vision reference matching, and
            realistic Spanish &amp; English neural voiceovers.
          </DialogDescription>
        </DialogHeader>

        {/* Value Proposition Checklist */}
        <div className="my-2 space-y-2 rounded-xl border border-zinc-800/90 bg-zinc-900/60 p-4">
          <div className="flex items-baseline justify-between border-b border-zinc-800 pb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              All-In-One Fulfillment Pass
            </span>
            <div className="text-right">
              <span className="text-lg font-bold text-white">$15 USD</span>
              <span className="text-xs text-zinc-400">
                {" "}
                / ~$60,000 COP · mes
              </span>
            </div>
          </div>

          <ul className="space-y-2 pt-1">
            {PRO_BENEFITS.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-2 text-xs text-zinc-200"
              >
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Two Primary Checkout Buttons (COP & USD) */}
        <div className="space-y-2.5">
          <Button
            type="button"
            onClick={() =>
              handleOpenCheckout(checkoutUrlCop, "Wompi / Nequi / PSE ($60,000 COP)")
            }
            className="h-10 w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-xs font-semibold text-white shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500 sm:text-sm"
          >
            <CreditCard className="mr-2 size-4" />
            Suscribirse por $60,000 COP / mes (Nequi / PSE / Wompi)
            <ExternalLink className="ml-1.5 size-3.5 opacity-80" />
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              handleOpenCheckout(checkoutUrlUsd, "Stripe Global ($15 USD)")
            }
            className="h-10 w-full border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-100 hover:bg-zinc-800 hover:text-white sm:text-sm"
          >
            <CreditCard className="mr-2 size-4 text-violet-400" />
            Subscribe for $15 USD / month (Stripe Global)
            <ExternalLink className="ml-1.5 size-3.5 opacity-80" />
          </Button>
        </div>

        {/* Divider */}
        <div className="relative my-1 flex items-center justify-center">
          <div className="w-full border-t border-zinc-800" />
          <span className="bg-zinc-950 px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Or Instant Key Activation
          </span>
          <div className="w-full border-t border-zinc-800" />
        </div>

        {/* Operator / VIP Access Key Form */}
        <form onSubmit={handleActivateKey} className="space-y-2.5">
          <label
            htmlFor="paywall-operator-key"
            className="flex items-center justify-between text-xs font-medium text-zinc-300"
          >
            <span className="flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-violet-400" />
              Operator / VIP Access Key
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              Demo: VOKALOOM-ADMIN-2026
            </span>
          </label>
          <div className="flex gap-2">
            <Input
              id="paywall-operator-key"
              value={operatorKey}
              onChange={(e) => setOperatorKey(e.target.value)}
              placeholder="Enter VOKALOOM-ADMIN-2026..."
              className="h-9 border-zinc-800 bg-zinc-900 font-mono text-xs text-white placeholder:text-zinc-500"
            />
            <Button
              type="submit"
              variant="secondary"
              className="h-9 shrink-0 border border-violet-500/40 bg-violet-500/20 px-4 text-xs font-semibold text-violet-200 hover:bg-violet-500/30 hover:text-white"
            >
              Unlock Unlimited
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
