import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveRequestLocale, translate } from "@/lib/i18n";
import {
  SECRET_KEY_NAMES,
  VAULT_COOKIE_NAME,
  encryptSecretsPayload,
  getVaultSecretsFromCookie,
  isValidSecretValue,
  maskSecret,
  persistLocalEnvIfDev,
  resolveApiKey,
  type SecretKeyName,
} from "@/lib/server-secrets";

const ADMIN_SESSION_COOKIE = "vokaloom_admin_session";
const ADMIN_SESSION_TOKEN = "operator_authenticated_v1";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPTS = new Map<string, { count: number; resetAt: number }>();

function getAdminMasterKey(): string {
  return (process.env.ADMIN_MASTER_KEY || "VOKALOOM-ADMIN-2026").trim();
}

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

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = LOGIN_ATTEMPTS.get(ip);
  if (!record) return false;
  if (now > record.resetAt) {
    LOGIN_ATTEMPTS.delete(ip);
    return false;
  }
  return record.count >= MAX_FAILED_LOGIN_ATTEMPTS;
}

function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const existing = LOGIN_ATTEMPTS.get(ip);
  if (!existing || now > existing.resetAt) {
    LOGIN_ATTEMPTS.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return;
  }
  existing.count += 1;
  LOGIN_ATTEMPTS.set(ip, existing);
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

async function isAdminAuthorized(
  request: Request,
  bodyAdminKey?: string
): Promise<boolean> {
  const masterKey = getAdminMasterKey();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (sessionCookie === ADMIN_SESSION_TOKEN) {
    return true;
  }

  const headerKey = request.headers.get("x-admin-key")?.trim() || "";
  if (headerKey.length > 0 && timingSafeEqualIgnoreCase(headerKey, masterKey)) {
    return true;
  }

  if (
    bodyAdminKey &&
    bodyAdminKey.trim().length > 0 &&
    timingSafeEqualIgnoreCase(bodyAdminKey, masterKey)
  ) {
    return true;
  }

  return false;
}

export async function GET(request: Request) {
  const locale = resolveRequestLocale(request);
  const isAdminAuthenticated = await isAdminAuthorized(request);

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

  if (!isAdminAuthenticated) {
    return NextResponse.json({
      authenticated: false,
      config: publicDefaults,
      message: translate(locale, "api.admin.unauthenticated"),
    });
  }

  const diagnostics = await resolveAllDiagnostics();
  return NextResponse.json({
    authenticated: true,
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
      res.cookies.delete(ADMIN_SESSION_COOKIE);
      return res;
    }

    if (body.action === "update-keys") {
      const authorized = await isAdminAuthorized(request, body.adminKey);
      if (!authorized) {
        return NextResponse.json(
          {
            success: false,
            error: translate(locale, "api.admin.unauthenticated"),
          },
          { status: 401 }
        );
      }

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
      const authorized = await isAdminAuthorized(request, body.adminKey);
      if (!authorized) {
        return NextResponse.json(
          {
            success: false,
            error: translate(locale, "api.admin.unauthenticated"),
          },
          { status: 401 }
        );
      }

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

    const clientIp = getClientIp(request);
    if (body.action === "admin-login" && isRateLimited(clientIp)) {
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.tooManyAttempts"),
        },
        { status: 429 }
      );
    }

    const submitted = (body.code || "").trim();
    if (!submitted) {
      if (body.action === "admin-login") {
        recordFailedLogin(clientIp);
      }
      return NextResponse.json(
        { valid: false, error: translate(locale, "api.admin.missingCode") },
        { status: 401 }
      );
    }

    const masterKey = getAdminMasterKey();
    const vipCodes = getVipClientCodes();

    const isOperator = timingSafeEqualIgnoreCase(submitted, masterKey);
    const isVipClient = vipCodes.some((c) =>
      timingSafeEqualIgnoreCase(submitted, c)
    );

    if (body.action === "admin-login" && !isOperator) {
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
      return NextResponse.json(
        {
          valid: false,
          error: translate(locale, "api.admin.invalidAccessCode"),
        },
        { status: 401 }
      );
    }

    if (body.action === "admin-login" && isOperator) {
      clearFailedLogins(clientIp);
    }

    const role: "operator" | "pro_client" = isOperator
      ? "operator"
      : "pro_client";

    const response = NextResponse.json({
      valid: true,
      role,
      message: translate(
        locale,
        isOperator ? "api.admin.operatorGranted" : "api.admin.proGranted"
      ),
    });

    if (isOperator) {
      response.cookies.set(ADMIN_SESSION_COOKIE, ADMIN_SESSION_TOKEN, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    return response;
  } catch {
    return NextResponse.json(
      { valid: false, error: translate(locale, "api.admin.invalidRequest") },
      { status: 400 }
    );
  }
}
