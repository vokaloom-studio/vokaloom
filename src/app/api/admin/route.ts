import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveRequestLocale, translate } from "@/lib/i18n";

const ADMIN_SESSION_COOKIE = "vokaloom_admin_session";
const ADMIN_SESSION_TOKEN = "operator_authenticated_v1";

function isKeyConfigured(val: string | undefined, placeholder: string): boolean {
  return Boolean(val && val.trim().length > 5 && val.trim() !== placeholder);
}

function getAdminMasterKey(): string {
  return (process.env.ADMIN_MASTER_KEY || "VOKALOOM-ADMIN-2026").trim();
}

function getVipClientCodes(): string[] {
  const raw = process.env.VIP_CLIENT_CODES || "VOKALOOM-PRO-2026,CLIENT-VIP-01";
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const locale = resolveRequestLocale(request);
  const headerKey = request.headers.get("x-admin-key")?.trim() || "";
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  const masterKey = getAdminMasterKey();
  const isAdminAuthenticated =
    sessionCookie === ADMIN_SESSION_TOKEN ||
    (headerKey.length > 0 &&
      headerKey.toUpperCase() === masterKey.toUpperCase());

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

  return NextResponse.json({
    authenticated: true,
    config: publicDefaults,
    message: translate(locale, "api.admin.authenticated"),
    health: {
      geminiConfigured: isKeyConfigured(
        process.env.GEMINI_API_KEY,
        "your_google_ai_studio_key"
      ),
      pexelsConfigured: isKeyConfigured(
        process.env.PEXELS_API_KEY,
        "your_pexels_api_key"
      ),
      unsplashConfigured: isKeyConfigured(
        process.env.UNSPLASH_ACCESS_KEY,
        "your_unsplash_access_key"
      ),
      falConfigured: isKeyConfigured(process.env.FAL_KEY, "your_fal_ai_key"),
    },
    vipClientCodes: getVipClientCodes(),
  });
}

export async function POST(request: Request) {
  let locale = resolveRequestLocale(request);
  try {
    const body = (await request.json()) as {
      action?: "verify-code" | "admin-login" | "admin-logout";
      code?: string;
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

    const submitted = (body.code || "").trim();
    if (!submitted) {
      return NextResponse.json(
        { valid: false, error: translate(locale, "api.admin.missingCode") },
        { status: 401 }
      );
    }

    const masterKey = getAdminMasterKey();
    const vipCodes = getVipClientCodes();

    const isOperator = submitted.toUpperCase() === masterKey.toUpperCase();
    const isVipClient = vipCodes.some(
      (c) => c.toUpperCase() === submitted.toUpperCase()
    );

    if (body.action === "admin-login" && !isOperator) {
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
