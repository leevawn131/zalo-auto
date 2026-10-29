import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../../config/database.js";
import { adminService } from "../admin.service.js";

describe("AdminService", () => {
  let adminUser: any;
  let testUser: any;

  beforeEach(async () => {
    // Clean up
    await prisma.paymentTransaction.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.zaloAccount.deleteMany();
    await prisma.user.deleteMany();

    adminUser = await prisma.user.create({
      data: {
        email: "admin_test@saas.com",
        passwordHash: "hash",
        name: "Admin User",
        role: "ADMIN",
      },
    });

    testUser = await prisma.user.create({
      data: {
        email: "user_test@saas.com",
        passwordHash: "hash",
        name: "Regular User",
        role: "USER",
      },
    });
  });

  it("should calculate dashboard stats correctly", async () => {
    // Add a paid transaction
    await prisma.paymentTransaction.create({
      data: {
        userId: testUser.id,
        paymentCode: "INV123456",
        amount: 100000,
        status: "PAID",
        paidAt: new Date(),
      },
    });

    const stats = await adminService.getDashboardStats();
    expect(stats.totalUsers).toBe(2);
    expect(stats.bannedUsers).toBe(0);
    expect(stats.totalRevenue).toBe(100000);
    expect(stats.paidTransactions).toBe(1);
  });

  it("should list users with pagination and search", async () => {
    const result = await adminService.getUsers({ search: "user_test", page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.users[0].email).toBe("user_test@saas.com");
    expect(result.users[0].role).toBe("USER");
  });

  it("should update user subscription", async () => {
    const updated = await adminService.updateUserSubscription(testUser.id, {
      planCode: "STANDARD_5",
      addDays: 60,
      maxBots: 5,
      status: "ACTIVE",
    });

    expect(updated.planCode).toBe("STANDARD_5");
    expect(updated.maxBots).toBe(5);
    expect(updated.status).toBe("ACTIVE");

    const userDetail = await adminService.getUserDetail(testUser.id);
    expect(userDetail.subscriptions.length).toBe(1);
    expect(userDetail.subscriptions[0].maxBots).toBe(5);
  });

  it("should ban and unban a user", async () => {
    // Ban user
    const banned = await adminService.banUser(
      testUser.id,
      { isBanned: true, reason: "Spam bot" },
      adminUser.id
    );
    expect(banned.isBanned).toBe(true);
    expect(banned.banReason).toBe("Spam bot");

    // Cannot ban self
    await expect(
      adminService.banUser(adminUser.id, { isBanned: true }, adminUser.id)
    ).rejects.toThrow("Không thể tự khóa");

    // Unban
    const unbanned = await adminService.banUser(
      testUser.id,
      { isBanned: false },
      adminUser.id
    );
    expect(unbanned.isBanned).toBe(false);
  });

  it("should update user role", async () => {
    const promoted = await adminService.updateUserRole(testUser.id, "ADMIN", adminUser.id);
    expect(promoted.role).toBe("ADMIN");

    // Cannot demote self
    await expect(
      adminService.updateUserRole(adminUser.id, "USER", adminUser.id)
    ).rejects.toThrow("Không thể tự tước quyền");
  });

  it("should manually approve a pending transaction", async () => {
    const tx = await prisma.paymentTransaction.create({
      data: {
        userId: testUser.id,
        paymentCode: "INV999888",
        amount: 100000,
        status: "PENDING",
      },
    });

    const result = await adminService.manualApproveTransaction(tx.id, adminUser.id);
    expect(result.transaction.status).toBe("PAID");
    expect(result.subscription.status).toBe("ACTIVE");

    // Check user's subscription
    const sub = await prisma.subscription.findFirst({ where: { userId: testUser.id } });
    expect(sub?.status).toBe("ACTIVE");
  });

  it("should delete user and prevent deleting self", async () => {
    await expect(adminService.deleteUser(adminUser.id, adminUser.id)).rejects.toThrow(
      "Không thể tự xóa"
    );

    const result = await adminService.deleteUser(testUser.id, adminUser.id);
    expect(result.success).toBe(true);

    const deleted = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(deleted).toBeNull();
  });
});
