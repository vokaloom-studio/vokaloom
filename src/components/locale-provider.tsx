"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationVars,
} from "@/lib/i18n";

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  toggleLocale: () => {},
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
});

export function LocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored === "en" || stored === "es") {
          setLocaleState(stored);
          document.documentElement.lang = stored;
        } else {
          document.documentElement.lang = DEFAULT_LOCALE;
        }
      } catch {
        document.documentElement.lang = DEFAULT_LOCALE;
      }
    });

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === LOCALE_STORAGE_KEY &&
        (event.newValue === "en" || event.newValue === "es")
      ) {
        setLocaleState(event.newValue);
        document.documentElement.lang = event.newValue;
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
      } catch {
        // Ignore storage errors in restricted environments
      }
      document.documentElement.lang = nextLocale;
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next: Locale = prev === "en" ? "es" : "en";
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
        } catch {
          // Ignore storage errors
        }
        document.documentElement.lang = next;
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) =>
      translate(locale, key, vars),
    [locale]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t,
    }),
    [locale, setLocale, toggleLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
