import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../../common/middlewares/auth.middleware.js";
import { adminService } from "./admin.service.js";

const updateSubscriptionSchema = z.object({
  planCode: z.string().optional(),
  addDays: z.number().int().optional(),
  customExpiresAt: z.string().datetime().optional(),
  maxBots: z.number().int().min(1).max(999).optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
});

const banUserSchema = z.object({
  isBanned: z.boolean(),
  reason: z.string().max(255).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(["USER", "ADMIN"]),
});

export function createAdminController(): Router {
  const router = Router();

  // Protect all admin endpoints
  router.use(requireAuth);
  router.use(requireAdmin);

  /**
   * GET /api/admin/stats
   */
  router.get("/stats", async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await adminService.getDashboardStats();
      res.json(stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Lỗi tải thống kê hệ thống", details: msg });
    }
  });

  /**
   * GET /api/admin/users
   */
  router.get("/users", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await adminService.getUsers({ search, status, page, limit });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Lỗi tải danh sách người dùng", details: msg });
    }
  });

  /**
   * GET /api/admin/users/:id
   */
  router.get("/users/:id", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await adminService.getUserDetail(req.params.id);
      res.json({ user });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(404).json({ error: msg });
    }
  });

  /**
   * PUT /api/admin/users/:id/subscription
   */
  router.put("/users/:id/subscription", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = updateSubscriptionSchema.parse(req.body);
      const subscription = await adminService.updateUserSubscription(req.params.id, body);
      res.json({ success: true, message: "Cập nhật gói thuê bao thành công", subscription });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Dữ liệu không hợp lệ", details: err.errors });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  /**
   * PUT /api/admin/users/:id/ban
   */
  router.put("/users/:id/ban", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = banUserSchema.parse(req.body);
      const user = await adminService.banUser(req.params.id, body, req.userId!);
      res.json({
        success: true,
        message: body.isBanned ? "Đã khóa người dùng thành công" : "Đã mở khóa người dùng",
        user,
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Dữ liệu không hợp lệ", details: err.errors });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  /**
   * PUT /api/admin/users/:id/role
   */
  router.put("/users/:id/role", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = updateRoleSchema.parse(req.body);
      const user = await adminService.updateUserRole(req.params.id, body.role, req.userId!);
      res.json({ success: true, message: "Cập nhật quyền thành công", user });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Dữ liệu không hợp lệ", details: err.errors });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  /**
   * DELETE /api/admin/users/:id
   */
  router.delete("/users/:id", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await adminService.deleteUser(req.params.id, req.userId!);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  /**
   * GET /api/admin/transactions
   */
  router.get("/transactions", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await adminService.getTransactions({ search, status, page, limit });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Lỗi tải lịch sử giao dịch", details: msg });
    }
  });

  /**
   * POST /api/admin/transactions/:id/approve
   */
  router.post("/transactions/:id/approve", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await adminService.manualApproveTransaction(req.params.id, req.userId!);
      res.json({ success: true, message: "Duyệt giao dịch thành công", ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  /**
   * GET /api/admin/zalo-accounts
   */
  router.get("/zalo-accounts", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await adminService.getAllZaloAccounts({ search, status, page, limit });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Lỗi tải danh sách bot Zalo", details: msg });
    }
  });

  /**
   * POST /api/admin/zalo-accounts/:id/disconnect
   */
  router.post("/zalo-accounts/:id/disconnect", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await adminService.forceDisconnectBot(req.params.id, req.userId!);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  return router;
}
