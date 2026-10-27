import crypto from "node:crypto";
import { env } from "../../config/env.js";
import { ZaloSessionCorruptedError } from "./zalo-auth.errors.js";
import type { EncryptedSessionData, ZaloCredentials } from "./zalo-auth.types.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits standard for GCM
const CURRENT_KEY_VERSION = "v1";

export class ZaloSessionCrypto {
  private keyMap: Map<string, Buffer> = new Map();

  constructor(customKey?: string) {
    const rawKey = customKey || env.SESSION_SECRET_KEY;
    this.initKeys(rawKey);
  }

  private initKeys(primaryKey: string) {
    // If the key is hex and 64 characters (32 bytes), parse directly; otherwise hash to 32 bytes
    let keyBuffer: Buffer;
    if (/^[0-9a-fA-F]{64}$/.test(primaryKey)) {
      keyBuffer = Buffer.from(primaryKey, "hex");
    } else {
      keyBuffer = crypto.createHash("sha256").update(primaryKey).digest();
    }
    this.keyMap.set(CURRENT_KEY_VERSION, keyBuffer);
  }

  /**
   * Register an older or newer key version for rotation
   */
  public registerKeyVersion(version: string, keyHexOrString: string): void {
    let keyBuffer: Buffer;
    if (/^[0-9a-fA-F]{64}$/.test(keyHexOrString)) {
      keyBuffer = Buffer.from(keyHexOrString, "hex");
    } else {
      keyBuffer = crypto.createHash("sha256").update(keyHexOrString).digest();
    }
    this.keyMap.set(version, keyBuffer);
  }

  /**
   * Encrypt credentials object into AES-256-GCM ciphertext + IV + AuthTag
   */
  public encrypt(credentials: ZaloCredentials, keyVersion: string = CURRENT_KEY_VERSION): EncryptedSessionData {
    const key = this.keyMap.get(keyVersion);
    if (!key) {
      throw new ZaloSessionCorruptedError(`Encryption key version '${keyVersion}' not registered`);
    }

    const plaintext = JSON.stringify(credentials);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    const authTag = cipher.getAuthTag().toString("hex");

    return {
      encryptedData: ciphertext,
      iv: iv.toString("hex"),
      authTag,
      keyVersion,
    };
  }

  /**
   * Decrypt ciphertext into ZaloCredentials object
   */
  public decrypt(payload: EncryptedSessionData): ZaloCredentials {
    const { encryptedData, iv, authTag, keyVersion } = payload;
    const key = this.keyMap.get(keyVersion);

    if (!key) {
      throw new ZaloSessionCorruptedError(`Decryption key version '${keyVersion}' not found`);
    }

    try {
      const ivBuffer = Buffer.from(iv, "hex");
      const authTagBuffer = Buffer.from(authTag, "hex");

      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(authTagBuffer);

      let decrypted = decipher.update(encryptedData, "base64", "utf8");
      decrypted += decipher.final("utf8");

      return JSON.parse(decrypted) as ZaloCredentials;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ZaloSessionCorruptedError(`GCM authentication or decryption failed: ${msg}`);
    }
  }
}

export const sessionCrypto = new ZaloSessionCrypto();
