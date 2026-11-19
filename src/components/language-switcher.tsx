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
        "inline-flex h-7 shrink-0 items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 font-mono text-[11px]",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        title={t("switcher.enTitle")}
        className={cn(
          "inline-flex h-6 items-center justify-center rounded-md px-1.5 font-semibold tracking-tight transition-colors",
          locale === "en"
            ? "bg-violet-600 text-white shadow-xs"
            : "text-zinc-400 hover:text-zinc-100"
        )}
      >
        EN
      </button>
      <span aria-hidden="true" className="px-0.5 text-[10px] text-zinc-600">
        |
      </span>
      <button
        type="button"
        onClick={() => setLocale("es")}
        aria-pressed={locale === "es"}
        title={t("switcher.esTitle")}
        className={cn(
          "inline-flex h-6 items-center justify-center rounded-md px-1.5 font-semibold tracking-tight transition-colors",
          locale === "es"
            ? "bg-violet-600 text-white shadow-xs"
            : "text-zinc-400 hover:text-zinc-100"
        )}
      >
        ES
      </button>
    </div>
  );
}
