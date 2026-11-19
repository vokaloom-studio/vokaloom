"use client";

import React from "react";
import { useLocale } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t("switcher.ariaLabel")}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-md border border-white/[0.08] bg-[#050507] p-0.5 font-mono text-[11px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] md:h-7",
        className
      )}
    >
      <button
        type="button"
        data-testid="lang-en"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        title={t("switcher.enTitle")}
        className={cn(
          "inline-flex h-full min-w-8 items-center justify-center rounded-[4px] px-2 font-medium tracking-tight transition-colors md:min-w-0 md:px-1.5",
          locale === "en"
            ? "bg-[#F4F4F5] text-[#09090B]"
            : "text-[#8B8D98] hover:text-[#F4F4F5]"
        )}
      >
        EN
      </button>
      <button
        type="button"
        data-testid="lang-es"
        onClick={() => setLocale("es")}
        aria-pressed={locale === "es"}
        title={t("switcher.esTitle")}
        className={cn(
          "inline-flex h-full min-w-8 items-center justify-center rounded-[4px] px-2 font-medium tracking-tight transition-colors md:min-w-0 md:px-1.5",
          locale === "es"
            ? "bg-[#F4F4F5] text-[#09090B]"
            : "text-[#8B8D98] hover:text-[#F4F4F5]"
        )}
      >
        ES
      </button>
    </div>
  );
}
