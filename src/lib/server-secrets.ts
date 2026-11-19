import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

export type SecretKeyName =
  | "GEMINI_API_KEY"
  | "PEXELS_API_KEY"
  | "UNSPLASH_ACCESS_KEY"
  | "FAL_KEY";

export const SECRET_KEY_NAMES: readonly SecretKeyName[] = [
  "GEMINI_API_KEY",
  "PEXELS_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "FAL_KEY",
];

export const VAULT_COOKIE_NAME = "vokaloom_vault_v1";

const PLACEHOLDERS: Record<SecretKeyName, string> = {
  GEMINI_API_KEY: "your_google_ai_studio_key",
  PEXELS_API_KEY: "your_pexels_api_key",
  UNSPLASH_ACCESS_KEY: "your_unsplash_access_key",
  FAL_KEY: "your_fal_ai_key",
};

const ALL_PLACEHOLDERS = new Set<string>(Object.values(PLACEHOLDERS));

function deriveAesKey(): Buffer {
  const master = process.env.ADMIN_MASTER_KEY || "VOKALOOM-ADMIN-2026";
  return crypto.createHash("sha256").update(master).digest();
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

export function encryptSecretsPayload(
  secrets: Partial<Record<SecretKeyName, string>>
): string {
  const sanitized: Partial<Record<SecretKeyName, string>> = {};
  for (const name of SECRET_KEY_NAMES) {
    const val = secrets[name]?.trim();
    if (isValidSecretValue(val, name)) {
      sanitized[name] = val;
    }
  }

  const key = deriveAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(sanitized), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecretsPayload(
  token: string
): Partial<Record<SecretKeyName, string>> {
  if (!token || typeof token !== "string") {
    return {};
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};

    const iv = Buffer.from(parts[0], "base64url");
    const authTag = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");

    if (iv.length !== 12 || authTag.length !== 16) {
      return {};
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
    if (!parsed || typeof parsed !== "object") return {};

    const result: Partial<Record<SecretKeyName, string>> = {};
    for (const name of SECRET_KEY_NAMES) {
      const val = parsed[name];
      if (typeof val === "string" && isValidSecretValue(val, name)) {
        result[name] = val.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function getVaultSecretsFromCookie(): Promise<
  Partial<Record<SecretKeyName, string>>
> {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(VAULT_COOKIE_NAME)?.value;
    if (!rawToken) return {};
    return decryptSecretsPayload(rawToken);
  } catch {
    return {};
  }
}

export async function resolveApiKey(
  name: SecretKeyName
): Promise<string | undefined> {
  const vault = await getVaultSecretsFromCookie();
  const vaultVal = vault[name];
  if (isValidSecretValue(vaultVal, name)) {
    return vaultVal.trim();
  }

  const envVal = process.env[name]?.trim();
  if (isValidSecretValue(envVal, name)) {
    return envVal;
  }

  return undefined;
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

export async function persistLocalEnvIfDev(
  updates: Partial<Record<SecretKeyName, string>>,
  keysToClear: SecretKeyName[] = []
): Promise<boolean> {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  try {
    const envPath = path.join(process.cwd(), ".env.local");
    let existing = "";
    try {
      existing = await fs.readFile(envPath, "utf8");
    } catch {
      existing = "";
    }

    const lines = existing ? existing.split(/\r?\n/) : [];
    const remainingKeys = new Set<SecretKeyName>();
    const clearSet = new Set<SecretKeyName>(keysToClear);

    for (const name of SECRET_KEY_NAMES) {
      const val = updates[name]?.trim();
      if (val && isValidSecretValue(val, name)) {
        remainingKeys.add(name);
      }
    }

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

      const keyPart = line.slice(0, eqIndex).trim() as SecretKeyName;
      if (clearSet.has(keyPart)) {
        continue;
      }

      if (remainingKeys.has(keyPart)) {
        const cleanVal = updates[keyPart]!.trim().replace(/[\r\n]/g, "");
        nextLines.push(`${keyPart}=${cleanVal}`);
        remainingKeys.delete(keyPart);
      } else {
        nextLines.push(line);
      }
    }

    for (const keyToAdd of remainingKeys) {
      const cleanVal = updates[keyToAdd]!.trim().replace(/[\r\n]/g, "");
      nextLines.push(`${keyToAdd}=${cleanVal}`);
    }

    const normalizedContent =
      nextLines.filter((l, idx) => idx < nextLines.length - 1 || l !== "").join("\n") +
      "\n";
    await fs.writeFile(envPath, normalizedContent, "utf8");
    return true;
  } catch {
    return false;
  }
}
