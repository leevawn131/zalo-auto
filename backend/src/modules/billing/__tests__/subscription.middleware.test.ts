import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { Response, NextFunction } from "express";
import { prisma } from "../../../config/database.js";
import { requireActiveSubscription } from "../../../common/middlewares/subscription.middleware.js";
import type { AuthenticatedRequest } from "../../../common/middlewares/auth.middleware.js";

describe("requireActiveSubscription Middleware (Paywall Enforcement)", () => {
  let userId: string;

  beforeEach(async () => {
    await prisma.paymentTransaction.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.zaloSession.deleteMany({});
    await prisma.botConfiguration.deleteMany({});
    await prisma.zaloAccount.deleteMany({});
    await prisma.user.deleteMany({});

    const user = await prisma.user.create({
      data: { email: "unpaid_user@example.com", passwordHash: "dummy" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should block request with 402 SUBSCRIPTION_REQUIRED when user has no subscription", async () => {
    const req = { userId } as AuthenticatedRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await requireActiveSubscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "SUBSCRIPTION_REQUIRED" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should block request with 402 SUBSCRIPTION_REQUIRED when user subscription has expired", async () => {
    // Expired 2 days ago
    await prisma.subscription.create({
      data: {
        userId,
        planCode: "PRO_MONTHLY",
        status: "ACTIVE",
        startsAt: new Date(Date.now() - 32 * 24 * 3600 * 1000),
        expiresAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      },
    });

    const req = { userId } as AuthenticatedRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await requireActiveSubscription(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "SUBSCRIPTION_REQUIRED" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should allow request to proceed (call next()) when user has an active paid subscription", async () => {
    // Active for another 28 days
    await prisma.subscription.create({
      data: {
        userId,
        planCode: "PRO_MONTHLY",
        status: "ACTIVE",
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 28 * 24 * 3600 * 1000),
      },
    });

    const req = { userId } as AuthenticatedRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await requireActiveSubscription(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
