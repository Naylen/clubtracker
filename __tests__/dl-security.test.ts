import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptDlNumber,
  encryptDlNumber,
  hashDlNumber,
  maskDlNumber,
  normalizeDlNumber,
  secureDlNumber,
} from "@/lib/dl-security";

describe("DL encryption helper", () => {
  beforeEach(() => {
    process.env.DL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("encrypts and decrypts with AES-256-GCM", () => {
    const original = "ky-1234-xyz";
    const encrypted = encryptDlNumber(original);
    const decrypted = decryptDlNumber(encrypted);

    expect(decrypted).toBe(normalizeDlNumber(original));
  });

  it("builds secure payload with hash and encrypted fields", () => {
    const secured = secureDlNumber("A1234567");

    expect(secured.dlNumberHash.startsWith("sha256$")).toBe(true);
    expect(secured.dlNumberCiphertext.length).toBeGreaterThan(0);
    expect(secured.dlNumberIv.length).toBeGreaterThan(0);
    expect(secured.dlNumberAuthTag.length).toBeGreaterThan(0);
  });

  it("masks DL output", () => {
    expect(maskDlNumber("ABCD1234")).toBe("****1234");
    expect(hashDlNumber("ABCD1234").startsWith("sha256$")).toBe(true);
  });
});
