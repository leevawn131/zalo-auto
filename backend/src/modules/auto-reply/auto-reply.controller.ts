import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../common/middlewares/auth.middleware.js";
import { prisma } from "../../config/database.js";
import { messageLogger } from "./message-logger.service.js";
import { TenantAccessDeniedError } from "../zalo-auth/zalo-auth.errors.js";

const updateConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  rateLimitPerMinute: z.number().int().min(1).max(300).optional(),
  delayMinMs: z.number().int().min(0).max(10000).optional(),
  delayMaxMs: z.number().int().min(0).max(30000).optional(),
  replySelf: z.boolean().optional(),
  replyInGroup: z.boolean().optional(),
  replyInPrivate: z.boolean().optional(),
});

const createRuleSchema = z.object({
  keyword: z.string().min(1),
  matchType: z.enum(["EXACT", "CONTAINS", "REGEX"]).default("CONTAINS"),
  replyMessage: z.string().min(1),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().default(0),
});

export function createAutoReplyController(): Router {
  const router = Router();
  router.use(requireAuth);

  /**
   * Helper to verify tenant ownership of an account
   */
  async function assertAccountOwnership(accountId: string, userId: string) {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) return null;
    if (account.userId !== userId) {
      throw new TenantAccessDeniedError(userId, accountId);
    }
    return account;
  }

  /**
   * GET /api/zalo/accounts/:id/bot-config
   */
  router.get("/accounts/:id/bot-config", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;
      const account = await assertAccountOwnership(accountId, userId);
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      let config = await prisma.botConfiguration.findUnique({
        where: { accountId },
        include: {
          rules: {
            orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          },
        },
      });

      if (!config) {
        config = await prisma.botConfiguration.create({
          data: { accountId },
          include: { rules: true },
        });
      }

      res.json({ config });
    } catch (err) {
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to fetch bot configuration" });
    }
  });

  /**
   * PUT /api/zalo/accounts/:id/bot-config
   */
  router.put("/accounts/:id/bot-config", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;
      const account = await assertAccountOwnership(accountId, userId);
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const validated = updateConfigSchema.parse(req.body);

      const config = await prisma.botConfiguration.upsert({
        where: { accountId },
        create: {
          accountId,
          ...validated,
        },
        update: validated,
        include: { rules: true },
      });

      res.json({ config });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to update bot configuration" });
    }
  });

  /**
   * POST /api/zalo/accounts/:id/rules
   */
  router.post("/accounts/:id/rules", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;
      const account = await assertAccountOwnership(accountId, userId);
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const validated = createRuleSchema.parse(req.body);

      // Ensure botConfig exists
      const botConfig = await prisma.botConfiguration.upsert({
        where: { accountId },
        create: { accountId },
        update: {},
      });

      const rule = await prisma.autoReplyRule.create({
        data: {
          botConfigId: botConfig.id,
          keyword: validated.keyword,
          matchType: validated.matchType,
          replyMessage: validated.replyMessage,
          isEnabled: validated.isEnabled,
          priority: validated.priority,
        },
      });

      res.status(201).json({ rule });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to create rule" });
    }
  });

  /**
   * PUT /api/zalo/accounts/:id/rules/:ruleId
   */
  router.put("/accounts/:id/rules/:ruleId", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { id: accountId, ruleId } = req.params;
      const account = await assertAccountOwnership(accountId, userId);
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const validated = createRuleSchema.partial().parse(req.body);

      const rule = await prisma.autoReplyRule.update({
        where: { id: ruleId },
        data: validated,
      });

      res.json({ rule });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: err.errors });
        return;
      }
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to update rule" });
    }
  });

  /**
   * DELETE /api/zalo/accounts/:id/rules/:ruleId
   */
  router.delete("/accounts/:id/rules/:ruleId", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { id: accountId, ruleId } = req.params;
      const account = await assertAccountOwnership(accountId, userId);
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      await prisma.autoReplyRule.delete({
        where: { id: ruleId },
      });

      res.json({ success: true });
    } catch (err) {
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to delete rule" });
    }
  });

  /**
   * GET /api/zalo/accounts/:id/messages (Anti-revoke audit log & history)
   */
  router.get("/accounts/:id/messages", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const revokedOnly = req.query.revokedOnly === "true";
      const threadId = req.query.threadId as string | undefined;

      const result = await messageLogger.getMessageLogs(accountId, userId, {
        page,
        limit,
        revokedOnly,
        threadId,
      });

      if (!result) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      res.json(result);
    } catch (err) {
      if (err instanceof TenantAccessDeniedError) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      res.status(500).json({ error: "Failed to fetch message logs" });
    }
  });

  return router;
}
