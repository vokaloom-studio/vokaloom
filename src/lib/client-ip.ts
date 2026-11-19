import crypto from "node:crypto";
import net from "node:net";

const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const MAX_TRUSTED_PROXY_HOPS = 10;
const MAX_IP_HEADER_LENGTH = 100;
const MAX_FORWARDED_HEADER_LENGTH = 4096;

const ALLOWED_PROXY_HEADERS = new Set([
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "true-client-ip",
  "fly-client-ip",
  "x-real-ip",
  "x-forwarded-for",
]);

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
export function normalizeIp(raw: string | null | undefined): string | null {
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
export function getClientIp(request: Request): string {
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

/**
 * Returns a partitioned client bucket key for rate limiting and trial quotas.
 * Preserves strict IP attribution when a trusted proxy/platform header exists,
 * and falls back to non-loopback proxy headers or a request fingerprint so
 * proxy-less/local deployments never collapse all users onto one `"unknown"` key.
 */
export function getRateLimitClientKey(request: Request): {
  key: string;
  trusted: boolean;
} {
  const verified = getClientIp(request);
  if (verified !== "unknown") {
    return { key: verified, trusted: true };
  }

  const realIp = normalizeIp(request.headers.get("x-real-ip"));
  if (realIp && !isLoopbackIp(realIp)) {
    return { key: `unverified:${realIp}`, trusted: false };
  }

  const forwardedIp = extractForwardedIp(
    request.headers.get("x-forwarded-for"),
    DEFAULT_TRUSTED_PROXY_HOPS
  );
  if (forwardedIp && !isLoopbackIp(forwardedIp)) {
    return { key: `unverified:${forwardedIp}`, trusted: false };
  }

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 256);
  const acceptLanguage = (request.headers.get("accept-language") ?? "").slice(
    0,
    64
  );
  const digest = crypto
    .createHash("sha256")
    .update(`${userAgent}|${acceptLanguage}`)
    .digest("hex")
    .slice(0, 16);

  return { key: `unverified:fp:${digest}`, trusted: false };
}
