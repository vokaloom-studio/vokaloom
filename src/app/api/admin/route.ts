import crypto from "node:crypto";
import net from "node:net";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveRequestLocale, translate, type Locale } from "@/lib/i18n";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ENTITLEMENT_COOKIE_NAME,
  SECRET_KEY_NAMES,
  VAULT_COOKIE_NAME,
  encryptSecretsPayload,
  getVaultSecretsFromCookie,
  isValidSecretValue,
  maskSecret,
  persistLocalEnvIfDev,
  resolveAdminMasterKey,
  resolveApiKey,
  resolveServerEntitlement,
  signAdminSessionToken,
  signEntitlementToken,
  verifyAdminSessionToken,
  type EntitlementRole,
  type SecretKeyName,
} from "@/lib/server-secrets";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_IPS = 5_000;
const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const MAX_TRUSTED_PROXY_HOPS = 10;
const MAX_IP_HEADER_LENGTH = 100;
const MAX_FORWARDED_HEADER_LENGTH = 4096;
const LOGIN_ATTEMPTS = new Map<string, { count: number; resetAt: number }>();

const ALLOWED_PROXY_HEADERS = new Set([
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "true-client-ip",
  "fly-client-ip",
  "x-real-ip",
  "x-forwarded-for",
]);

function getVipClientCodes(): string[] {
  const raw =
    process.env.VIP_CLIENT_CODES || "VOKALOOM-PRO-2026,CLIENT-VIP-01";
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
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

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getTrustedProxyHops(): number {
  const raw = process.env.TRUST_PROXY_HOPS?.trim();
  if (!raw) return DEFAULT_TRUSTED_PROXY_HOPS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TRUSTED_PROXY_HOPS;
  return Math.min(parsed, MAX_TRUSTED_PROXY_HOPS);
}

/**
 * Validates and canonicalizes an IPv4/IPv6 literal (stripping optional port/brackets
 * and collapsing IPv4-mapped IPv6 addresses to IPv4) so equivalent forms share one bucket.
 */
function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let candidate = raw.trim();
  if (!candidate || candidate.length > MAX_IP_HEADER_LENGTH) return null;

  if (
    candidate.startsWith('"') &&
    candidate.endsWith('"') &&
    candidate.length >= 2
  ) {
    candidate = candidate.slice(1, -1).trim();
  }

  if (candidate.startsWith("[")) {
    const bracketMatch = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(candidate);
    if (!bracketMatch) return null;
    if (bracketMatch[2]) {
      const port = Number.parseInt(bracketMatch[2], 10);
      if (port < 1 || port > 65535) return null;
    }
    candidate = bracketMatch[1];
  } else {
    // Only strip :port from IPv4 literals so bare IPv6 colons stay intact.
    const ipv4PortMatch = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(
      candidate
    );
    if (ipv4PortMatch) {
      const port = Number.parseInt(ipv4PortMatch[2], 10);
      if (port < 1 || port > 65535) return null;
      candidate = ipv4PortMatch[1];
    }
  }

  const version = net.isIP(candidate);
  if (version === 0) return null;
  if (version === 4) return candidate;

  try {
    const hostname = new URL(`http://[${candidate}]`).hostname;
    const unwrapped =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;

    const mappedMatch = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(
      unwrapped
    );
    if (mappedMatch) {
      const hi = Number.parseInt(mappedMatch[1], 16);
      const lo = Number.parseInt(mappedMatch[2], 16);
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }

    return unwrapped.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Extracts and validates the client IP from a comma-separated forwarding header.
 * For multi-hop proxies, indexes from the right by trusted proxy hop count so
 * client-supplied leftmost entries cannot spoof the attributed IP.
 */
function extractForwardedIp(
  headerValue: string | null,
  trustedHops: number,
  pickFirst = false
): string | null {
  if (!headerValue || headerValue.length > MAX_FORWARDED_HEADER_LENGTH) {
    return null;
  }

  const segments = headerValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  if (pickFirst) {
    return normalizeIp(segments[0]);
  }

  const targetIndex = segments.length - trustedHops;
  if (targetIndex < 0 || targetIndex >= segments.length) {
    return null;
  }
  return normalizeIp(segments[targetIndex]);
}

function isLoopbackIp(ip: string): boolean {
  return ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.");
}

/**
 * Resolves client IP only from headers trusted in the active deployment environment,
 * falling back to connection-level metadata or `"unknown"` when headers are unverified.
 */
function getClientIp(request: Request): string {
  const directIp =
    "ip" in request && typeof (request as { ip?: unknown }).ip === "string"
      ? normalizeIp((request as { ip?: string }).ip)
      : null;

  const configuredHeader = process.env.TRUSTED_PROXY_HEADER?.trim().toLowerCase();
  const trustedHops = getTrustedProxyHops();

  if (configuredHeader && ALLOWED_PROXY_HEADERS.has(configuredHeader)) {
    const raw = request.headers.get(configuredHeader);
    const parsed =
      configuredHeader === "x-forwarded-for"
        ? extractForwardedIp(raw, trustedHops)
        : configuredHeader === "x-vercel-forwarded-for"
          ? extractForwardedIp(raw, trustedHops, true)
          : normalizeIp(raw);
    return parsed ?? directIp ?? "unknown";
  }

  const isVercel =
    process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV?.trim());
  if (isVercel) {
    const vercelIp =
      extractForwardedIp(
        request.headers.get("x-vercel-forwarded-for"),
        trustedHops,
        true
      ) ??
      normalizeIp(request.headers.get("x-real-ip")) ??
      extractForwardedIp(request.headers.get("x-forwarded-for"), trustedHops);
    if (vercelIp) return vercelIp;
  }

  const isCloudflare =
    process.env.CF_PAGES === "1" ||
    isTruthyEnv(process.env.TRUST_CLOUDFLARE) ||
    process.env.TRUST_PROXY_PLATFORM?.trim().toLowerCase() === "cloudflare";
  if (isCloudflare) {
    const cfIp =
      normalizeIp(request.headers.get("cf-connecting-ip")) ??
      normalizeIp(request.headers.get("x-real-ip"));
    if (cfIp) return cfIp;
  }

  if (Boolean(process.env.FLY_APP_NAME?.trim())) {
    const flyIp = normalizeIp(request.headers.get("fly-client-ip"));
    if (flyIp) return flyIp;
  }

  if (isTruthyEnv(process.env.TRUST_PROXY)) {
    const forwardedIp = extractForwardedIp(
      request.headers.get("x-forwarded-for"),
      trustedHops
    );
    // Next.js defaults x-forwarded-for to socket.remoteAddress (often loopback behind Nginx);
    // prefer a valid x-real-ip when x-forwarded-for only reflects a local loopback hop.
    if (forwardedIp && !isLoopbackIp(forwardedIp)) {
      return forwardedIp;
    }

    const realIp = normalizeIp(request.headers.get("x-real-ip"));
    if (realIp) {
      return realIp;
    }

    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return directIp ?? "unknown";
}

function pruneExpiredAttempts(now: number): void {
  for (const [key, record] of LOGIN_ATTEMPTS) {
    if (now > record.resetAt) {
      LOGIN_ATTEMPTS.delete(key);
    }
  }
}

function evictEarliestExpiringAttempt(): boolean {
  let targetKey: string | undefined;
  let earliestResetAt = Infinity;

  for (const [key, record] of LOGIN_ATTEMPTS) {
    if (record.resetAt < earliestResetAt) {
      earliestResetAt = record.resetAt;
      targetKey = key;
    }
  }

  if (targetKey === undefined) {
    targetKey = LOGIN_ATTEMPTS.keys().next().value;
  }
  if (targetKey === undefined) {
    return false;
  }

  return LOGIN_ATTEMPTS.delete(targetKey);
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  pruneExpiredAttempts(now);
  const record = LOGIN_ATTEMPTS.get(ip);
  if (!record) return false;
  return record.count >= MAX_FAILED_LOGIN_ATTEMPTS;
}

function recordFailedLogin(ip: string): void {
  const now = Date.now();
  pruneExpiredAttempts(now);

  const existing = LOGIN_ATTEMPTS.get(ip);
  if (existing) {
    existing.count += 1;
    LOGIN_ATTEMPTS.set(ip, existing);
    return;
  }

  while (LOGIN_ATTEMPTS.size >= MAX_TRACKED_IPS) {
    if (!evictEarliestExpiringAttempt()) break;
  }

  LOGIN_ATTEMPTS.set(ip, {
    count: 1,
    resetAt: now + RATE_LIMIT_WINDOW_MS,
  });
}

function clearFailedLogins(ip: string): void {
  LOGIN_ATTEMPTS.delete(ip);
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
    },
    maskedKeys: {
      GEMINI_API_KEY: maskSecret(values.GEMINI_API_KEY),
      PEXELS_API_KEY: maskSecret(values.PEXELS_API_KEY),
      UNSPLASH_ACCESS_KEY: maskSecret(values.UNSPLASH_ACCESS_KEY),
      FAL_KEY: maskSecret(values.FAL_KEY),
    },
    vipClientCodes: getVipClientCodes(),
  };
}

async function resolveAllDiagnostics() {
  const [gemini, pexels, unsplash, fal] = await Promise.all([
    resolveApiKey("GEMINI_API_KEY"),
    resolveApiKey("PEXELS_API_KEY"),
    resolveApiKey("UNSPLASH_ACCESS_KEY"),
    resolveApiKey("FAL_KEY"),
  ]);

  return buildDiagnosticsFromValues({
    GEMINI_API_KEY: gemini,
    PEXELS_API_KEY: pexels,
    UNSPLASH_ACCESS_KEY: unsplash,
    FAL_KEY: fal,
  });
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

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const hasValidSession = verifyAdminSessionToken(sessionCookie);

  if (!hasNonEmptyKey && hasValidSession) {
    return { authorized: true, usedSubmittedKey: false };
  }

  if (hasHeaderKey || hasBodyKey) {
    const clientIp = getClientIp(request);
    if (isRateLimited(clientIp)) {
      return { authorized: false, rateLimited: true };
    }

    if (
      (headerKey.length > 0 &&
        timingSafeEqualIgnoreCase(headerKey, masterKey)) ||
      (bodyKey.length > 0 && timingSafeEqualIgnoreCase(bodyKey, masterKey))
    ) {
      clearFailedLogins(clientIp);
      return { authorized: true, usedSubmittedKey: true };
    }

    recordFailedLogin(clientIp);
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
  const [authResult, entitlement] = await Promise.all([
    authorizeAdminRequest(request),
    resolveServerEntitlement(),
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

  const publicDefaults = {
    priceCop: "$60,000 COP",
    priceUsd: "$15 USD",
    maxTrialCredits: 3,
    checkoutUrlCop:
      process.env.NEXT_PUBLIC_CHECKOUT_URL_COP ||
      "https://checkout.wompi.co/l/your_60000_cop_link",
    checkoutUrlUsd:
      process.env.NEXT_PUBLIC_CHECKOUT_URL_USD ||
      "https://buy.stripe.com/your_15_usd_link",
  };

  if (!authResult.authorized) {
    return NextResponse.json({
      authenticated: false,
      entitlement,
      config: publicDefaults,
      message: translate(locale, "api.admin.unauthenticated"),
    });
  }

  const diagnostics = await resolveAllDiagnostics();
  return NextResponse.json({
    authenticated: true,
    entitlement,
    config: publicDefaults,
    message: translate(locale, "api.admin.authenticated"),
    ...diagnostics,
  });
}

export async function POST(request: Request) {
  let locale = resolveRequestLocale(request);
  try {
    const body = (await request.json()) as {
      action?:
        | "verify-code"
        | "admin-login"
        | "admin-logout"
        | "update-keys"
        | "clear-vault";
      code?: string;
      adminKey?: string;
      keys?: Partial<Record<SecretKeyName, string>>;
      locale?: unknown;
    };
    if (body.locale !== undefined) {
      locale = resolveRequestLocale(request, body.locale);
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

      const existingVault = await getVaultSecretsFromCookie();
      const mergedKeys: Partial<Record<SecretKeyName, string>> = {
        ...existingVault,
      };
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
          mergedKeys[keyName] = trimmed;
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

      const persistedToDisk = await persistLocalEnvIfDev(
        mergedKeys,
        keysToClear
      );
      const encryptedToken = encryptSecretsPayload(mergedKeys);

      const effectiveValues = {} as Record<SecretKeyName, string | undefined>;
      for (const keyName of SECRET_KEY_NAMES) {
        if (mergedKeys[keyName]) {
          effectiveValues[keyName] = mergedKeys[keyName];
        } else if (!keysToClear.includes(keyName)) {
          const envVal = process.env[keyName]?.trim();
          effectiveValues[keyName] = isValidSecretValue(envVal, keyName)
            ? envVal
            : undefined;
        } else {
          effectiveValues[keyName] = undefined;
        }
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

      const envOnlyValues = {} as Record<SecretKeyName, string | undefined>;
      for (const keyName of SECRET_KEY_NAMES) {
        const envVal = process.env[keyName]?.trim();
        envOnlyValues[keyName] = isValidSecretValue(envVal, keyName)
          ? envVal
          : undefined;
      }

      const diagnostics = buildDiagnosticsFromValues(envOnlyValues);
      const res = NextResponse.json({
        success: true,
        cleared: true,
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
    const clientIp = getClientIp(request);
    if (isRateLimited(clientIp)) {
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
      recordFailedLogin(clientIp);
      return NextResponse.json(
        { valid: false, error: translate(locale, "api.admin.missingCode") },
        { status: 401 }
      );
    }

    const vipCodes = getVipClientCodes();

    const isOperator = timingSafeEqualIgnoreCase(submitted, masterKey);
    const isVipClient = vipCodes.some((c) =>
      timingSafeEqualIgnoreCase(submitted, c)
    );

    if (isAdminLogin && !isOperator) {
      recordFailedLogin(clientIp);
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.invalidAdminKey"),
        },
        { status: 401 }
      );
    }

    if (!isOperator && !isVipClient) {
      recordFailedLogin(clientIp);
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.invalidAccessCode"),
        },
        { status: 401 }
      );
    }

    clearFailedLogins(clientIp);

    const role: EntitlementRole = isOperator ? "operator" : "pro_client";
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
    const entitlementToken = signEntitlementToken(role);
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
  } catch {
    return NextResponse.json(
      { valid: false, error: translate(locale, "api.admin.invalidRequest") },
      { status: 400 }
    );
  }
}
