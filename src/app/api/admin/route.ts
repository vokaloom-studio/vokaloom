import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAdminTelemetrySnapshot,
  getServerBusinessConfig,
  resetBudgetCaps,
  saveServerBusinessConfig,
  toggleEmergencyPause,
  type ServerBusinessConfig,
} from "@/lib/budget-guard";
import {
  getRateLimitClientKey,
  isTrustedProxyEnvironment,
} from "@/lib/client-ip";
import { resolveRequestLocale, translate, type Locale } from "@/lib/i18n";
import {
  MalformedJsonBodyError,
  PayloadTooLargeError,
  readJsonBodyWithLimit,
} from "@/lib/request-body";
import {
  InMemoryRateLimitStore,
  UpstashRestRateLimitStore,
  resolveSharedRedisRestConfig,
  type RateLimitStore,
} from "@/lib/rate-limit";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ENTITLEMENT_COOKIE_NAME,
  SECRET_KEY_NAMES,
  VAULT_COOKIE_NAME,
  encryptSecretsPayload,
  getVaultStateFromCookie,
  isValidSecretValue,
  maskSecret,
  persistLocalEnvIfDev,
  resolveAdminMasterKey,
  resolveApiKey,
  resolveSecretValueForState,
  resolveServerEntitlement,
  signAdminSessionToken,
  signEntitlementToken,
  verifyAdminSessionToken,
  type EntitlementRole,
  type SecretKeyName,
  type VaultState,
} from "@/lib/server-secrets";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_IPS = 5_000;
const ADMIN_RATE_LIMIT_KEY_PREFIX = "vokaloom:admin_ratelimit:";

const inMemoryLoginAttempts = new InMemoryRateLimitStore({
  maxAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxEntries: MAX_TRACKED_IPS,
});

let cachedSharedConfigKey: string | null = null;
let cachedSharedRateLimitStore: RateLimitStore | null = null;

function getRateLimitStore(): RateLimitStore {
  const shared = resolveSharedRedisRestConfig();
  if (!shared) {
    return inMemoryLoginAttempts;
  }
  const cacheKey = `${shared.url}|${shared.token}`;
  if (cachedSharedRateLimitStore && cachedSharedConfigKey === cacheKey) {
    return cachedSharedRateLimitStore;
  }
  cachedSharedConfigKey = cacheKey;
  cachedSharedRateLimitStore = new UpstashRestRateLimitStore(
    shared.url,
    shared.token,
    {
      maxAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxEntries: MAX_TRACKED_IPS,
      keyPrefix: ADMIN_RATE_LIMIT_KEY_PREFIX,
    }
  );
  return cachedSharedRateLimitStore;
}

function getVipClientCodes(): string[] {
  const envRaw = process.env.VIP_CLIENT_CODES;
  if (envRaw !== undefined) {
    return envRaw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }

  if (process.env.NODE_ENV === "production") {
    return [];
  }

  return ["VOKALOOM-PRO-2026", "CLIENT-VIP-01"];
}

function timingSafeEqualExact(a: string, b: string): boolean {
  const digestA = crypto.createHash("sha256").update(a.trim()).digest();
  const digestB = crypto.createHash("sha256").update(b.trim()).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function timingSafeEqualIgnoreCase(a: string, b: string): boolean {
  const digestA = crypto
    .createHash("sha256")
    .update(a.trim().toUpperCase())
    .digest();
  const digestB = crypto
    .createHash("sha256")
    .update(b.trim().toUpperCase())
    .digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function verifySameOriginForAdminPost(request: Request): boolean {
  const secFetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const originHeader = request.headers.get("origin")?.trim();
  if (!originHeader) {
    // Allow direct headerless API/unit-test calls
    return true;
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originHeader);
  } catch {
    return false;
  }

  let expectedHost: string | null = null;
  let expectedProtocol: string | null = null;

  if (isTrustedProxyEnvironment()) {
    const fwdHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const fwdProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      ?.toLowerCase();
    if (fwdHost) {
      expectedHost = fwdHost.toLowerCase();
    }
    if (fwdProto === "http" || fwdProto === "https") {
      expectedProtocol = `${fwdProto}:`;
    }
  }

  if (!expectedHost) {
    const hostHeader = request.headers.get("host")?.trim();
    if (hostHeader) {
      expectedHost = hostHeader.toLowerCase();
    }
  }

  try {
    const reqUrl = new URL(request.url);
    if (!expectedHost) {
      expectedHost = reqUrl.host.toLowerCase();
    }
    if (!expectedProtocol) {
      expectedProtocol = reqUrl.protocol;
    }
  } catch {
    // Ignore malformed URL fallback
  }

  if (!expectedHost || parsedOrigin.host.toLowerCase() !== expectedHost) {
    return false;
  }
  if (expectedProtocol && parsedOrigin.protocol !== expectedProtocol) {
    return false;
  }
  return true;
}

async function isRateLimited(ip: string): Promise<boolean> {
  return getRateLimitStore().isLimited(ip);
}

async function recordFailedLogin(ip: string): Promise<void> {
  await getRateLimitStore().recordFailure(ip);
}

async function clearFailedLogins(ip: string): Promise<void> {
  await getRateLimitStore().clear(ip);
}

function buildDiagnosticsFromValues(
  values: Record<SecretKeyName, string | undefined>
) {
  return {
    health: {
      geminiConfigured: Boolean(values.GEMINI_API_KEY),
      pexelsConfigured: Boolean(values.PEXELS_API_KEY),
      unsplashConfigured: Boolean(values.UNSPLASH_ACCESS_KEY),
      falConfigured: Boolean(values.FAL_KEY),
      falBillingConfigured: Boolean(values.FAL_BILLING_KEY),
    },
    maskedKeys: {
      GEMINI_API_KEY: maskSecret(values.GEMINI_API_KEY),
      PEXELS_API_KEY: maskSecret(values.PEXELS_API_KEY),
      UNSPLASH_ACCESS_KEY: maskSecret(values.UNSPLASH_ACCESS_KEY),
      FAL_KEY: maskSecret(values.FAL_KEY),
      FAL_BILLING_KEY: maskSecret(values.FAL_BILLING_KEY),
    },
    vipClientCodes: getVipClientCodes(),
  };
}

async function resolveAllDiagnostics() {
  const [gemini, pexels, unsplash, fal, falBilling] = await Promise.all([
    resolveApiKey("GEMINI_API_KEY"),
    resolveApiKey("PEXELS_API_KEY"),
    resolveApiKey("UNSPLASH_ACCESS_KEY"),
    resolveApiKey("FAL_KEY"),
    resolveApiKey("FAL_BILLING_KEY"),
  ]);

  return {
    diagnostics: buildDiagnosticsFromValues({
      GEMINI_API_KEY: gemini,
      PEXELS_API_KEY: pexels,
      UNSPLASH_ACCESS_KEY: unsplash,
      FAL_KEY: fal,
      FAL_BILLING_KEY: falBilling,
    }),
    geminiKey: gemini,
    falKey: fal,
    falBillingKey: falBilling,
  };
}

function readCookieFromHeader(
  cookieHeader: string | null,
  name: string
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) continue;
    if (pair.slice(0, eqIdx).trim() === name) {
      const raw = pair.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

type AdminAuthCheckResult =
  | { authorized: true; usedSubmittedKey: boolean }
  | { authorized: false; rateLimited: boolean };

/**
 * Verifies admin authorization via submitted key (`x-admin-key` / `body.adminKey`)
 * or operator session cookie, applying brute-force rate limiting whenever a key is supplied.
 */
async function authorizeAdminRequest(
  request: Request,
  bodyAdminKey?: unknown
): Promise<AdminAuthCheckResult> {
  const masterKey = resolveAdminMasterKey();
  if (!masterKey) {
    return { authorized: false, rateLimited: false };
  }

  const hasHeaderKey = request.headers.has("x-admin-key");
  const hasBodyKey = bodyAdminKey !== undefined;
  const headerKey = request.headers.get("x-admin-key")?.trim() || "";
  const bodyKey = typeof bodyAdminKey === "string" ? bodyAdminKey.trim() : "";
  const hasNonEmptyKey = headerKey.length > 0 || bodyKey.length > 0;

  let sessionCookie: string | undefined;
  try {
    const cookieStore = await cookies();
    sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  } catch {
    sessionCookie = readCookieFromHeader(
      request.headers.get("cookie"),
      ADMIN_SESSION_COOKIE_NAME
    );
  }
  const hasValidSession = verifyAdminSessionToken(sessionCookie);

  if (!hasNonEmptyKey && hasValidSession) {
    return { authorized: true, usedSubmittedKey: false };
  }

  if (hasHeaderKey || hasBodyKey) {
    const clientIp = getRateLimitClientKey(request).key;
    if (await isRateLimited(clientIp)) {
      return { authorized: false, rateLimited: true };
    }

    if (
      (headerKey.length > 0 && timingSafeEqualExact(headerKey, masterKey)) ||
      (bodyKey.length > 0 && timingSafeEqualExact(bodyKey, masterKey))
    ) {
      await clearFailedLogins(clientIp);
      return { authorized: true, usedSubmittedKey: true };
    }

    await recordFailedLogin(clientIp);
    return { authorized: false, rateLimited: false };
  }

  return { authorized: false, rateLimited: false };
}

async function ensurePrivilegedAdminAccess(
  request: Request,
  locale: Locale,
  bodyAdminKey?: unknown
): Promise<NextResponse | null> {
  if (!resolveAdminMasterKey()) {
    return NextResponse.json(
      {
        success: false,
        error: translate(locale, "api.admin.missingServerKey"),
      },
      { status: 503 }
    );
  }

  const authResult = await authorizeAdminRequest(request, bodyAdminKey);
  if (!authResult.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: translate(
          locale,
          authResult.rateLimited
            ? "api.admin.tooManyAttempts"
            : "api.admin.unauthenticated"
        ),
      },
      { status: authResult.rateLimited ? 429 : 401 }
    );
  }

  return null;
}

export async function GET(request: Request) {
  const locale = resolveRequestLocale(request);
  const reqUrl = new URL(request.url);
  const refreshFal = reqUrl.searchParams.get("refresh") === "1";
  const cookieHeader = request.headers.get("cookie") ?? undefined;
  const [authResult, entitlement] = await Promise.all([
    authorizeAdminRequest(request),
    resolveServerEntitlement(cookieHeader),
  ]);

  if (!authResult.authorized && authResult.rateLimited) {
    return NextResponse.json(
      {
        authenticated: false,
        error: translate(locale, "api.admin.tooManyAttempts"),
      },
      { status: 429 }
    );
  }

  const isProduction = process.env.NODE_ENV === "production";
  const serverConfig = await getServerBusinessConfig();

  if (!authResult.authorized) {
    return NextResponse.json(
      {
        authenticated: false,
        isProduction,
        entitlement,
        config: serverConfig,
        message: translate(locale, "api.admin.unauthenticated"),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { diagnostics, falKey, falBillingKey, geminiKey } =
    await resolveAllDiagnostics();
  const telemetry = await getAdminTelemetrySnapshot({
    falKey,
    falBillingKey,
    geminiKey,
    refreshFal,
  });

  return NextResponse.json(
    {
      authenticated: true,
      isProduction,
      entitlement,
      config: serverConfig,
      message: translate(locale, "api.admin.authenticated"),
      ...diagnostics,
      telemetry,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  let locale = resolveRequestLocale(request);
  if (!verifySameOriginForAdminPost(request)) {
    return NextResponse.json(
      {
        valid: false,
        success: false,
        error: translate(locale, "api.admin.forbiddenOrigin"),
      },
      { status: 403 }
    );
  }
  try {
    const rawBody = await readJsonBodyWithLimit(request, 16 * 1024);
    const body = rawBody as {
      action?:
        | "verify-code"
        | "admin-login"
        | "admin-logout"
        | "update-keys"
        | "clear-vault"
        | "reset-budget-caps"
        | "toggle-emergency-pause"
        | "update-business-config";
      code?: string;
      adminKey?: string;
      keys?: Partial<Record<SecretKeyName, string>>;
      config?: Partial<ServerBusinessConfig>;
      removeFromDisk?: boolean;
      paused?: boolean;
      locale?: unknown;
    };
    if (body.locale !== undefined) {
      locale = resolveRequestLocale(request, body.locale);
    }

    if (body.action === "update-business-config") {
      const authError = await ensurePrivilegedAdminAccess(
        request,
        locale,
        body.adminKey
      );
      if (authError) return authError;

      if (!body.config || typeof body.config !== "object") {
        return NextResponse.json(
          {
            success: false,
            error: translate(locale, "api.admin.invalidBusinessConfig"),
          },
          { status: 400 }
        );
      }

      const saved = await saveServerBusinessConfig(body.config);
      if (!saved.ok) {
        return NextResponse.json(
          {
            success: false,
            error: translate(locale, saved.errorKey),
          },
          { status: saved.statusCode }
        );
      }

      return NextResponse.json({
        success: true,
        config: saved.config,
        message: translate(locale, "api.admin.businessConfigSaved"),
      });
    }

    if (body.action === "reset-budget-caps") {
      const authError = await ensurePrivilegedAdminAccess(
        request,
        locale,
        body.adminKey
      );
      if (authError) return authError;

      await resetBudgetCaps();
      const { falKey, falBillingKey, geminiKey } =
        await resolveAllDiagnostics();
      const telemetry = await getAdminTelemetrySnapshot({
        falKey,
        falBillingKey,
        geminiKey,
      });

      return NextResponse.json({
        success: true,
        message: translate(locale, "api.admin.budgetReset"),
        telemetry,
      });
    }

    if (body.action === "toggle-emergency-pause") {
      const authError = await ensurePrivilegedAdminAccess(
        request,
        locale,
        body.adminKey
      );
      if (authError) return authError;

      const explicitPause =
        typeof body.paused === "boolean" ? body.paused : undefined;
      await toggleEmergencyPause(explicitPause);
      const { falKey, falBillingKey, geminiKey } =
        await resolveAllDiagnostics();
      const telemetry = await getAdminTelemetrySnapshot({
        falKey,
        falBillingKey,
        geminiKey,
      });

      return NextResponse.json({
        success: true,
        paidAiPaused: telemetry.emergencyPause.active,
        message: translate(
          locale,
          telemetry.emergencyPause.active
            ? "api.admin.emergencyPaused"
            : "api.admin.emergencyResumed"
        ),
        telemetry,
      });
    }

    if (body.action === "admin-logout") {
      const res = NextResponse.json({
        valid: true,
        loggedOut: true,
        message: translate(locale, "api.admin.loggedOut"),
      });
      res.cookies.delete(ADMIN_SESSION_COOKIE_NAME);
      res.cookies.delete(ENTITLEMENT_COOKIE_NAME);
      return res;
    }

    if (body.action === "update-keys") {
      const authError = await ensurePrivilegedAdminAccess(
        request,
        locale,
        body.adminKey
      );
      if (authError) return authError;

      const incomingKeys = body.keys;
      if (!incomingKeys || typeof incomingKeys !== "object") {
        return NextResponse.json(
          {
            success: false,
            error: translate(locale, "api.admin.noKeysProvided"),
          },
          { status: 400 }
        );
      }

      const existingVault = await getVaultStateFromCookie();
      const mergedKeys: Partial<Record<SecretKeyName, string>> = {
        ...existingVault.secrets,
      };
      const clearedSet = new Set<SecretKeyName>(existingVault.cleared);
      const updatedKeysOnly: Partial<Record<SecretKeyName, string>> = {};
      const keysToClear: SecretKeyName[] = [];
      let hasChange = false;

      for (const keyName of SECRET_KEY_NAMES) {
        const rawValue = incomingKeys[keyName];
        if (typeof rawValue !== "string") continue;
        const trimmed = rawValue.trim();
        if (!trimmed) continue;

        hasChange = true;
        if (trimmed.toUpperCase() === "CLEAR") {
          delete mergedKeys[keyName];
          clearedSet.add(keyName);
          keysToClear.push(keyName);
        } else {
          if (!isValidSecretValue(trimmed, keyName)) {
            return NextResponse.json(
              {
                success: false,
                error: translate(locale, "api.admin.invalidKeyLength", {
                  keyName,
                }),
              },
              { status: 400 }
            );
          }
          clearedSet.delete(keyName);
          mergedKeys[keyName] = trimmed;
          updatedKeysOnly[keyName] = trimmed;
        }
      }

      if (!hasChange) {
        return NextResponse.json(
          {
            success: false,
            error: translate(locale, "api.admin.noKeysProvided"),
          },
          { status: 400 }
        );
      }

      const allowClearFromDisk = body.removeFromDisk === true;
      const persistedToDisk = await persistLocalEnvIfDev(
        updatedKeysOnly,
        keysToClear,
        { allowClearFromDisk }
      );

      const nextVaultState: VaultState = {
        secrets: mergedKeys,
        cleared: Array.from(clearedSet).filter((name) => !mergedKeys[name]),
      };
      const encryptedToken = encryptSecretsPayload(
        nextVaultState.secrets,
        nextVaultState.cleared
      );

      const effectiveValues = {} as Record<SecretKeyName, string | undefined>;
      for (const keyName of SECRET_KEY_NAMES) {
        effectiveValues[keyName] = resolveSecretValueForState(
          keyName,
          nextVaultState
        );
      }

      const diagnostics = buildDiagnosticsFromValues(effectiveValues);
      const res = NextResponse.json({
        success: true,
        persistedToDisk,
        message: translate(locale, "api.admin.vaultUpdated"),
        ...diagnostics,
      });

      res.cookies.set(VAULT_COOKIE_NAME, encryptedToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return res;
    }

    if (body.action === "clear-vault") {
      const authError = await ensurePrivilegedAdminAccess(
        request,
        locale,
        body.adminKey
      );
      if (authError) return authError;

      const allowClearFromDisk = body.removeFromDisk === true;
      const removedFromDisk = allowClearFromDisk
        ? await persistLocalEnvIfDev({}, [...SECRET_KEY_NAMES], {
            allowClearFromDisk: true,
          })
        : false;

      const clearedVaultState: VaultState = { secrets: {}, cleared: [] };
      const envOnlyValues = {} as Record<SecretKeyName, string | undefined>;
      for (const keyName of SECRET_KEY_NAMES) {
        envOnlyValues[keyName] = resolveSecretValueForState(
          keyName,
          clearedVaultState
        );
      }

      const diagnostics = buildDiagnosticsFromValues(envOnlyValues);
      const res = NextResponse.json({
        success: true,
        cleared: true,
        removedFromDisk,
        message: translate(locale, "api.admin.vaultCleared"),
        ...diagnostics,
      });
      res.cookies.delete(VAULT_COOKIE_NAME);
      return res;
    }

    const masterKey = resolveAdminMasterKey();
    if (!masterKey) {
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.missingServerKey"),
        },
        { status: 503 }
      );
    }

    const isAdminLogin = body.action === "admin-login";
    const clientIp = getRateLimitClientKey(request).key;
    if (await isRateLimited(clientIp)) {
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.tooManyAttempts"),
        },
        { status: 429 }
      );
    }

    const submitted = typeof body.code === "string" ? body.code.trim() : "";
    if (!submitted) {
      await recordFailedLogin(clientIp);
      return NextResponse.json(
        { valid: false, error: translate(locale, "api.admin.missingCode") },
        { status: 401 }
      );
    }

    const vipCodes = getVipClientCodes();

    const isOperator = timingSafeEqualExact(submitted, masterKey);
    const isVipClient = vipCodes.some((c) =>
      timingSafeEqualIgnoreCase(submitted, c)
    );

    if (isAdminLogin && !isOperator) {
      await recordFailedLogin(clientIp);
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.invalidAdminKey"),
        },
        { status: 401 }
      );
    }

    if (!isOperator && !isVipClient) {
      await recordFailedLogin(clientIp);
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.invalidAccessCode"),
        },
        { status: 401 }
      );
    }

    await clearFailedLogins(clientIp);

    const role: EntitlementRole = isOperator ? "operator" : "pro_client";
    const subjectId =
      role === "pro_client"
        ? crypto
            .createHash("sha256")
            .update(submitted.trim().toUpperCase())
            .digest("hex")
            .slice(0, 16)
        : undefined;
    const response = NextResponse.json({
      valid: true,
      role,
      isOperator,
      isPro: true,
      message: translate(
        locale,
        isOperator ? "api.admin.operatorGranted" : "api.admin.proGranted"
      ),
    });

    const isProd = process.env.NODE_ENV === "production";
    const entitlementToken = signEntitlementToken(role, subjectId);
    if (entitlementToken) {
      response.cookies.set(ENTITLEMENT_COOKIE_NAME, entitlementToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    if (isOperator) {
      const sessionToken = signAdminSessionToken();
      if (sessionToken) {
        response.cookies.set(ADMIN_SESSION_COOKIE_NAME, sessionToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: isProd,
          path: "/",
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });
      }
    } else {
      // Strictly ensure pro_client never inherits or keeps an operator session
      response.cookies.delete(ADMIN_SESSION_COOKIE_NAME);
    }

    return response;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { valid: false, error: translate(locale, "api.admin.payloadTooLarge") },
        { status: 413 }
      );
    }
    if (error instanceof MalformedJsonBodyError) {
      return NextResponse.json(
        { valid: false, error: translate(locale, "api.admin.invalidRequest") },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { valid: false, error: translate(locale, "api.admin.invalidRequest") },
      { status: 400 }
    );
  }
}
