import { sessionCrypto, ZaloSessionCrypto } from "./zalo-session.crypto.js";
import { sessionRepository, ZaloSessionRepository } from "./zalo-session.repository.js";
import { logger } from "../../config/logger.js";
import type { ZaloCredentials, ZaloAccountStatus } from "./zalo-auth.types.js";

export class ZaloSessionService {
  constructor(
    private repository: ZaloSessionRepository = sessionRepository,
    private crypto: ZaloSessionCrypto = sessionCrypto
  ) {}

  /**
   * Save newly authenticated credentials securely
   */
  public async saveSession(params: {
    userId: string;
    zaloId: string;
    displayName: string;
    avatar?: string;
    credentials: ZaloCredentials;
    proxy?: string;
  }) {
    const { userId, zaloId, displayName, avatar, credentials, proxy } = params;

    // Encrypt credentials before writing to database
    const encryptedSession = this.crypto.encrypt(credentials);

    const account = await this.repository.upsertAccountWithSession({
      userId,
      zaloId,
      displayName,
      avatar,
      status: "AUTHENTICATED" as ZaloAccountStatus,
      encryptedSession,
      proxy,
    });

    logger.info({ accountId: account.id, userId, zaloId }, "Zalo session encrypted and saved successfully");
    return account;
  }

  /**
   * Retrieve and decrypt credentials for a tenant
   */
  public async getDecryptedCredentials(accountId: string, userId: string): Promise<ZaloCredentials> {
    const encryptedData = await this.repository.getEncryptedSession(accountId, userId);
    return this.crypto.decrypt(encryptedData);
  }

  /**
   * Mark session as invalid (forces REAUTH_REQUIRED)
   */
  public async invalidateSession(accountId: string, reason?: string) {
    logger.warn({ accountId, reason }, "Invalidating Zalo session");
    await this.repository.invalidateSession(accountId, reason);
  }

  /**
   * Update account status
   */
  public async updateStatus(accountId: string, status: ZaloAccountStatus, reason?: string) {
    await this.repository.updateAccountStatus(accountId, status, reason);
  }
}

export const sessionService = new ZaloSessionService();
