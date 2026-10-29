import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { SUBSCRIPTION_PLANS } from "../billing/sepay.service.js";
import { SubscriptionPlanCode } from "../billing/billing.types.js";
import type {
  AdminDashboardStats,
  AdminUserListItem,
  UpdateUserSubscriptionDto,
  BanUserDto,
} from "./admin.types.js";

export class AdminService {
  /**
   * Get high-level SaaS metrics and real-time statistics
   */
  public async getDashboardStats(): Promise<AdminDashboardStats> {
    const now = new Date();

    const [
      totalUsers,
      bannedUsers,
      activeSubscriptions,
      paidRevenueResult,
      totalTransactions,
      paidTransactions,
      totalZaloAccounts,
      onlineZaloAccounts,
      recentPaidTxs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.subscription.count({
        where: {
          status: "ACTIVE",
          expiresAt: { gt: now },
        },
      }),
      prisma.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: { status: "PAID" },
      }),
      prisma.paymentTransaction.count(),
      prisma.paymentTransaction.count({ where: { status: "PAID" } }),
      prisma.zaloAccount.count(),
      prisma.zaloAccount.count({ where: { status: "ONLINE" } }),
      prisma.paymentTransaction.findMany({
        where: { status: "PAID" },
        orderBy: { paidAt: "desc" },
        take: 5,
        include: { user: { select: { email: true } } },
      }),
    ]);

    // Breakdown revenue by plans
    const subscriptionsWithTxs = await prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      select: { planCode: true },
    });

    const revenueByPlan: Record<string, number> = {};
    for (const sub of subscriptionsWithTxs) {
      revenueByPlan[sub.planCode] = (revenueByPlan[sub.planCode] || 0) + 1;
    }

    return {
      totalUsers,
      activeUsers: totalUsers - bannedUsers,
      bannedUsers,
      activeSubscriptions,
      totalRevenue: paidRevenueResult._sum.amount || 0,
      totalTransactions,
      paidTransactions,
      totalZaloAccounts,
      onlineZaloAccounts,
      revenueByPlan,
      recentTransactions: recentPaidTxs.map((tx) => ({
        id: tx.id,
        paymentCode: tx.paymentCode,
        amount: tx.amount,
        status: tx.status,
        paidAt: tx.paidAt,
        userEmail: tx.user.email,
      })),
    };
  }

  /**
   * Get paginated users with subscription & accounts status
   */
  public async getUsers(params: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ users: AdminUserListItem[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    if (params.status === "BANNED") {
      where.isBanned = true;
    } else if (params.status === "ACTIVE") {
      where.isBanned = false;
    } else if (params.status === "ADMIN") {
      where.role = "ADMIN";
    }

    const [total, rawUsers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isBanned: true,
          banReason: true,
          createdAt: true,
          _count: {
            select: {
              accounts: true,
              transactions: true,
            },
          },
          accounts: {
            select: {
              status: true,
            },
          },
          subscriptions: {
            orderBy: { expiresAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const now = new Date();

    const users: AdminUserListItem[] = rawUsers.map((u) => {
      const latestSub = u.subscriptions[0] || null;
      let subInfo = null;

      if (latestSub) {
        const isActive = latestSub.status === "ACTIVE" && latestSub.expiresAt > now;
        const daysRemaining = isActive
          ? Math.ceil((latestSub.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        const plan = SUBSCRIPTION_PLANS[latestSub.planCode as SubscriptionPlanCode];
        const maxBots = latestSub.maxBots ?? (plan?.maxBots || 2);

        subInfo = {
          id: latestSub.id,
          planCode: latestSub.planCode,
          status: latestSub.status,
          expiresAt: latestSub.expiresAt,
          daysRemaining,
          isActive,
          maxBots,
        };
      }

      const onlineAccountsCount = u.accounts.filter((a) => a.status === "ONLINE").length;

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isBanned: u.isBanned,
        banReason: u.banReason,
        createdAt: u.createdAt,
        accountsCount: u._count.accounts,
        onlineAccountsCount,
        transactionsCount: u._count.transactions,
        subscription: subInfo,
      };
    });

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get detailed profile of a single user
   */
  public async getUserDetail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isBanned: true,
        banReason: true,
        createdAt: true,
        updatedAt: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
        },
        transactions: {
          orderBy: { createdAt: "desc" },
        },
        accounts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            zaloId: true,
            displayName: true,
            avatar: true,
            status: true,
            lastSeenAt: true,
            createdAt: true,
            botConfig: {
              select: {
                isEnabled: true,
                replyInPrivate: true,
                replyInGroup: true,
                rateLimitPerMinute: true,
                _count: {
                  select: { rules: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("Người dùng không tồn tại");
    }

    return user;
  }

  /**
   * Manually adjust or extend a user's subscription
   */
  public async updateUserSubscription(
    userId: string,
    dto: UpdateUserSubscriptionDto
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("Người dùng không tồn tại");
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { expiresAt: "desc" },
    });

    const now = new Date();
    let newExpiresAt: Date;

    if (dto.customExpiresAt) {
      newExpiresAt = new Date(dto.customExpiresAt);
    } else if (dto.addDays && dto.addDays > 0) {
      const baseDate =
        existingSub && existingSub.expiresAt > now ? existingSub.expiresAt : now;
      newExpiresAt = new Date(baseDate.getTime() + dto.addDays * 24 * 60 * 60 * 1000);
    } else if (existingSub) {
      newExpiresAt = existingSub.expiresAt;
    } else {
      // Default 30 days if new
      newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    const planCode = dto.planCode || existingSub?.planCode || SubscriptionPlanCode.STARTER_2;
    const status = dto.status || "ACTIVE";
    const maxBots = dto.maxBots !== undefined ? dto.maxBots : existingSub?.maxBots;

    let updatedSub;
    if (existingSub) {
      updatedSub = await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          planCode,
          status,
          expiresAt: newExpiresAt,
          maxBots,
        },
      });
    } else {
      updatedSub = await prisma.subscription.create({
        data: {
          userId,
          planCode,
          status,
          startsAt: now,
          expiresAt: newExpiresAt,
          maxBots,
        },
      });
    }

    logger.info(
      { userId, planCode, expiresAt: newExpiresAt, maxBots },
      "Admin updated user subscription"
    );

    return updatedSub;
  }

  /**
   * Ban or unban a user
   */
  public async banUser(userId: string, dto: BanUserDto, adminId: string) {
    if (userId === adminId) {
      throw new Error("Không thể tự khóa tài khoản của chính mình");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("Người dùng không tồn tại");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: dto.isBanned,
        banReason: dto.isBanned ? dto.reason || "Bị khóa bởi Quản trị viên" : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isBanned: true,
        banReason: true,
      },
    });

    // If banning, pause all active Zalo bot accounts for this user
    if (dto.isBanned) {
      await prisma.zaloAccount.updateMany({
        where: { userId },
        data: { status: "STOPPED", errorReason: "Tài khoản bị khóa bởi Admin" },
      });
    }

    logger.warn({ adminId, userId, isBanned: dto.isBanned }, "Admin modified user ban status");

    return updated;
  }

  /**
   * Update role (promote to ADMIN or demote to USER)
   */
  public async updateUserRole(userId: string, role: "USER" | "ADMIN", adminId: string) {
    if (userId === adminId && role !== "ADMIN") {
      throw new Error("Không thể tự tước quyền Quản trị viên của chính mình");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });

    logger.info({ adminId, userId, role }, "Admin modified user role");
    return updated;
  }

  /**
   * Delete user and cascade clean up
   */
  public async deleteUser(userId: string, adminId: string) {
    if (userId === adminId) {
      throw new Error("Không thể tự xóa tài khoản của chính mình");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("Người dùng không tồn tại");
    }

    await prisma.user.delete({ where: { id: userId } });
    logger.warn({ adminId, deletedUserId: userId, email: user.email }, "Admin deleted user account");

    return { success: true, message: `Đã xóa người dùng ${user.email} thành công` };
  }

  /**
   * Get all transactions system-wide
   */
  public async getTransactions(params: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { paymentCode: { contains: q, mode: "insensitive" } },
        { referenceCode: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    if (params.status && params.status !== "ALL") {
      where.status = params.status;
    }

    const [total, transactions] = await Promise.all([
      prisma.paymentTransaction.count({ where }),
      prisma.paymentTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
    ]);

    return {
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Manually approve a pending payment transaction
   */
  public async manualApproveTransaction(transactionId: string, adminId: string) {
    const tx = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new Error("Giao dịch không tồn tại");
    }

    if (tx.status === "PAID") {
      throw new Error("Giao dịch này đã được thanh toán trước đó");
    }

    const now = new Date();
    let durationDays = 30;
    let planCode = SubscriptionPlanCode.STARTER_2;

    if (tx.amount >= 1100000) {
      planCode = SubscriptionPlanCode.PRO_9;
      durationDays = 365;
    } else if (tx.amount >= 550000) {
      planCode = SubscriptionPlanCode.STANDARD_5;
      durationDays = 180;
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId: tx.userId },
      orderBy: { expiresAt: "desc" },
    });

    const newExpiresAt =
      existingSub && existingSub.expiresAt > now
        ? new Date(existingSub.expiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const subscription = await prisma.subscription.upsert({
      where: { id: existingSub?.id || "non_existent_id" },
      create: {
        userId: tx.userId,
        planCode,
        status: "ACTIVE",
        startsAt: now,
        expiresAt: newExpiresAt,
      },
      update: {
        planCode,
        status: "ACTIVE",
        expiresAt: newExpiresAt,
      },
    });

    const updatedTx = await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: "PAID",
        subscriptionId: subscription.id,
        paidAt: now,
        webhookPayload: JSON.stringify({ approvedByAdmin: adminId, approvedAt: now }),
      },
    });

    logger.info(
      { adminId, transactionId, userId: tx.userId, paymentCode: tx.paymentCode },
      "Admin manually approved transaction"
    );

    return {
      transaction: updatedTx,
      subscription,
    };
  }

  /**
   * Get all Zalo accounts across the entire system
   */
  public async getAllZaloAccounts(params: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search) {
      const q = params.search.trim();
      where.OR = [
        { displayName: { contains: q, mode: "insensitive" } },
        { zaloId: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    if (params.status && params.status !== "ALL") {
      where.status = params.status;
    }

    const [total, accounts] = await Promise.all([
      prisma.zaloAccount.count({ where }),
      prisma.zaloAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true },
          },
          botConfig: {
            select: {
              isEnabled: true,
              replyInPrivate: true,
              replyInGroup: true,
              _count: { select: { rules: true } },
            },
          },
        },
      }),
    ]);

    return {
      accounts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Disconnect any bot on the system
   */
  public async forceDisconnectBot(accountId: string, adminId: string) {
    const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new Error("Tài khoản Zalo không tồn tại");
    }

    await prisma.zaloAccount.update({
      where: { id: accountId },
      data: {
        status: "STOPPED",
        errorReason: "Bị ngắt kết nối bởi Quản trị viên",
      },
    });

    logger.warn({ adminId, accountId, zaloId: account.zaloId }, "Admin force disconnected Zalo bot");

    return { success: true, message: `Đã ngắt kết nối bot ${account.displayName}` };
  }
}

export const adminService = new AdminService();
