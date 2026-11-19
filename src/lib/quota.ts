import { LOCALE_HEADER, type Locale } from "@/lib/i18n";

export const QUOTA_STORAGE_KEY = "vokaloom_quota_v1";
export const BUSINESS_CONFIG_STORAGE_KEY = "vokaloom_business_config_v1";
export const DEFAULT_TRIAL_CREDITS = 3;
export const QUOTA_UPDATED_EVENT = "vokaloom-quota-updated";

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

const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  priceCop: "$60,000 COP",
  priceUsd: "$15 USD",
  maxTrialCredits: DEFAULT_TRIAL_CREDITS,
  checkoutUrlCop:
    process.env.NEXT_PUBLIC_CHECKOUT_URL_COP ||
    "https://checkout.wompi.co/l/your_60000_cop_link",
  checkoutUrlUsd:
    process.env.NEXT_PUBLIC_CHECKOUT_URL_USD ||
    "https://buy.stripe.com/your_15_usd_link",
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
        parsed.maxTrialCredits >= 0
          ? parsed.maxTrialCredits
          : DEFAULT_BUSINESS_CONFIG.maxTrialCredits,
      checkoutUrlCop:
        parsed.checkoutUrlCop?.trim() ||
        DEFAULT_BUSINESS_CONFIG.checkoutUrlCop,
      checkoutUrlUsd:
        parsed.checkoutUrlUsd?.trim() ||
        DEFAULT_BUSINESS_CONFIG.checkoutUrlUsd,
    };
  } catch {
    return { ...DEFAULT_BUSINESS_CONFIG };
  }
}

export function saveBusinessConfig(
  partial: Partial<BusinessConfig>
): BusinessConfig {
  const current = getBusinessConfig();
  const next: BusinessConfig = {
    ...current,
    ...partial,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        BUSINESS_CONFIG_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Ignore storage errors
    }
  }
  return next;
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
