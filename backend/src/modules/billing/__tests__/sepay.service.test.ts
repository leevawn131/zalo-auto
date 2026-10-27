import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../../../config/database.js";
import { SePayService } from "../sepay.service.js";
import { SubscriptionGuardService } from "../subscription-guard.service.js";
import { SubscriptionPlanCode, type SePayWebhookPayload } from "../billing.types.js";
import { ZaloAuthService } from "../../zalo-auth/zalo-auth.service.js";

describe("SePayService & Subscription Guard (Payments, Webhook Idempotency & Expiry)", () => {
  const sepayService = new SePayService();
  let userId: string;

  beforeEach(async () => {
    await prisma.paymentTransaction.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.zaloSession.deleteMany({});
    await prisma.botConfiguration.deleteMany({});
    await prisma.zaloAccount.deleteMany({});
    await prisma.user.deleteMany({});

    const user = await prisma.user.create({
      data: { email: "customer@example.com", passwordHash: "dummy" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should create invoice with unique payment code and VietQR URL", async () => {
    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.PRO_MONTHLY);

    expect(invoice.transactionId).toBeDefined();
    expect(invoice.paymentCode).toMatch(/^INV[0-9A-Z]+$/);
    expect(invoice.amount).toBe(99000);
    expect(invoice.qrCodeUrl).toContain("qr.sepay.vn");
    expect(invoice.qrCodeUrl).toContain(invoice.paymentCode);
  });

  it("should process valid SePay webhook and activate subscription for 30 days", async () => {
    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.PRO_MONTHLY);

    const webhookPayload: SePayWebhookPayload = {
      id: 998877,
      gateway: "Vietcombank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `CK tien mua bot ${invoice.paymentCode} cam on`,
      transferType: "in",
      amountIn: 99000,
      amountOut: 0,
      accumulated: 10000000,
      referenceCode: "REF_BANK_12345",
    };

    const result = await sepayService.processWebhook(webhookPayload);
    expect(result.success).toBe(true);

    // Verify transaction updated to PAID
    const tx = await prisma.paymentTransaction.findUnique({
      where: { paymentCode: invoice.paymentCode },
    });
    expect(tx?.status).toBe("PAID");
    expect(tx?.referenceCode).toBe("REF_BANK_12345");

    // Verify subscription created
    const sub = await prisma.subscription.findFirst({
      where: { userId },
    });
    expect(sub?.status).toBe("ACTIVE");
    const diffDays = Math.round((sub!.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    expect(diffDays).toBe(30);
  });

  it("should extend existing active subscription by adding 30 days to current expiresAt", async () => {
    // Current subscription expires in 15 days
    const currentExpiry = new Date(Date.now() + 15 * 24 * 3600 * 1000);
    await prisma.subscription.create({
      data: {
        userId,
        planCode: "PRO_MONTHLY",
        status: "ACTIVE",
        startsAt: new Date(),
        expiresAt: currentExpiry,
      },
    });

    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.PRO_MONTHLY);

    const webhookPayload: SePayWebhookPayload = {
      id: 998878,
      gateway: "Vietcombank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `Gia han ${invoice.paymentCode}`,
      transferType: "in",
      amountIn: 99000,
      amountOut: 0,
      accumulated: 10000000,
      referenceCode: "REF_BANK_EXTEND_99",
    };

    await sepayService.processWebhook(webhookPayload);

    const sub = await prisma.subscription.findFirst({
      where: { userId },
    });
    expect(sub?.status).toBe("ACTIVE");

    // Expiry should be approximately 15 + 30 = 45 days from now
    const diffDays = Math.round((sub!.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    expect(diffDays).toBe(45);
  });

  it("should enforce idempotency: duplicate webhook does not extend subscription multiple times", async () => {
    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.PRO_MONTHLY);

    const webhookPayload: SePayWebhookPayload = {
      id: 998879,
      gateway: "Vietcombank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `Thanh toan ${invoice.paymentCode}`,
      transferType: "in",
      amountIn: 99000,
      amountOut: 0,
      accumulated: 10000000,
      referenceCode: "REF_BANK_IDEMP_1",
    };

    // First call
    await sepayService.processWebhook(webhookPayload);

    const sub1 = await prisma.subscription.findFirst({ where: { userId } });
    const expiresAt1 = sub1!.expiresAt.getTime();

    // Second call with same payload (webhook retry)
    const result2 = await sepayService.processWebhook(webhookPayload);
    expect(result2.success).toBe(true);

    const sub2 = await prisma.subscription.findFirst({ where: { userId } });
    expect(sub2!.expiresAt.getTime()).toBe(expiresAt1); // Date not extended twice!
  });

  it("should reject and mark transaction FAILED if transfer amount is insufficient", async () => {
    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.PRO_MONTHLY);

    const webhookPayload: SePayWebhookPayload = {
      id: 998880,
      gateway: "Vietcombank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `Thieu tien ${invoice.paymentCode}`,
      transferType: "in",
      amountIn: 50000, // Expected 99,000 VND
      amountOut: 0,
      accumulated: 10000000,
      referenceCode: "REF_BANK_UNDERPAID",
    };

    const result = await sepayService.processWebhook(webhookPayload);
    expect(result.success).toBe(false);

    const tx = await prisma.paymentTransaction.findUnique({
      where: { paymentCode: invoice.paymentCode },
    });
    expect(tx?.status).toBe("FAILED");

    const sub = await prisma.subscription.findFirst({ where: { userId } });
    expect(sub).toBeNull();
  });

  it("should stop running bot when user subscription has expired (SubscriptionGuard)", async () => {
    // Create an expired subscription
    await prisma.subscription.create({
      data: {
        userId,
        planCode: "PRO_MONTHLY",
        status: "ACTIVE",
        startsAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
        expiresAt: new Date(Date.now() - 5 * 24 * 3600 * 1000), // Expired 5 days ago
      },
    });

    // Create an account currently marked ONLINE
    const account = await prisma.zaloAccount.create({
      data: {
        userId,
        zaloId: "zalo_expired_user",
        displayName: "Expired User Bot",
        status: "ONLINE",
      },
    });

    const mockZaloAuth = {
      disconnectAccount: vi.fn().mockResolvedValue(undefined),
    };

    const guard = new SubscriptionGuardService(mockZaloAuth as unknown as ZaloAuthService);
    const stoppedCount = await guard.checkAndStopExpiredBots();

    expect(stoppedCount).toBe(1);
    expect(mockZaloAuth.disconnectAccount).toHaveBeenCalledWith(account.id, userId);

    const updatedAcc = await prisma.zaloAccount.findUnique({ where: { id: account.id } });
    expect(updatedAcc?.status).toBe("STOPPED");
    expect(updatedAcc?.errorReason).toContain("hết hạn");
  });
});
