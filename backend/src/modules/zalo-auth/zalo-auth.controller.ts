import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../common/middlewares/auth.middleware.js";
import { sessionRepository, ZaloSessionRepository } from "./zalo-session.repository.js";
import { authService, ZaloAuthService } from "./zalo-auth.service.js";
import { logger } from "../../config/logger.js";
import { TenantAccessDeniedError, ZaloSessionNotFoundError } from "./zalo-auth.errors.js";

export function createZaloAuthController(
  repository: ZaloSessionRepository = sessionRepository,
  service: ZaloAuthService = authService
): Router {
  const router = Router();

  // All endpoints require SaaS authentication
  router.use(requireAuth);

  /**
   * List all Zalo accounts connected by the authenticated user
   */
  router.get("/accounts", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accounts = await repository.listUserAccounts(userId);
      res.json({ accounts });
    } catch (err: unknown) {
      logger.error({ err }, "Failed to fetch Zalo accounts");
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  /**
   * Get single account details (never exposing encrypted session/cookies)
   */
  router.get("/accounts/:id", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;
      const account = await repository.getAccountByIdAndUser(accountId, userId);

      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      // Safe representation
      const safeAccount = {
        id: account.id,
        zaloId: account.zaloId,
        displayName: account.displayName,
        avatar: account.avatar,
        status: account.status,
        lastSeenAt: account.lastSeenAt,
        errorReason: account.errorReason,
        createdAt: account.createdAt,
      };

      res.json({ account: safeAccount });
    } catch (err: unknown) {
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to get account" });
    }
  });

  /**
   * Start a QR code login flow
   */
  router.post("/accounts/qr/start", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const result = await service.startQRLogin(userId);
      res.json({ success: true, sessionId: result.sessionId });
    } catch (err: unknown) {
      logger.error({ err }, "Failed to initiate QR login");
      res.status(500).json({ error: "Failed to start QR login" });
    }
  });

  /**
   * Reconnect an existing account using saved encrypted session
   */
  router.post("/accounts/:id/reconnect", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;

      const restored = await service.restoreConnection(accountId, userId);
      res.json({ success: restored });
    } catch (err: unknown) {
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      if (err instanceof ZaloSessionNotFoundError) {
        res.status(404).json({ error: "Session not found or invalid" });
        return;
      }
      res.status(500).json({ error: "Failed to reconnect account" });
    }
  });

  /**
   * Disconnect and stop bot for an account
   */
  router.post("/accounts/:id/disconnect", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;

      await service.disconnectAccount(accountId, userId);
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to disconnect account" });
    }
  });

  /**
   * Delete account and purge session data
   */
  router.delete("/accounts/:id", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;

      await service.disconnectAccount(accountId, userId);
      await repository.deleteAccount(accountId, userId);

      res.json({ success: true, message: "Account and session deleted" });
    } catch (err: unknown) {
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      if (err instanceof ZaloSessionNotFoundError) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  return router;
}
