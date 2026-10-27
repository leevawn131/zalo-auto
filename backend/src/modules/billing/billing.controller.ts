import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../common/middlewares/auth.middleware.js";
import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { sePayService, SUBSCRIPTION_PLANS } from "./sepay.service.js";
import { SubscriptionPlanCode, type SePayWebhookPayload } from "./billing.types.js";

const invoiceSchema = z.object({
  planCode: z.nativeEnum(SubscriptionPlanCode),
});

export function createBillingController(): Router {
  const router = Router();

  /**
   * Public Webhook endpoint for SePay
   */
  router.post("/webhook/sepay", async (req: Request, res: Response) => {
    try {
      // Optional security header check: "Authorization: Apikey <SEPAY_API_KEY>"
      const authHeader = req.headers.authorization;
      if (env.NODE_ENV === "production" && authHeader) {
        const apiKey = authHeader.replace("Apikey ", "").trim();
        if (apiKey !== env.SEPAY_API_KEY) {
          logger.warn({ authHeader }, "Unauthorized SePay webhook call");
          res.status(401).json({ error: "Invalid API key" });
          return;
        }
      }

      const payload = req.body as SePayWebhookPayload;
      const result = await sePayService.processWebhook(payload);

      if (result.success) {
        res.status(200).json({ success: true, message: result.reason || "Payment processed" });
      } else {
        res.status(400).json({ success: false, reason: result.reason });
      }
    } catch (err: unknown) {
      logger.error({ err }, "Fatal error processing SePay webhook");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/billing/plans
   */
  router.get("/plans", (_req: Request, res: Response) => {
    res.json({ plans: Object.values(SUBSCRIPTION_PLANS) });
  });

  // Protected routes below
  router.use(requireAuth);

  /**
   * GET /api/billing/subscription
   */
  router.get("/subscription", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const subscription = await prisma.subscription.findFirst({
        where: { userId },
        orderBy: { expiresAt: "desc" },
      });

      const now = new Date();
      const isActive = !!subscription && subscription.status === "ACTIVE" && subscription.expiresAt > now;
      const daysRemaining = subscription && isActive
        ? Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      res.json({
        subscription,
        isActive,
        daysRemaining,
      });
    } catch (err) {
      logger.error({ err }, "Failed to fetch user subscription");
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  /**
   * POST /api/billing/invoices
   */
  router.post("/invoices", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { planCode } = invoiceSchema.parse(req.body);

      const invoice = await sePayService.createInvoice(userId, planCode);
      res.status(201).json({ invoice });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid plan", details: err.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  /**
   * GET /api/billing/transactions
   */
  router.get("/transactions", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const transactions = await prisma.paymentTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      res.json({ transactions });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  return router;
}
