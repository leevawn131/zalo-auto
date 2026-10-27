import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  SubscriptionPlanCode,
  type PlanDetail,
  type SePayWebhookPayload,
  type InvoiceCreationResult,
} from "./billing.types.js";

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanCode, PlanDetail> = {
  [SubscriptionPlanCode.STARTER_2]: {
    code: SubscriptionPlanCode.STARTER_2,
    name: "Gói 2 Tài Khoản",
    price: 100000,
    durationDays: 30,
    maxBots: 2,
    description: "Chạy đồng thời tối đa 2 tài khoản Zalo trong 30 ngày (1 tháng)",
  },
  [SubscriptionPlanCode.STANDARD_5]: {
    code: SubscriptionPlanCode.STANDARD_5,
    name: "Gói 5 Tài Khoản",
    price: 550000,
    durationDays: 180,
    maxBots: 5,
    description: "Chạy đồng thời tối đa 5 tài khoản Zalo trong 180 ngày (6 tháng)",
  },
  [SubscriptionPlanCode.PRO_9]: {
    code: SubscriptionPlanCode.PRO_9,
    name: "Gói 9 Tài Khoản",
    price: 1100000,
    durationDays: 365,
    maxBots: 9,
    description: "Chạy đồng thời tối đa 9 tài khoản Zalo trong 365 ngày (1 năm)",
  },
};

export class SePayService {
  /**
   * Create an invoice for a subscription purchase
   */
  public async createInvoice(userId: string, planCode: SubscriptionPlanCode): Promise<InvoiceCreationResult> {
    const plan = SUBSCRIPTION_PLANS[planCode];
    if (!plan) {
      throw new Error(`Invalid plan code: ${planCode}`);
    }

    // Generate unique payment code
    const uniqueSuffix = `${Date.now().toString().slice(-5)}${Math.floor(100 + Math.random() * 900)}`;
    const paymentCode = `INV${uniqueSuffix}`;

    const transaction = await prisma.paymentTransaction.create({
      data: {
        userId,
        paymentCode,
        amount: plan.price,
        provider: "SEPAY",
        status: "PENDING",
      },
    });

    const qrCodeUrl = `https://qr.sepay.vn/img?acc=${encodeURIComponent(env.SEPAY_ACCOUNT_NUMBER)}&bank=${encodeURIComponent(
      env.SEPAY_BANK_NAME
    )}&amount=${plan.price}&des=${encodeURIComponent(paymentCode)}`;

    return {
      transactionId: transaction.id,
      paymentCode,
      amount: plan.price,
      qrCodeUrl,
      bankName: env.SEPAY_BANK_NAME,
      accountNumber: env.SEPAY_ACCOUNT_NUMBER,
      accountHolder: env.SEPAY_ACCOUNT_HOLDER,
    };
  }

  /**
   * Process SePay webhook with idempotency and transaction safety
   */
  public async processWebhook(payload: SePayWebhookPayload): Promise<{
    success: boolean;
    reason?: string;
    subscriptionId?: string;
  }> {
    logger.info({ payload }, "Received SePay webhook payload");

    // 1. Only process incoming transfers (transferType === "in")
    if (payload.transferType !== "in" || payload.amountIn <= 0) {
      return { success: false, reason: "Ignored: transferType is not incoming payment" };
    }

    // 2. Extract payment code from transfer description / content
    // Looks for pattern INV followed by digits or alphanumeric
    const match = payload.content.match(/INV[0-9A-Z]+/i);
    if (!match) {
      logger.warn({ content: payload.content }, "No valid payment code found in webhook content");
      return { success: false, reason: "No payment code found in transfer content" };
    }

    const paymentCode = match[0].toUpperCase();

    // 3. Find corresponding transaction
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { paymentCode },
    });

    if (!transaction) {
      logger.warn({ paymentCode }, "Payment code does not match any pending transaction");
      return { success: false, reason: "Transaction not found" };
    }

    // 4. Idempotency check: Already processed
    if (transaction.status === "PAID") {
      logger.info({ paymentCode }, "Transaction already processed. Skipping duplicate.");
      return { success: true, reason: "Transaction already processed" };
    }

    // 5. Check if referenceCode was already used by another transaction
    if (payload.referenceCode) {
      const existingRef = await prisma.paymentTransaction.findUnique({
        where: { referenceCode: payload.referenceCode },
      });
      if (existingRef && existingRef.id !== transaction.id) {
        logger.warn({ referenceCode: payload.referenceCode }, "Duplicate bank reference code detected");
        return { success: false, reason: "Duplicate bank reference code" };
      }
    }

    // 6. Verify amount
    if (payload.amountIn < transaction.amount) {
      logger.warn(
        { expected: transaction.amount, received: payload.amountIn },
        "Insufficient transfer amount"
      );
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          webhookPayload: JSON.stringify(payload),
        },
      });
      return { success: false, reason: "Insufficient amount paid" };
    }

    // 7. Atomic transaction: Mark transaction PAID and extend/create subscription
    return await prisma.$transaction(async (tx) => {
      // Determine plan based on amount paid
      let planCode: string = SubscriptionPlanCode.STARTER_2;

      if (transaction.amount >= 1100000) {
        planCode = SubscriptionPlanCode.PRO_9;
      } else if (transaction.amount >= 550000) {
        planCode = SubscriptionPlanCode.STANDARD_5;
      }

      const planDetail = SUBSCRIPTION_PLANS[planCode as SubscriptionPlanCode];
      const durationDays = planDetail ? planDetail.durationDays : 30;

      // Check current subscription
      const existingSubscription = await tx.subscription.findFirst({
        where: { userId: transaction.userId },
        orderBy: { expiresAt: "desc" },
      });

      const now = new Date();
      let newExpiresAt: Date;

      if (existingSubscription && existingSubscription.expiresAt > now) {
        // Active subscription: extend from current expiration date
        newExpiresAt = new Date(
          existingSubscription.expiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000
        );
      } else {
        // Expired or new subscription: start from now
        newExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      }

      const subscription = await tx.subscription.upsert({
        where: { id: existingSubscription?.id || "non_existent_id" },
        create: {
          userId: transaction.userId,
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

      // Update transaction status
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "PAID",
          subscriptionId: subscription.id,
          referenceCode: payload.referenceCode,
          paidAt: now,
          webhookPayload: JSON.stringify(payload),
        },
      });

      logger.info(
        { userId: transaction.userId, paymentCode, expiresAt: newExpiresAt },
        "Subscription extended successfully"
      );

      return {
        success: true,
        subscriptionId: subscription.id,
      };
    });
  }

  /**
   * Check if a user's subscription is currently active
   */
  public async isUserSubscriptionActive(userId: string): Promise<boolean> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    });

    return !!subscription;
  }

  /**
   * Get maximum allowed bots for user's active subscription
   */
  public async getUserMaxBots(userId: string): Promise<number> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    });

    if (!subscription) return 0;
    const plan = SUBSCRIPTION_PLANS[subscription.planCode as SubscriptionPlanCode];
    return plan?.maxBots || 2;
  }

  /**
   * Check if user is allowed to add a new account based on their plan limit
   */
  public async canUserAddAccount(userId: string): Promise<{
    allowed: boolean;
    currentCount: number;
    maxBots: number;
    reason?: string;
  }> {
    const maxBots = await this.getUserMaxBots(userId);
    if (maxBots <= 0) {
      return {
        allowed: false,
        currentCount: 0,
        maxBots: 0,
        reason: "Gói thuê bao chưa được kích hoạt hoặc đã hết hạn",
      };
    }

    const currentCount = await prisma.zaloAccount.count({
      where: { userId },
    });

    if (currentCount >= maxBots) {
      return {
        allowed: false,
        currentCount,
        maxBots,
        reason: `Bạn đã đạt giới hạn tối đa ${maxBots} tài khoản của gói hiện tại. Vui lòng nâng cấp gói cao hơn để thêm tài khoản mới.`,
      };
    }

    return {
      allowed: true,
      currentCount,
      maxBots,
    };
  }
}

export const sePayService = new SePayService();
