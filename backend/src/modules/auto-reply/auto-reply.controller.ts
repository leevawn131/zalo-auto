import path from "node:path";
import fsPromises from "node:fs/promises";
import crypto from "node:crypto";
import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../common/middlewares/auth.middleware.js";
import { requireActiveSubscription } from "../../common/middlewares/subscription.middleware.js";
import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
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

const baseRuleSchema = z.object({
  keyword: z.string().min(1),
  matchType: z.enum(["EXACT", "CONTAINS", "REGEX"]).default("CONTAINS"),
  replyMessage: z.string().default(""),
  replyImageUrl: z.string().optional().nullable(),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().default(0),
});

const createRuleSchema = baseRuleSchema.refine(
  (data) =>
    data.replyMessage.trim().length > 0 ||
    (data.replyImageUrl && data.replyImageUrl.trim().length > 0),
  {
    message: "Quy tắc phải có tin nhắn trả lời hoặc hình ảnh trả lời.",
  }
);

const updateRuleSchema = baseRuleSchema.partial();

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
  router.put("/accounts/:id/bot-config", requireActiveSubscription, async (req: AuthenticatedRequest, res: Response) => {
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
  router.post("/accounts/:id/rules", requireActiveSubscription, async (req: AuthenticatedRequest, res: Response) => {
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
          replyImageUrl: validated.replyImageUrl,
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
  router.put("/accounts/:id/rules/:ruleId", requireActiveSubscription, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { id: accountId, ruleId } = req.params;
      const account = await assertAccountOwnership(accountId, userId);
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const validated = updateRuleSchema.parse(req.body);

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
  router.delete("/accounts/:id/rules/:ruleId", requireActiveSubscription, async (req: AuthenticatedRequest, res: Response) => {
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
   * GET /api/zalo/accounts/:id/threads (Conversation threads grouped by user/group)
   */
  router.get("/accounts/:id/threads", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const accountId = req.params.id;
      const type = req.query.type as "ALL" | "USER" | "GROUP" | undefined;
      const search = req.query.search as string | undefined;

      const result = await messageLogger.getConversationThreads(accountId, userId, {
        type,
        search,
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
      res.status(500).json({ error: "Failed to fetch conversation threads" });
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

  /**
   * POST /api/zalo/bot/upload-image
   * Upload an image to be used in auto-reply rules
   */
  router.post("/bot/upload-image", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fileData, fileName } = req.body;
      if (!fileData || typeof fileData !== "string") {
        res.status(400).json({ error: "Vui lòng cung cấp dữ liệu hình ảnh (base64 string)" });
        return;
      }

      const match = fileData.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!match) {
        res.status(400).json({ error: "Định dạng ảnh không hợp lệ (cần định dạng data:image/...;base64,...)" });
        return;
      }

      const rawExt = match[1].toLowerCase();
      const ext = rawExt === "jpeg" ? "jpg" : rawExt;
      const buffer = Buffer.from(match[2], "base64");

      if (buffer.length > 10 * 1024 * 1024) {
        res.status(400).json({ error: "Kích thước ảnh vượt quá 10MB. Vui lòng chọn ảnh nhỏ hơn." });
        return;
      }

      const uploadDir = path.join(process.cwd(), "uploads");
      await fsPromises.mkdir(uploadDir, { recursive: true });

      const safeName = `img_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
      const filePath = path.join(uploadDir, safeName);
      await fsPromises.writeFile(filePath, buffer);

      const url = `/uploads/${safeName}`;
      res.json({ success: true, url, fileName: safeName });
    } catch (err) {
      logger.error({ err }, "Failed to upload image");
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  return router;
}
