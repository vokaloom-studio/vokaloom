import { NextResponse } from "next/server";
import { getRateLimitClientKey } from "@/lib/client-ip";
import { translate, type Locale } from "@/lib/i18n";
import {
  InMemoryRateLimitStore,
  UpstashRestRateLimitStore,
  resolveSharedRedisRestConfig,
  type RateLimitStore,
} from "@/lib/rate-limit";
import {
  TRIAL_COOKIE_NAME,
  TRIAL_TTL_MS,
  getVerifiedTrialUsageFromCookie,
  resolveServerEntitlement,
  signTrialToken,
  type EntitlementRole,
} from "@/lib/server-secrets";

export const MAX_GUEST_TRIAL_CREDITS = 3;
const MAX_TRACKED_TRIAL_IPS = 10_000;
const GUEST_TRIAL_KEY_PREFIX = "vokaloom:guest_trial:";

const inMemoryGuestTrialStore = new InMemoryRateLimitStore({
  maxAttempts: MAX_GUEST_TRIAL_CREDITS,
  windowMs: TRIAL_TTL_MS,
  maxEntries: MAX_TRACKED_TRIAL_IPS,
});

let cachedSharedTrialConfigKey: string | null = null;
let cachedSharedTrialStore: RateLimitStore | null = null;

function getGuestTrialStore(): RateLimitStore {
  const shared = resolveSharedRedisRestConfig();
  if (!shared) {
    return inMemoryGuestTrialStore;
  }
  const cacheKey = `${shared.url}|${shared.token}`;
  if (cachedSharedTrialStore && cachedSharedTrialConfigKey === cacheKey) {
    return cachedSharedTrialStore;
  }
  cachedSharedTrialConfigKey = cacheKey;
  cachedSharedTrialStore = new UpstashRestRateLimitStore(
    shared.url,
    shared.token,
    {
      maxAttempts: MAX_GUEST_TRIAL_CREDITS,
      windowMs: TRIAL_TTL_MS,
      maxEntries: MAX_TRACKED_TRIAL_IPS,
      keyPrefix: GUEST_TRIAL_KEY_PREFIX,
    }
  );
  return cachedSharedTrialStore;
}

export type ServerQuotaEnforcementResult =
  | {
      allowed: true;
      isPro: boolean;
      isOperator: boolean;
      role: EntitlementRole | "guest";
      subjectId?: string;
      trialCookieToken?: string;
      resetAt?: number;
    }
  | {
      allowed: false;
      response: NextResponse;
    };

function buildQuotaExhaustedResponse(locale: Locale): NextResponse {
  return NextResponse.json(
    {
      error: translate(locale, "api.quota.exhausted"),
      quotaExceeded: true,
    },
    { status: 402 }
  );
}

/**
 * Enforces server-side entitlement (`operator` / `pro_client`) and signed +
 * atomically reserved IP-backed guest trial quotas across paid generation routes
 * so concurrent requests or bypassing localStorage cannot drain upstream API keys.
 */
export async function enforceServerGenerationQuota(
  request: Request,
  locale: Locale
): Promise<ServerQuotaEnforcementResult> {
  const cookieHeader = request.headers.get("cookie") ?? undefined;
  const entitlement = await resolveServerEntitlement(cookieHeader);
  if (entitlement.isPro) {
    return {
      allowed: true,
      isPro: true,
      isOperator: entitlement.isOperator,
      role: entitlement.role,
      ...(entitlement.subjectId ? { subjectId: entitlement.subjectId } : {}),
    };
  }

  const now = Date.now();
  const cookieTrial = await getVerifiedTrialUsageFromCookie(now, cookieHeader);
  const cookieUsed = cookieTrial?.used ?? 0;

  if (cookieUsed >= MAX_GUEST_TRIAL_CREDITS) {
    return {
      allowed: false,
      response: buildQuotaExhaustedResponse(locale),
    };
  }

  const clientKey = getRateLimitClientKey(request).key;
  const consumption = await getGuestTrialStore().tryConsume(clientKey, {
    floorCount: cookieUsed,
  });

  if (!consumption.allowed) {
    return {
      allowed: false,
      response: buildQuotaExhaustedResponse(locale),
    };
  }

  const resetAt = cookieTrial?.resetAt ?? consumption.resetAt;
  const trialCookieToken =
    signTrialToken(consumption.count, resetAt, now) ?? undefined;

  return {
    allowed: true,
    isPro: false,
    isOperator: false,
    role: "guest",
    trialCookieToken,
    resetAt,
  };
}

export function attachServerTrialCookie(
  response: NextResponse,
  trialCookieToken?: string,
  resetAt?: number
): NextResponse {
  if (!trialCookieToken) {
    return response;
  }

  const remainingSec = resetAt
    ? Math.max(60, Math.ceil((resetAt - Date.now()) / 1000))
    : Math.ceil(TRIAL_TTL_MS / 1000);

  response.cookies.set(TRIAL_COOKIE_NAME, trialCookieToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remainingSec,
  });

  return response;
}
