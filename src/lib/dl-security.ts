import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

type DlEncryptedPayload = {
  dlNumberCiphertext: string;
  dlNumberIv: string;
  dlNumberAuthTag: string;
};

function decodeEncryptionKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    return Buffer.from(trimmed, "base64");
  } catch {
    throw new Error("DL_ENCRYPTION_KEY must be valid base64 or hex.");
  }
}

export function getDlEncryptionKey(): Buffer {
  const raw = process.env.DL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("DL_ENCRYPTION_KEY is required.");
  }

  const key = decodeEncryptionKey(raw);
  if (key.length !== 32) {
    throw new Error("DL_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

export function normalizeDlNumber(input: string): string {
  return input.trim().toUpperCase();
}

export function hashDlNumber(dlNumber: string): string {
  const normalized = normalizeDlNumber(dlNumber);
  const salt = randomBytes(16).toString("base64url");
  const digest = createHash("sha256")
    .update(`${salt}:${normalized}`, "utf8")
    .digest("base64url");
  return `sha256$${salt}$${digest}`;
}

export function encryptDlNumber(dlNumber: string): DlEncryptedPayload {
  const normalized = normalizeDlNumber(dlNumber);
  const key = getDlEncryptionKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    dlNumberCiphertext: ciphertext.toString("base64"),
    dlNumberIv: iv.toString("base64"),
    dlNumberAuthTag: authTag.toString("base64"),
  };
}

export function decryptDlNumber(input: DlEncryptedPayload): string {
  const key = getDlEncryptionKey();
  const decipher = createDecipheriv(
    AES_ALGORITHM,
    key,
    Buffer.from(input.dlNumberIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.dlNumberAuthTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.dlNumberCiphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

export function secureDlNumber(dlNumber: string) {
  const normalized = normalizeDlNumber(dlNumber);
  if (!normalized) {
    throw new Error("Driver license number cannot be empty.");
  }

  return {
    dlNumberHash: hashDlNumber(normalized),
    ...encryptDlNumber(normalized),
  };
}

export function maskDlNumber(dlNumber: string): string {
  const normalized = normalizeDlNumber(dlNumber);
  if (normalized.length <= 4) {
    return "*".repeat(normalized.length);
  }
  return `${"*".repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}
