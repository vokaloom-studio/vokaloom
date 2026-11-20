"use client";

import React from "react";
import { AlertTriangle, Gauge, PauseCircle, ShieldAlert } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import type { TranslationKey } from "@/lib/i18n";
import type {
  PaidResource,
  PublicQuotaAdvisory,
  PublicQuotaSnapshot,
  PublicResourceQuota,
  QuotaStatusLevel,
} from "@/lib/budget-types";

export interface QuotaMeterProps {
  snapshot: PublicQuotaSnapshot | null;
}

const RESOURCE_META: ReadonlyArray<{
  key: PaidResource;
  shortKey: TranslationKey;
  testId: string;
}> = [
  { key: "image", shortKey: "budget.meter.imgShort", testId: "quota-meter-image" },
  { key: "audio", shortKey: "budget.meter.audShort", testId: "quota-meter-audio" },
  { key: "vision", shortKey: "budget.meter.visShort", testId: "quota-meter-vision" },
];

function getStatusColors(status: QuotaStatusLevel): {
  pill: string;
  bar: string;
  dot: string;
} {
  if (status === "exhausted") {
    return {
      pill: "border-red-500/45 bg-red-500/12 text-red-300",
      bar: "bg-red-400",
      dot: "bg-red-400",
    };
  }
  if (status === "low") {
    return {
      pill: "border-amber-500/45 bg-amber-500/12 text-amber-300",
      bar: "bg-amber-400",
      dot: "bg-amber-400",
    };
  }
  return {
    pill: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
    bar: "bg-emerald-400",
    dot: "bg-emerald-400",
  };
}

function getAdvisoryText(
  advisory: PublicQuotaAdvisory,
  t: (key: TranslationKey, vars?: Record<string, string | number | undefined>) => string
): string {
  const remaining = advisory.remaining ?? 0;
  const limit = advisory.limit ?? 0;

  switch (advisory.code) {
    case "paid_ai_paused":
      return t("budget.meter.advisory.paused");
    case "image_cap_exhausted":
      return t("budget.meter.advisory.imageExhausted", { limit });
    case "image_cap_low":
      return t("budget.meter.advisory.imageLow", { remaining, limit });
    case "audio_cap_exhausted":
      return t("budget.meter.advisory.audioExhausted", { limit });
    case "audio_cap_low":
      return t("budget.meter.advisory.audioLow", { remaining, limit });
    case "vision_cap_exhausted":
      return t("budget.meter.advisory.visionExhausted", { limit });
    case "vision_cap_low":
      return t("budget.meter.advisory.visionLow", { remaining, limit });
    case "stock_quota_low":
    case "stock_rate_limited":
      return t("budget.meter.advisory.stockLow");
    case "provider_circuit_broken":
      return t("budget.meter.advisory.circuitBroken");
    case "provider_balance_floor":
      return t("budget.meter.advisory.providerFloor");
    case "provider_balance_low":
      return t("budget.meter.advisory.providerLowBalance");
    default:
      return t("budget.toast.capReached");
  }
}

export function QuotaMeter({ snapshot }: QuotaMeterProps) {
  const { t } = useLocale();

  if (!snapshot) return null;

  const cappedEntries = RESOURCE_META.map((meta) => ({
    ...meta,
    quota: snapshot.resources[meta.key] as PublicResourceQuota,
  })).filter((entry) => entry.quota.limit !== null);

  const hasAdvisories =
    snapshot.advisories.length > 0 || snapshot.paidAiPaused || snapshot.stockLow;

  if (cappedEntries.length === 0 && !hasAdvisories) {
    return null;
  }

  const hasCriticalAdvisory = snapshot.advisories.some(
    (a) => a.severity === "critical"
  );

  return (
    <div
      data-testid="quota-meter"
      className="mb-3.5 min-w-0 space-y-2 overflow-hidden"
    >
      {cappedEntries.length > 0 && (
        <div className="studio-deck flex flex-wrap items-center justify-between gap-2.5 rounded-lg px-3.5 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Gauge className="size-3.5 shrink-0 text-amber-400" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#9CA3B2]">
              {t("budget.meter.title")}
            </span>
            <span className="rounded border border-white/[0.08] bg-[#050507] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#9CA3B2]">
              {t(`budget.meter.window.${snapshot.window}`)}
            </span>
            {snapshot.paidAiPaused && (
              <span
                data-testid="quota-meter-paused-badge"
                className="inline-flex items-center gap-1 rounded border border-red-500/45 bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-300"
              >
                <PauseCircle className="size-3 shrink-0" />
                {t("budget.meter.pausedBadge")}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {cappedEntries.map(({ key, shortKey, testId, quota }) => {
              const limit = quota.limit ?? 0;
              const remaining = quota.remaining ?? 0;
              const pct =
                limit > 0
                  ? Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)))
                  : 0;
              const colors = getStatusColors(quota.status);
              const label = t(shortKey);

              return (
                <div
                  key={key}
                  data-testid={testId}
                  title={t("budget.meter.slotTitle", {
                    label,
                    remaining,
                    limit,
                  })}
                  className={`flex min-w-[92px] flex-col gap-1 rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums ${colors.pill}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <span className={`size-1.5 rounded-full ${colors.dot}`} />
                      {label}
                    </span>
                    <span className="font-semibold">
                      {remaining}/{limit}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-black/45">
                    <div
                      className={`h-full transition-all duration-200 ${colors.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasAdvisories && (
        <div
          role="status"
          data-testid="quota-advisory-banner"
          className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${
            hasCriticalAdvisory
              ? "border-red-500/45 bg-red-500/[0.09] text-red-200"
              : "border-amber-500/45 bg-amber-500/[0.09] text-amber-200"
          }`}
        >
          {hasCriticalAdvisory ? (
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-400" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            {snapshot.advisories.map((adv, idx) => (
              <p key={`${adv.code}-${idx}`} className="leading-snug">
                {getAdvisoryText(adv, t)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
