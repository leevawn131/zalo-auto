import { prisma } from "../../config/database.js";
import { TenantAccessDeniedError, ZaloSessionNotFoundError } from "./zalo-auth.errors.js";
import type { EncryptedSessionData, ZaloAccountStatus } from "./zalo-auth.types.js";

export class ZaloSessionRepository {
  /**
   * Find account by ID with strict tenant ownership validation
   */
  public async getAccountByIdAndUser(accountId: string, userId: string) {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      include: { session: true },
    });

    if (!account) {
      return null;
    }

    if (account.userId !== userId) {
      throw new TenantAccessDeniedError(userId, accountId);
    }

    return account;
  }

  /**
   * Upsert a ZaloAccount and its encrypted session
   */
  public async upsertAccountWithSession(params: {
    userId: string;
    zaloId: string;
    displayName: string;
    avatar?: string;
    status: ZaloAccountStatus;
    encryptedSession: EncryptedSessionData;
    proxy?: string;
  }) {
    const { userId, zaloId, displayName, avatar, status, encryptedSession, proxy } = params;

    return prisma.$transaction(async (tx) => {
      // Find if account with this zaloId already exists
      const existing = await tx.zaloAccount.findUnique({
        where: { zaloId },
      });

      if (existing && existing.userId !== userId) {
        // Zalo account already linked to another user account
        throw new TenantAccessDeniedError(userId, existing.id);
      }

      const account = await tx.zaloAccount.upsert({
        where: { zaloId },
        create: {
          userId,
          zaloId,
          displayName,
          avatar,
          status,
          proxy,
          lastSeenAt: new Date(),
        },
        update: {
          displayName,
          avatar: avatar ?? undefined,
          status,
          proxy: proxy ?? undefined,
          lastSeenAt: new Date(),
          errorReason: null,
        },
      });

      // Upsert encrypted session
      await tx.zaloSession.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          encryptedData: encryptedSession.encryptedData,
          iv: encryptedSession.iv,
          authTag: encryptedSession.authTag,
          keyVersion: encryptedSession.keyVersion,
          isValid: true,
          lastVerifiedAt: new Date(),
        },
        update: {
          encryptedData: encryptedSession.encryptedData,
          iv: encryptedSession.iv,
          authTag: encryptedSession.authTag,
          keyVersion: encryptedSession.keyVersion,
          isValid: true,
          lastVerifiedAt: new Date(),
        },
      });

      // Ensure default BotConfiguration exists
      await tx.botConfiguration.upsert({
        where: { accountId: account.id },
        create: {
          accountId: account.id,
          isEnabled: false,
        },
        update: {},
      });

      return account;
    });
  }

  /**
   * Get encrypted session with tenant check
   */
  public async getEncryptedSession(accountId: string, userId: string): Promise<EncryptedSessionData> {
    const account = await this.getAccountByIdAndUser(accountId, userId);

    if (!account) {
      throw new ZaloSessionNotFoundError(accountId);
    }

    if (!account.session || !account.session.isValid) {
      throw new ZaloSessionNotFoundError(accountId);
    }

    return {
      encryptedData: account.session.encryptedData,
      iv: account.session.iv,
      authTag: account.session.authTag,
      keyVersion: account.session.keyVersion,
    };
  }

  /**
   * Update account connection status
   */
  public async updateAccountStatus(accountId: string, status: ZaloAccountStatus, errorReason?: string) {
    return prisma.zaloAccount.update({
      where: { id: accountId },
      data: {
        status,
        errorReason: errorReason ?? null,
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Invalidate session (e.g. cookie expired, kicked)
   */
  public async invalidateSession(accountId: string, reason?: string) {
    await prisma.$transaction([
      prisma.zaloSession.updateMany({
        where: { accountId },
        data: { isValid: false },
      }),
      prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          status: "REAUTH_REQUIRED",
          errorReason: reason || "Session expired or rejected by server",
        },
      }),
    ]);
  }

  /**
   * List all accounts for a tenant user
   */
  public async listUserAccounts(userId: string) {
    return prisma.zaloAccount.findMany({
      where: { userId },
      select: {
        id: true,
        zaloId: true,
        displayName: true,
        avatar: true,
        status: true,
        lastSeenAt: true,
        errorReason: true,
        createdAt: true,
        botConfig: {
          select: {
            isEnabled: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Delete an account and all its sessions/rules
   */
  public async deleteAccount(accountId: string, userId: string) {
    const account = await this.getAccountByIdAndUser(accountId, userId);
    if (!account) {
      throw new ZaloSessionNotFoundError(accountId);
    }

    return prisma.zaloAccount.delete({
      where: { id: accountId },
    });
  }
}

export const sessionRepository = new ZaloSessionRepository();
