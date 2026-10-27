import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { authService, ZaloAuthService } from "../zalo-auth/zalo-auth.service.js";

export class SubscriptionGuardService {
  constructor(private zaloAuth: ZaloAuthService = authService) {}

  /**
   * Scans for expired subscriptions and stops all running bots for those users
   */
  public async checkAndStopExpiredBots(): Promise<number> {
    const now = new Date();

    // Find all users who do NOT have an active subscription
    const activeSubUsers = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      select: { userId: true },
    });

    const activeUserIds = new Set(activeSubUsers.map((s) => s.userId));

    // Find all accounts currently marked ONLINE whose user is not in activeUserIds
    const runningAccounts = await prisma.zaloAccount.findMany({
      where: {
        status: { in: ["ONLINE", "CONNECTING", "RECONNECTING"] },
      },
      select: { id: true, userId: true },
    });

    let stoppedCount = 0;

    for (const acc of runningAccounts) {
      if (!activeUserIds.has(acc.userId)) {
        logger.warn(
          { accountId: acc.id, userId: acc.userId },
          "Stopping Zalo bot because user subscription has expired"
        );

        // Stop active connection in worker memory
        await this.zaloAuth.disconnectAccount(acc.id, acc.userId);

        // Update database status
        await prisma.zaloAccount.update({
          where: { id: acc.id },
          data: {
            status: "STOPPED",
            errorReason: "Gói thuê bao đã hết hạn. Vui lòng nạp tiền/gia hạn để tiếp tục sử dụng.",
          },
        });

        stoppedCount++;
      }
    }

    if (stoppedCount > 0) {
      logger.info({ stoppedCount }, "Expired bots stopped successfully");
    }

    return stoppedCount;
  }
}

export const subscriptionGuard = new SubscriptionGuardService();
