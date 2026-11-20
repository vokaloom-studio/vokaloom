import { LOCALE_HEADER, type Locale } from "@/lib/i18n";
import type { PublicQuotaSnapshot } from "@/lib/budget-types";

export const QUOTA_STORAGE_KEY = "vokaloom_quota_v1";
export const BUSINESS_CONFIG_STORAGE_KEY = "vokaloom_business_config_v1";
export const DEFAULT_TRIAL_CREDITS = 3;
export const QUOTA_UPDATED_EVENT = "vokaloom-quota-updated";
export const BUDGET_UPDATED_EVENT = "vokaloom-budget-updated";

export function dispatchBudgetUpdated(snapshot: PublicQuotaSnapshot): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<PublicQuotaSnapshot>(BUDGET_UPDATED_EVENT, {
        detail: snapshot,
      })
    );
  }
}

export interface QuotaState {
  creditsRemaining: number;
  maxTrialCredits: number;
  isOperator: boolean;
  isPro?: boolean;
  role?: "operator" | "pro_client" | "guest";
  totalGenerations: number;
}

export function hasProAccess(state: QuotaState): boolean {
  return Boolean(
    state.isPro ||
      state.isOperator ||
      state.role === "pro_client" ||
      state.role === "operator"
  );
}

export function hasOperatorAccess(state: QuotaState): boolean {
  return Boolean(state.isOperator && state.role === "operator");
}

export interface BusinessConfig {
  priceCop: string;
  priceUsd: string;
  maxTrialCredits: number;
  checkoutUrlCop: string;
  checkoutUrlUsd: string;
}

const SAFE_FALLBACK_CHECKOUT_URL_COP =
  "https://checkout.wompi.co/l/your_60000_cop_link";
const SAFE_FALLBACK_CHECKOUT_URL_USD =
  "https://buy.stripe.com/your_15_usd_link";

function isLocalDevHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  );
}

/**
 * Allows only `https:` URLs or `http:` URLs pointing to local/dev hosts,
 * rejecting `javascript:`, `data:`, credentialed URLs, and non-local plain HTTP.
 */
export function isAllowedCheckoutUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.protocol === "https:") {
      return Boolean(parsed.hostname);
    }
    if (parsed.protocol === "http:") {
      return isLocalDevHostname(parsed.hostname);
    }
    return false;
  } catch {
    return false;
  }
}

export function sanitizeCheckoutUrl(
  rawUrl: string | undefined,
  fallbackUrl: string
): string {
  const safeFallback = isAllowedCheckoutUrl(fallbackUrl)
    ? new URL(fallbackUrl.trim()).toString()
    : SAFE_FALLBACK_CHECKOUT_URL_COP;

  const trimmed = rawUrl?.trim();
  if (!trimmed || !isAllowedCheckoutUrl(trimmed)) {
    return safeFallback;
  }
  return new URL(trimmed).toString();
}

export const DEFAULT_CHECKOUT_URL_COP = sanitizeCheckoutUrl(
  process.env.NEXT_PUBLIC_CHECKOUT_URL_COP,
  SAFE_FALLBACK_CHECKOUT_URL_COP
);

export const DEFAULT_CHECKOUT_URL_USD = sanitizeCheckoutUrl(
  process.env.NEXT_PUBLIC_CHECKOUT_URL_USD,
  SAFE_FALLBACK_CHECKOUT_URL_USD
);

const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  priceCop: "$60,000 COP",
  priceUsd: "$15 USD",
  maxTrialCredits: DEFAULT_TRIAL_CREDITS,
  checkoutUrlCop: DEFAULT_CHECKOUT_URL_COP,
  checkoutUrlUsd: DEFAULT_CHECKOUT_URL_USD,
};

export function getBusinessConfig(): BusinessConfig {
  if (typeof window === "undefined") {
    return { ...DEFAULT_BUSINESS_CONFIG };
  }
  try {
    const raw = window.localStorage.getItem(BUSINESS_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BUSINESS_CONFIG };
    const parsed = JSON.parse(raw) as Partial<BusinessConfig>;
    return {
      priceCop: parsed.priceCop?.trim() || DEFAULT_BUSINESS_CONFIG.priceCop,
      priceUsd: parsed.priceUsd?.trim() || DEFAULT_BUSINESS_CONFIG.priceUsd,
      maxTrialCredits:
        typeof parsed.maxTrialCredits === "number" &&
        Number.isFinite(parsed.maxTrialCredits) &&
        parsed.maxTrialCredits >= 0
          ? parsed.maxTrialCredits
          : DEFAULT_BUSINESS_CONFIG.maxTrialCredits,
      checkoutUrlCop: sanitizeCheckoutUrl(
        parsed.checkoutUrlCop,
        DEFAULT_BUSINESS_CONFIG.checkoutUrlCop
      ),
      checkoutUrlUsd: sanitizeCheckoutUrl(
        parsed.checkoutUrlUsd,
        DEFAULT_BUSINESS_CONFIG.checkoutUrlUsd
      ),
    };
  } catch {
    return { ...DEFAULT_BUSINESS_CONFIG };
  }
}

export function saveBusinessConfig(
  partial: Partial<BusinessConfig>
): BusinessConfig {
  const current = getBusinessConfig();
  const merged: BusinessConfig = {
    priceCop: partial.priceCop?.trim() || current.priceCop,
    priceUsd: partial.priceUsd?.trim() || current.priceUsd,
    maxTrialCredits:
      typeof partial.maxTrialCredits === "number" &&
      Number.isFinite(partial.maxTrialCredits) &&
      partial.maxTrialCredits >= 0
        ? partial.maxTrialCredits
        : current.maxTrialCredits,
    checkoutUrlCop: sanitizeCheckoutUrl(
      partial.checkoutUrlCop !== undefined
        ? partial.checkoutUrlCop
        : current.checkoutUrlCop,
      DEFAULT_BUSINESS_CONFIG.checkoutUrlCop
    ),
    checkoutUrlUsd: sanitizeCheckoutUrl(
      partial.checkoutUrlUsd !== undefined
        ? partial.checkoutUrlUsd
        : current.checkoutUrlUsd,
      DEFAULT_BUSINESS_CONFIG.checkoutUrlUsd
    ),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        BUSINESS_CONFIG_STORAGE_KEY,
        JSON.stringify(merged)
      );
    } catch {
      // Ignore storage errors
    }
  }
  return merged;
}

function getDefaultQuotaState(): QuotaState {
  const cfg = getBusinessConfig();
  return {
    creditsRemaining: cfg.maxTrialCredits,
    maxTrialCredits: cfg.maxTrialCredits,
    isOperator: false,
    isPro: false,
    role: "guest",
    totalGenerations: 0,
  };
}

function notifyQuotaUpdated(state: QuotaState): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<QuotaState>(QUOTA_UPDATED_EVENT, { detail: state })
    );
  }
}

export function getQuotaState(): QuotaState {
  if (typeof window === "undefined") {
    return {
      creditsRemaining: DEFAULT_TRIAL_CREDITS,
      maxTrialCredits: DEFAULT_TRIAL_CREDITS,
      isOperator: false,
      isPro: false,
      role: "guest",
      totalGenerations: 0,
    };
  }

  const cfg = getBusinessConfig();
  try {
    const raw = window.localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) {
      return getDefaultQuotaState();
    }
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    const normalizedRole: "operator" | "pro_client" | "guest" =
      parsed.role === "operator" ||
      parsed.role === "pro_client" ||
      parsed.role === "guest"
        ? parsed.role
        : parsed.isOperator
          ? "operator"
          : parsed.isPro
            ? "pro_client"
            : "guest";

    const isOperator = normalizedRole === "operator";
    const isPro =
      normalizedRole === "operator" || normalizedRole === "pro_client";

    return {
      creditsRemaining:
        typeof parsed.creditsRemaining === "number"
          ? Math.max(0, parsed.creditsRemaining)
          : cfg.maxTrialCredits,
      maxTrialCredits:
        typeof parsed.maxTrialCredits === "number"
          ? parsed.maxTrialCredits
          : cfg.maxTrialCredits,
      isOperator,
      isPro,
      role: normalizedRole,
      totalGenerations:
        typeof parsed.totalGenerations === "number"
          ? parsed.totalGenerations
          : 0,
    };
  } catch {
    return getDefaultQuotaState();
  }
}

function saveQuotaState(state: QuotaState): QuotaState {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in restricted environments
    }
    notifyQuotaUpdated(state);
  }
  return state;
}

export function consumeCredit(): { allowed: boolean; state: QuotaState } {
  const current = getQuotaState();

  if (hasProAccess(current)) {
    const updated: QuotaState = {
      ...current,
      totalGenerations: current.totalGenerations + 1,
    };
    saveQuotaState(updated);
    return { allowed: true, state: updated };
  }

  if (current.creditsRemaining <= 0) {
    return { allowed: false, state: current };
  }

  const updated: QuotaState = {
    ...current,
    creditsRemaining: Math.max(0, current.creditsRemaining - 1),
    totalGenerations: current.totalGenerations + 1,
  };
  saveQuotaState(updated);
  return { allowed: true, state: updated };
}

export async function verifyAndActivateAccessCode(
  code: string,
  locale?: Locale
): Promise<{
  success: boolean;
  role?: "operator" | "pro_client";
  state: QuotaState;
  error?: string;
}> {
  const trimmed = code.trim();
  const current = getQuotaState();

  if (!trimmed) {
    return { success: false, state: current };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (locale) {
      headers[LOCALE_HEADER] = locale;
    }

    const response = await fetch("/api/admin", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "verify-code",
        code: trimmed,
        ...(locale ? { locale } : {}),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      valid?: boolean;
      role?: "operator" | "pro_client";
      error?: string;
    };

    if (!response.ok || !data.valid) {
      return { success: false, state: current, error: data.error };
    }

    const grantedRole: "operator" | "pro_client" =
      data.role === "operator" ? "operator" : "pro_client";
    const isOperator = grantedRole === "operator";

    const updated: QuotaState = {
      ...current,
      isOperator,
      isPro: true,
      role: grantedRole,
    };
    saveQuotaState(updated);
    return {
      success: true,
      role: grantedRole,
      state: updated,
    };
  } catch {
    return { success: false, state: current };
  }
}

export function enableOperatorMode(
  role: "operator" | "pro_client" = "operator"
): QuotaState {
  const current = getQuotaState();
  const isOperator = role === "operator";
  return saveQuotaState({
    ...current,
    isOperator,
    isPro: true,
    role,
  });
}

export function deactivateOperatorMode(): QuotaState {
  const current = getQuotaState();
  return saveQuotaState({
    ...current,
    isOperator: false,
    isPro: false,
    role: "guest",
  });
}

export function resetTrialForDemo(): QuotaState {
  const cfg = getBusinessConfig();
  const resetState: QuotaState = {
    creditsRemaining: cfg.maxTrialCredits,
    maxTrialCredits: cfg.maxTrialCredits,
    isOperator: false,
    isPro: false,
    role: "guest",
    totalGenerations: 0,
  };
  return saveQuotaState(resetState);
}

/**
 * Reconciles client quota state with server authority when an API route
 * returns HTTP 402 (quota exhausted), zeroing remaining client trial credits
 * and clearing stale local privilege flags while broadcasting the update.
 */
export function reconcileServerQuotaExhausted(payload?: {
  quotaExceeded?: boolean;
}): QuotaState {
  if (payload && payload.quotaExceeded === false) {
    return getQuotaState();
  }

  const current = getQuotaState();
  const reconciled: QuotaState = {
    ...current,
    creditsRemaining: 0,
    isOperator: false,
    isPro: false,
    role: "guest",
  };
  return saveQuotaState(reconciled);
}

/**
 * Refunds an optimistically-consumed client trial credit when an API call is
 * blocked by an operator hard cap, emergency pause, or upstream circuit breaker (HTTP 429/503).
 */
export function refundClientCreditOnCap(): QuotaState {
  const current = getQuotaState();
  const nextTotal = Math.max(0, current.totalGenerations - 1);
  if (hasProAccess(current)) {
    return saveQuotaState({
      ...current,
      totalGenerations: nextTotal,
    });
  }
  return saveQuotaState({
    ...current,
    creditsRemaining: Math.min(
      current.maxTrialCredits,
      current.creditsRemaining + 1
    ),
    totalGenerations: nextTotal,
  });
}
