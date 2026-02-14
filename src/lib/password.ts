import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_PREFIX = "scrypt";
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [algorithm, salt, hash] = passwordHash.split("$");
  if (algorithm !== SCRYPT_PREFIX || !salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}
