import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../config/database.js";
import { ZaloSessionService } from "../zalo-session.service.js";
import { ZaloSessionRepository } from "../zalo-session.repository.js";
import { ZaloSessionCrypto } from "../zalo-session.crypto.js";
import { TenantAccessDeniedError, ZaloSessionNotFoundError } from "../zalo-auth.errors.js";
import type { ZaloCredentials } from "../zalo-auth.types.js";

describe("ZaloSessionService & Repository (Database & Multi-tenancy)", () => {
  const repo = new ZaloSessionRepository();
  const crypto = new ZaloSessionCrypto();
  const service = new ZaloSessionService(repo, crypto);

  let userAId: string;
  let userBId: string;

  beforeEach(async () => {
    // Clean tables for clean isolated test run
    await prisma.zaloSession.deleteMany({});
    await prisma.botConfiguration.deleteMany({});
    await prisma.zaloAccount.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed test users
    const userA = await prisma.user.create({
      data: { email: "tenant_a@example.com", passwordHash: "dummyhash" },
    });
    const userB = await prisma.user.create({
      data: { email: "tenant_b@example.com", passwordHash: "dummyhash" },
    });

    userAId = userA.id;
    userBId = userB.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const mockCredentials: ZaloCredentials = {
    imei: "imei-tenant-a-12345",
    userAgent: "Mozilla/5.0 Test",
    cookie: [{ domain: "chat.zalo.me", path: "/", name: "zpw_sek", value: "secret_cookie_tenant_a" }],
    language: "vi",
  };

  it("should securely encrypt and store credentials in the database", async () => {
    const account = await service.saveSession({
      userId: userAId,
      zaloId: "zalo_uid_1001",
      displayName: "Nguyen Van A",
      avatar: "https://avatar.zalo.me/1001.png",
      credentials: mockCredentials,
    });

    expect(account.id).toBeDefined();
    expect(account.userId).toBe(userAId);
    expect(account.displayName).toBe("Nguyen Van A");

    // Inspect the database row directly: credentials must NEVER be stored in plaintext
    const dbSession = await prisma.zaloSession.findUnique({
      where: { accountId: account.id },
    });

    expect(dbSession).toBeDefined();
    expect(dbSession?.encryptedData).toBeDefined();
    expect(dbSession?.encryptedData).not.toContain("secret_cookie_tenant_a");
    expect(dbSession?.encryptedData).not.toContain("imei-tenant-a-12345");
    expect(dbSession?.iv).toBeDefined();
    expect(dbSession?.authTag).toBeDefined();

    // Verify service can decrypt credentials correctly
    const decrypted = await service.getDecryptedCredentials(account.id, userAId);
    expect(decrypted).toEqual(mockCredentials);
  });

  it("should strictly enforce tenant boundary: user B cannot access user A's session", async () => {
    const account = await service.saveSession({
      userId: userAId,
      zaloId: "zalo_uid_1001",
      displayName: "Nguyen Van A",
      credentials: mockCredentials,
    });

    // User B attempts to access account created by User A
    await expect(service.getDecryptedCredentials(account.id, userBId)).rejects.toThrow(TenantAccessDeniedError);

    // User B attempts to get account details
    await expect(repo.getAccountByIdAndUser(account.id, userBId)).rejects.toThrow(TenantAccessDeniedError);
  });

  it("should invalidate session and set status to REAUTH_REQUIRED", async () => {
    const account = await service.saveSession({
      userId: userAId,
      zaloId: "zalo_uid_1001",
      displayName: "Nguyen Van A",
      credentials: mockCredentials,
    });

    await service.invalidateSession(account.id, "Session expired on server");

    const updatedAccount = await repo.getAccountByIdAndUser(account.id, userAId);
    expect(updatedAccount?.status).toBe("REAUTH_REQUIRED");
    expect(updatedAccount?.errorReason).toBe("Session expired on server");
    expect(updatedAccount?.session?.isValid).toBe(false);

    // Attempting to read invalid session should fail
    await expect(service.getDecryptedCredentials(account.id, userAId)).rejects.toThrow(ZaloSessionNotFoundError);
  });
});
