import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

export type SecretKeyName =
  | "GEMINI_API_KEY"
  | "PEXELS_API_KEY"
  | "UNSPLASH_ACCESS_KEY"
  | "GRADIUM_API_KEY";

export const SECRET_KEY_NAMES: readonly SecretKeyName[] = [
  "GEMINI_API_KEY",
  "PEXELS_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "GRADIUM_API_KEY",
];

export const VAULT_COOKIE_NAME = "vokaloom_vault_v1";
export const ADMIN_SESSION_COOKIE_NAME = "vokaloom_admin_session";
export const ENTITLEMENT_COOKIE_NAME = "vokaloom_entitlement_v1";
export const TRIAL_COOKIE_NAME = "vokaloom_trial_v1";

export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ENTITLEMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const TRIAL_TTL_MS = 24 * 60 * 60 * 1000;

export type EntitlementRole = "operator" | "pro_client";

export class MissingAdminKeyError extends Error {
  constructor() {
    super("ADMIN_MASTER_KEY is required when NODE_ENV is production.");
    this.name = "MissingAdminKeyError";
  }
}

const PLACEHOLDERS: Record<SecretKeyName, string> = {
  GEMINI_API_KEY: "your_google_ai_studio_key",
  PEXELS_API_KEY: "your_pexels_api_key",
  UNSPLASH_ACCESS_KEY: "your_unsplash_access_key",
  GRADIUM_API_KEY: "your_gradium_api_key",
};

const ALL_PLACEHOLDERS = new Set<string>(Object.values(PLACEHOLDERS));

export function resolveAdminMasterKey(): string | null {
  const envKey = process.env.ADMIN_MASTER_KEY?.trim();
  if (envKey && envKey.length > 0) {
    return envKey;
  }
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return "VOKALOOM-ADMIN-2026";
}

export function isDedicatedSigningSecretConfigured(): boolean {
  const signingSecret = process.env.SESSION_SIGNING_SECRET?.trim();
  return Boolean(signingSecret && signingSecret.length > 0);
}

export function resolveSessionSigningSecret(): string | null {
  const dedicated = process.env.SESSION_SIGNING_SECRET?.trim();
  if (dedicated && dedicated.length > 0) {
    return dedicated;
  }
  return resolveAdminMasterKey();
}

function deriveAesKey(): Buffer {
  const secret = resolveSessionSigningSecret();
  if (!secret) {
    throw new MissingAdminKeyError();
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function deriveHmacKey(purpose: string): Buffer | null {
  const secret = resolveSessionSigningSecret();
  if (!secret) {
    return null;
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`vokaloom-hmac:${purpose}`)
    .digest();
}

export function signAdminSessionToken(nowMs = Date.now()): string | null {
  const hmacKey = deriveHmacKey("admin-session");
  if (!hmacKey) return null;
  const tsStr = String(nowMs);
  const sig = crypto
    .createHmac("sha256", hmacKey)
    .update(tsStr)
    .digest("base64url");
  return `${tsStr}.${sig}`;
}

export function verifyAdminSessionToken(
  token: string | undefined,
  nowMs = Date.now()
): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [tsStr, sigStr] = parts;
  if (!tsStr || !sigStr || !/^\d+$/.test(tsStr)) return false;

  const issuedAt = Number(tsStr);
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt <= 0 ||
    nowMs - issuedAt > ADMIN_SESSION_TTL_MS ||
    issuedAt > nowMs + 60_000
  ) {
    return false;
  }

  const hmacKey = deriveHmacKey("admin-session");
  if (!hmacKey) return false;

  const expected = crypto
    .createHmac("sha256", hmacKey)
    .update(tsStr)
    .digest();
  const provided = Buffer.from(sigStr, "base64url");
  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}

export function signEntitlementToken(
  role: EntitlementRole,
  subjectId?: string,
  nowMs = Date.now()
): string | null {
  const hmacKey = deriveHmacKey("entitlement");
  if (!hmacKey) return null;
  const cleanSub =
    typeof subjectId === "string" && /^[a-z0-9_-]{4,64}$/i.test(subjectId)
      ? subjectId
      : undefined;
  const payload = Buffer.from(
    JSON.stringify({ role, iat: nowMs, ...(cleanSub ? { sub: cleanSub } : {}) }),
    "utf8"
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", hmacKey)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyEntitlementToken(
  token: string | undefined,
  nowMs = Date.now()
): {
  valid: boolean;
  role: EntitlementRole | "guest";
  isPro: boolean;
  isOperator: boolean;
  subjectId?: string;
} {
  const guestResult = {
    valid: false,
    role: "guest" as const,
    isPro: false,
    isOperator: false,
  };

  if (!token || typeof token !== "string") return guestResult;
  const parts = token.split(".");
  if (parts.length !== 2) return guestResult;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return guestResult;

  const hmacKey = deriveHmacKey("entitlement");
  if (!hmacKey) return guestResult;

  const expected = crypto
    .createHmac("sha256", hmacKey)
    .update(payloadB64)
    .digest();
  const provided = Buffer.from(sigB64, "base64url");
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return guestResult;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { role?: unknown; iat?: unknown; sub?: unknown };

    const iat = Number(parsed.iat);
    if (
      !Number.isFinite(iat) ||
      iat <= 0 ||
      nowMs - iat > ENTITLEMENT_TTL_MS ||
      iat > nowMs + 60_000
    ) {
      return guestResult;
    }

    const subjectId =
      typeof parsed.sub === "string" &&
      /^[a-z0-9_-]{4,64}$/i.test(parsed.sub)
        ? parsed.sub
        : undefined;

    if (parsed.role === "operator") {
      return {
        valid: true,
        role: "operator",
        isPro: true,
        isOperator: true,
        ...(subjectId ? { subjectId } : {}),
      };
    }

    if (parsed.role === "pro_client") {
      return {
        valid: true,
        role: "pro_client",
        isPro: true,
        isOperator: false,
        ...(subjectId ? { subjectId } : {}),
      };
    }

    return guestResult;
  } catch {
    return guestResult;
  }
}

function readCookieFromHeader(
  cookieHeader: string | undefined,
  cookieName: string
): string | undefined {
  if (!cookieHeader) return undefined;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = pair.slice(0, eqIndex).trim();
    if (name === cookieName) {
      const rawValue = pair.slice(eqIndex + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return undefined;
}

export async function resolveServerEntitlement(
  fallbackCookieHeader?: string
): Promise<{
  role: EntitlementRole | "guest";
  isPro: boolean;
  isOperator: boolean;
  subjectId?: string;
}> {
  let adminToken: string | undefined;
  let entitlementToken: string | undefined;

  try {
    const cookieStore = await cookies();
    adminToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    entitlementToken = cookieStore.get(ENTITLEMENT_COOKIE_NAME)?.value;
  } catch {
    adminToken = readCookieFromHeader(
      fallbackCookieHeader,
      ADMIN_SESSION_COOKIE_NAME
    );
    entitlementToken = readCookieFromHeader(
      fallbackCookieHeader,
      ENTITLEMENT_COOKIE_NAME
    );
  }

  if (verifyAdminSessionToken(adminToken)) {
    return { role: "operator", isPro: true, isOperator: true };
  }

  const verified = verifyEntitlementToken(entitlementToken);
  if (verified.valid) {
    return {
      role: verified.role,
      isPro: verified.isPro,
      isOperator: verified.isOperator,
      ...(verified.subjectId ? { subjectId: verified.subjectId } : {}),
    };
  }

  return { role: "guest", isPro: false, isOperator: false };
}

export function signTrialToken(
  used: number,
  resetAtMs: number,
  nowMs = Date.now()
): string | null {
  const hmacKey = deriveHmacKey("trial-quota");
  if (!hmacKey) return null;
  const payload = Buffer.from(
    JSON.stringify({ used, resetAt: resetAtMs, iat: nowMs }),
    "utf8"
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", hmacKey)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTrialToken(
  token: string | undefined,
  nowMs = Date.now()
): { valid: boolean; used: number; resetAt: number } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const hmacKey = deriveHmacKey("trial-quota");
  if (!hmacKey) return null;

  const expected = crypto
    .createHmac("sha256", hmacKey)
    .update(payloadB64)
    .digest();
  const provided = Buffer.from(sigB64, "base64url");
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { used?: unknown; resetAt?: unknown; iat?: unknown };

    const used = Number(parsed.used);
    const resetAt = Number(parsed.resetAt);
    const iat = Number(parsed.iat);

    if (
      !Number.isInteger(used) ||
      used < 0 ||
      !Number.isFinite(resetAt) ||
      !Number.isFinite(iat) ||
      iat <= 0 ||
      iat > nowMs + 60_000 ||
      nowMs > resetAt ||
      resetAt > nowMs + TRIAL_TTL_MS + 60_000
    ) {
      return null;
    }

    return { valid: true, used, resetAt };
  } catch {
    return null;
  }
}

export async function getVerifiedTrialUsageFromCookie(
  nowMs = Date.now(),
  fallbackCookieHeader?: string
): Promise<{ used: number; resetAt: number } | null> {
  let rawToken: string | undefined;
  try {
    const cookieStore = await cookies();
    rawToken = cookieStore.get(TRIAL_COOKIE_NAME)?.value;
  } catch {
    rawToken = readCookieFromHeader(fallbackCookieHeader, TRIAL_COOKIE_NAME);
  }
  const verified = verifyTrialToken(rawToken, nowMs);
  if (!verified || !verified.valid) return null;
  return { used: verified.used, resetAt: verified.resetAt };
}

export function isValidSecretValue(
  val: string | undefined,
  keyName?: SecretKeyName
): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  if (trimmed.length <= 5) return false;
  if (keyName && trimmed === PLACEHOLDERS[keyName]) return false;
  if (ALL_PLACEHOLDERS.has(trimmed)) return false;
  return true;
}

const SECRET_KEY_SET = new Set<string>(SECRET_KEY_NAMES);

export interface VaultState {
  secrets: Partial<Record<SecretKeyName, string>>;
  cleared: SecretKeyName[];
}

export interface PersistLocalEnvOptions {
  /**
   * Only delete cleared keys from `.env.local` when explicitly requested.
   * Defaults to false so runtime browser-session CLEAR keeps on-disk keys intact.
   */
  allowClearFromDisk?: boolean;
}

export function encryptSecretsPayload(
  secrets: Partial<Record<SecretKeyName, string>>,
  clearedKeys: readonly SecretKeyName[] = []
): string {
  const sanitized: Partial<Record<SecretKeyName, string>> = {};
  for (const name of SECRET_KEY_NAMES) {
    const val = secrets[name]?.trim();
    if (isValidSecretValue(val, name)) {
      sanitized[name] = val;
    }
  }

  const sanitizedCleared: SecretKeyName[] = [];
  const seenCleared = new Set<string>();
  for (const name of clearedKeys) {
    if (
      SECRET_KEY_SET.has(name) &&
      !sanitized[name] &&
      !seenCleared.has(name)
    ) {
      seenCleared.add(name);
      sanitizedCleared.push(name);
    }
  }

  const payloadObj: Record<string, unknown> = { ...sanitized };
  if (sanitizedCleared.length > 0) {
    payloadObj.__cleared = sanitizedCleared;
  }

  const key = deriveAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptVaultStatePayload(token: string): VaultState {
  const empty: VaultState = { secrets: {}, cleared: [] };
  if (!token || typeof token !== "string") {
    return empty;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return empty;

    const iv = Buffer.from(parts[0], "base64url");
    const authTag = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");

    if (iv.length !== 12 || authTag.length !== 16) {
      return empty;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveAesKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    const parsed = JSON.parse(decrypted.toString("utf8")) as Record<
      string,
      unknown
    >;
    if (!parsed || typeof parsed !== "object") return empty;

    const secrets: Partial<Record<SecretKeyName, string>> = {};
    for (const name of SECRET_KEY_NAMES) {
      const val = parsed[name];
      if (typeof val === "string" && isValidSecretValue(val, name)) {
        secrets[name] = val.trim();
      }
    }

    const cleared: SecretKeyName[] = [];
    const seenCleared = new Set<string>();
    if (Array.isArray(parsed.__cleared)) {
      for (const rawKey of parsed.__cleared) {
        if (
          typeof rawKey === "string" &&
          SECRET_KEY_SET.has(rawKey) &&
          !secrets[rawKey as SecretKeyName] &&
          !seenCleared.has(rawKey)
        ) {
          seenCleared.add(rawKey);
          cleared.push(rawKey as SecretKeyName);
        }
      }
    }

    return { secrets, cleared };
  } catch {
    return empty;
  }
}

export function decryptSecretsPayload(
  token: string
): Partial<Record<SecretKeyName, string>> {
  return decryptVaultStatePayload(token).secrets;
}

export async function getVaultStateFromCookie(
  fallbackCookieHeader?: string
): Promise<VaultState> {
  const empty: VaultState = { secrets: {}, cleared: [] };
  let adminToken: string | undefined;
  let rawToken: string | undefined;

  try {
    const cookieStore = await cookies();
    adminToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    rawToken = cookieStore.get(VAULT_COOKIE_NAME)?.value;
  } catch {
    adminToken = readCookieFromHeader(
      fallbackCookieHeader,
      ADMIN_SESSION_COOKIE_NAME
    );
    rawToken = readCookieFromHeader(fallbackCookieHeader, VAULT_COOKIE_NAME);
  }

  // Strictly scope browser Vault overrides to authenticated Operator sessions.
  // Non-operator / guest traffic always resolves exclusively from server process.env.
  if (!verifyAdminSessionToken(adminToken) || !rawToken) {
    return empty;
  }

  return decryptVaultStatePayload(rawToken);
}

export async function getVaultSecretsFromCookie(
  fallbackCookieHeader?: string
): Promise<Partial<Record<SecretKeyName, string>>> {
  return (await getVaultStateFromCookie(fallbackCookieHeader)).secrets;
}

export function resolveSecretValueForState(
  name: SecretKeyName,
  vault: VaultState
): string | undefined {
  const vaultVal = vault.secrets[name];
  if (isValidSecretValue(vaultVal, name)) {
    return vaultVal.trim();
  }

  if (vault.cleared.includes(name)) {
    return undefined;
  }

  const envVal = process.env[name]?.trim();
  if (isValidSecretValue(envVal, name)) {
    return envVal;
  }

  return undefined;
}

export async function resolveApiKey(
  name: SecretKeyName,
  fallbackCookieHeader?: string
): Promise<string | undefined> {
  const vault = await getVaultStateFromCookie(fallbackCookieHeader);
  return resolveSecretValueForState(name, vault);
}

export function maskSecret(val: string | undefined): string | null {
  if (!isValidSecretValue(val)) {
    return null;
  }
  const trimmed = val.trim();
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}••••`;
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

let envWriteQueue: Promise<void> = Promise.resolve();

function withEnvWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = envWriteQueue.then(fn, fn);
  envWriteQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function persistLocalEnvIfDev(
  updates: Partial<Record<SecretKeyName, string>>,
  keysToClear: SecretKeyName[] = [],
  options: PersistLocalEnvOptions = {}
): Promise<boolean> {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const remainingKeys = new Set<SecretKeyName>();
  for (const name of SECRET_KEY_NAMES) {
    const val = updates[name]?.trim();
    if (val && isValidSecretValue(val, name)) {
      remainingKeys.add(name);
    }
  }

  const clearSet = new Set<SecretKeyName>();
  if (options.allowClearFromDisk === true) {
    for (const rawKey of keysToClear) {
      if (SECRET_KEY_SET.has(rawKey) && !remainingKeys.has(rawKey)) {
        clearSet.add(rawKey);
      }
    }
  }

  if (remainingKeys.size === 0 && clearSet.size === 0) {
    return false;
  }

  return withEnvWriteLock(async () => {
    const envPath = path.join(process.cwd(), ".env.local");
    const envDir = path.dirname(envPath);
    const tempPath = path.join(
      envDir,
      `.env.local.tmp-${process.pid}-${Date.now()}-${crypto.randomUUID()}`
    );

    try {
      let existing = "";
      try {
        existing = await fs.readFile(envPath, "utf8");
      } catch {
        existing = "";
      }

      const lines = existing ? existing.split(/\r?\n/) : [];
      const pendingAdds = new Set<SecretKeyName>(remainingKeys);
      const nextLines: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) {
          nextLines.push(line);
          continue;
        }

        const eqIndex = line.indexOf("=");
        if (eqIndex <= 0) {
          nextLines.push(line);
          continue;
        }

        const rawKey = line.slice(0, eqIndex).trim();
        if (!SECRET_KEY_SET.has(rawKey)) {
          nextLines.push(line);
          continue;
        }

        const keyPart = rawKey as SecretKeyName;
        if (clearSet.has(keyPart)) {
          continue;
        }

        if (pendingAdds.has(keyPart)) {
          const cleanVal = updates[keyPart]!.trim().replace(/[\r\n]/g, "");
          nextLines.push(`${keyPart}=${cleanVal}`);
          pendingAdds.delete(keyPart);
        } else {
          nextLines.push(line);
        }
      }

      for (const keyToAdd of pendingAdds) {
        const cleanVal = updates[keyToAdd]!.trim().replace(/[\r\n]/g, "");
        nextLines.push(`${keyToAdd}=${cleanVal}`);
      }

      const normalizedContent =
        nextLines
          .filter((l, idx) => idx < nextLines.length - 1 || l !== "")
          .join("\n") + "\n";

      await fs.writeFile(tempPath, normalizedContent, {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.rename(tempPath, envPath);
      return true;
    } catch {
      await fs.unlink(tempPath).catch(() => undefined);
      return false;
    }
  });
}
