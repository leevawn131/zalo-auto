import { describe, it, expect } from "vitest";
import { ZaloSessionCrypto } from "../zalo-session.crypto.js";
import { ZaloSessionCorruptedError } from "../zalo-auth.errors.js";
import type { ZaloCredentials } from "../zalo-auth.types.js";

describe("ZaloSessionCrypto (AES-256-GCM)", () => {
  const cryptoInstance = new ZaloSessionCrypto("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");

  const sampleCredentials: ZaloCredentials = {
    imei: "zalo-imei-test-123456",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    cookie: [
      {
        domain: "chat.zalo.me",
        path: "/",
        value: "secret_zalo_session_token_xyz",
        name: "zpw_sek",
      },
      {
        domain: "zalo.me",
        path: "/",
        value: "another_cookie_val",
        name: "_ga",
      },
    ],
    language: "vi",
  };

  it("should successfully encrypt and decrypt credentials with AES-256-GCM", () => {
    const encrypted = cryptoInstance.encrypt(sampleCredentials);

    expect(encrypted.encryptedData).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes in hex = 24 chars
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes in hex = 32 chars
    expect(encrypted.keyVersion).toBe("v1");

    // Ciphertext should not contain plaintext
    expect(encrypted.encryptedData).not.toContain("secret_zalo_session_token_xyz");
    expect(encrypted.encryptedData).not.toContain("zalo-imei-test-123456");

    const decrypted = cryptoInstance.decrypt(encrypted);
    expect(decrypted).toEqual(sampleCredentials);
  });

  it("should generate unique IV for every encryption call", () => {
    const enc1 = cryptoInstance.encrypt(sampleCredentials);
    const enc2 = cryptoInstance.encrypt(sampleCredentials);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.encryptedData).not.toBe(enc2.encryptedData);
    expect(enc1.authTag).not.toBe(enc2.authTag);
  });

  it("should detect tampered ciphertext and throw ZaloSessionCorruptedError", () => {
    const encrypted = cryptoInstance.encrypt(sampleCredentials);

    // Tamper with ciphertext by altering a base64 character
    const tamperedData =
      encrypted.encryptedData.slice(0, -2) +
      (encrypted.encryptedData.endsWith("A") ? "B" : "A") +
      encrypted.encryptedData.slice(-1);

    expect(() =>
      cryptoInstance.decrypt({
        ...encrypted,
        encryptedData: tamperedData,
      })
    ).toThrow(ZaloSessionCorruptedError);
  });

  it("should detect tampered auth tag and throw ZaloSessionCorruptedError", () => {
    const encrypted = cryptoInstance.encrypt(sampleCredentials);

    // Alter auth tag
    const tamperedTag =
      encrypted.authTag.slice(0, 10) +
      (encrypted.authTag[10] === "0" ? "1" : "0") +
      encrypted.authTag.slice(11);

    expect(() =>
      cryptoInstance.decrypt({
        ...encrypted,
        authTag: tamperedTag,
      })
    ).toThrow(ZaloSessionCorruptedError);
  });

  it("should detect tampered IV and throw ZaloSessionCorruptedError", () => {
    const encrypted = cryptoInstance.encrypt(sampleCredentials);

    // Alter IV
    const tamperedIv =
      encrypted.iv.slice(0, 5) +
      (encrypted.iv[5] === "a" ? "b" : "a") +
      encrypted.iv.slice(6);

    expect(() =>
      cryptoInstance.decrypt({
        ...encrypted,
        iv: tamperedIv,
      })
    ).toThrow(ZaloSessionCorruptedError);
  });

  it("should support key rotation across versions", () => {
    const rotatingCrypto = new ZaloSessionCrypto("initial_key_version_1_32chars_!");
    const oldEncrypted = rotatingCrypto.encrypt(sampleCredentials, "v1");

    // Register a new key version v2
    rotatingCrypto.registerKeyVersion("v2", "secondary_key_version_2_32chars!");

    // Can decrypt old version v1
    const decryptedOld = rotatingCrypto.decrypt(oldEncrypted);
    expect(decryptedOld).toEqual(sampleCredentials);

    // Can encrypt and decrypt with new version v2
    const newEncrypted = rotatingCrypto.encrypt(sampleCredentials, "v2");
    expect(newEncrypted.keyVersion).toBe("v2");
    const decryptedNew = rotatingCrypto.decrypt(newEncrypted);
    expect(decryptedNew).toEqual(sampleCredentials);
  });
});
