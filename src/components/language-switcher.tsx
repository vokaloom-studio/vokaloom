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
        "inline-flex h-7 shrink-0 items-center rounded-md border border-zinc-800/80 bg-[#0c0c10] p-0.5 font-mono text-[11px]",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        title={t("switcher.enTitle")}
        className={cn(
          "inline-flex h-5.5 items-center justify-center rounded-[4px] px-1.5 font-medium tracking-tight transition-colors",
          locale === "en"
            ? "bg-zinc-100 text-zinc-950"
            : "text-zinc-400 hover:text-zinc-100"
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("es")}
        aria-pressed={locale === "es"}
        title={t("switcher.esTitle")}
        className={cn(
          "inline-flex h-5.5 items-center justify-center rounded-[4px] px-1.5 font-medium tracking-tight transition-colors",
          locale === "es"
            ? "bg-zinc-100 text-zinc-950"
            : "text-zinc-400 hover:text-zinc-100"
        )}
      >
        ES
      </button>
    </div>
  );
}
