import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../config/database.js";
import { SePayService } from "../sepay.service.js";
import { SubscriptionGuardService } from "../subscription-guard.service.js";
import { SubscriptionPlanCode, type SePayWebhookPayload } from "../billing.types.js";
import { ZaloAuthService } from "../../zalo-auth/zalo-auth.service.js";

describe("SePayService & Subscription Guard (Payments, Webhook Idempotency & Account Limits)", () => {
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

  it("should create invoice with unique payment code and VietQR URL for Gói 2 Acc (100.000đ)", async () => {
    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.STARTER_2);

    expect(invoice.transactionId).toBeDefined();
    expect(invoice.paymentCode).toMatch(/^INV[0-9A-Z]+$/);
    expect(invoice.amount).toBe(100000);
    expect(invoice.qrCodeUrl).toContain("qr.sepay.vn");
    expect(invoice.qrCodeUrl).toContain(invoice.paymentCode);
  });

  it("should process valid SePay webhook and activate STARTER_2 subscription for 30 days", async () => {
    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.STARTER_2);

    const webhookPayload: SePayWebhookPayload = {
      id: 998877,
      gateway: "Vietcombank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `CK tien mua bot ${invoice.paymentCode} cam on`,
      transferType: "in",
      amountIn: 100000,
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

    // Verify subscription created with STARTER_2 (maxBots: 2)
    const sub = await prisma.subscription.findFirst({
      where: { userId },
    });
    expect(sub?.status).toBe("ACTIVE");
    expect(sub?.planCode).toBe("STARTER_2");
    const diffDays = Math.round((sub!.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    expect(diffDays).toBe(30);
  });

  it("should activate STANDARD_5 (5 acc, 180 days) for 550.000đ and PRO_9 (9 acc, 365 days) for 1.100.000đ", async () => {
    // 1. Standard 5 acc (550,000 VND -> 180 days / 6 months)
    const inv5 = await sepayService.createInvoice(userId, SubscriptionPlanCode.STANDARD_5);
    expect(inv5.amount).toBe(550000);
    await sepayService.processWebhook({
      id: 111,
      gateway: "MBBank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `Thanh toan ${inv5.paymentCode}`,
      transferType: "in",
      amountIn: 550000,
      amountOut: 0,
      accumulated: 550000,
      referenceCode: "REF_550K",
    });

    let sub = await prisma.subscription.findFirst({ where: { userId } });
    expect(sub?.planCode).toBe("STANDARD_5");
    expect(await sepayService.getUserMaxBots(userId)).toBe(5);
    const diffDays5 = Math.round((sub!.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    expect(diffDays5).toBe(180);

    // 2. Pro 9 acc (1,100,000 VND -> 365 days / 1 year)
    const user2 = await prisma.user.create({
      data: { email: "user2@example.com", passwordHash: "dummy" },
    });
    const inv9 = await sepayService.createInvoice(user2.id, SubscriptionPlanCode.PRO_9);
    expect(inv9.amount).toBe(1100000);
    await sepayService.processWebhook({
      id: 222,
      gateway: "MBBank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `Thanh toan ${inv9.paymentCode}`,
      transferType: "in",
      amountIn: 1100000,
      amountOut: 0,
      accumulated: 1650000,
      referenceCode: "REF_1100K",
    });

    const sub9 = await prisma.subscription.findFirst({ where: { userId: user2.id } });
    expect(sub9?.planCode).toBe("PRO_9");
    expect(await sepayService.getUserMaxBots(user2.id)).toBe(9);
    const diffDays9 = Math.round((sub9!.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
    expect(diffDays9).toBe(365);
  });

  it("should enforce maxBots limit on adding accounts (STARTER_2 allows 2 accs, rejects 3rd)", async () => {
    // Grant STARTER_2 (maxBots: 2)
    await prisma.subscription.create({
      data: {
        userId,
        planCode: "STARTER_2",
        status: "ACTIVE",
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    // 0 accounts -> allowed
    let check = await sepayService.canUserAddAccount(userId);
    expect(check.allowed).toBe(true);
    expect(check.maxBots).toBe(2);

    // Add 1st account
    await prisma.zaloAccount.create({
      data: { userId, zaloId: "zalo_1", displayName: "Bot 1", status: "ONLINE" },
    });
    check = await sepayService.canUserAddAccount(userId);
    expect(check.allowed).toBe(true);

    // Add 2nd account
    await prisma.zaloAccount.create({
      data: { userId, zaloId: "zalo_2", displayName: "Bot 2", status: "ONLINE" },
    });

    // 2 accounts reached -> 3rd account must be rejected!
    check = await sepayService.canUserAddAccount(userId);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("đạt giới hạn tối đa 2 tài khoản");
  });

  it("should extend existing active subscription by adding 30 days to current expiresAt", async () => {
    // Current subscription expires in 15 days
    const currentExpiry = new Date(Date.now() + 15 * 24 * 3600 * 1000);
    await prisma.subscription.create({
      data: {
        userId,
        planCode: "STARTER_2",
        status: "ACTIVE",
        startsAt: new Date(),
        expiresAt: currentExpiry,
      },
    });

    const invoice = await sepayService.createInvoice(userId, SubscriptionPlanCode.STARTER_2);

    const webhookPayload: SePayWebhookPayload = {
      id: 998878,
      gateway: "Vietcombank",
      transactionDate: "2026-10-28 10:00:00",
      accountNumber: "9999999999",
      content: `Gia han ${invoice.paymentCode}`,
      transferType: "in",
      amountIn: 100000,
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

  it("should stop running bot when user subscription has expired (SubscriptionGuard)", async () => {
    // Create an expired subscription
    await prisma.subscription.create({
      data: {
        userId,
        planCode: "STARTER_2",
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
