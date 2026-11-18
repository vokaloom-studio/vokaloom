export const QUOTA_STORAGE_KEY = "vokaloom_quota_v1";
export const DEFAULT_TRIAL_CREDITS = 3;
export const QUOTA_UPDATED_EVENT = "vokaloom-quota-updated";

export interface QuotaState {
  creditsRemaining: number;
  maxTrialCredits: number;
  isOperator: boolean;
  totalGenerations: number;
}

const DEFAULT_QUOTA_STATE: QuotaState = {
  creditsRemaining: DEFAULT_TRIAL_CREDITS,
  maxTrialCredits: DEFAULT_TRIAL_CREDITS,
  isOperator: false,
  totalGenerations: 0,
};

function notifyQuotaUpdated(state: QuotaState): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<QuotaState>(QUOTA_UPDATED_EVENT, { detail: state })
    );
  }
}

export function getQuotaState(): QuotaState {
  if (typeof window === "undefined") {
    return { ...DEFAULT_QUOTA_STATE };
  }

  try {
    const raw = window.localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_QUOTA_STATE };
    }
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    return {
      creditsRemaining:
        typeof parsed.creditsRemaining === "number"
          ? Math.max(0, parsed.creditsRemaining)
          : DEFAULT_TRIAL_CREDITS,
      maxTrialCredits:
        typeof parsed.maxTrialCredits === "number"
          ? parsed.maxTrialCredits
          : DEFAULT_TRIAL_CREDITS,
      isOperator: Boolean(parsed.isOperator),
      totalGenerations:
        typeof parsed.totalGenerations === "number"
          ? parsed.totalGenerations
          : 0,
    };
  } catch {
    return { ...DEFAULT_QUOTA_STATE };
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

  if (current.isOperator) {
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

export function activateOperatorKey(key: string): {
  success: boolean;
  state: QuotaState;
} {
  const trimmed = key.trim();
  const configuredKey = (
    process.env.NEXT_PUBLIC_OPERATOR_KEY || "VOKALOOM-ADMIN-2026"
  ).trim();

  const isValid =
    trimmed.length > 0 &&
    (trimmed.toUpperCase() === configuredKey.toUpperCase() ||
      trimmed.toUpperCase() === "VOKALOOM-ADMIN-2026");

  const current = getQuotaState();
  if (!isValid) {
    return { success: false, state: current };
  }

  const updated: QuotaState = {
    ...current,
    isOperator: true,
  };
  saveQuotaState(updated);
  return { success: true, state: updated };
}

export function resetTrialForDemo(): QuotaState {
  const resetState: QuotaState = { ...DEFAULT_QUOTA_STATE };
  return saveQuotaState(resetState);
}
