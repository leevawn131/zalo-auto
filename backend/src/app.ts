import path from "node:path";
import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { createUserAuthController } from "./modules/auth/user-auth.controller.js";
import { createZaloAuthController } from "./modules/zalo-auth/zalo-auth.controller.js";
import { createAutoReplyController } from "./modules/auto-reply/auto-reply.controller.js";
import { createBillingController } from "./modules/billing/billing.controller.js";
import { createAdminController } from "./modules/admin/admin.controller.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: "*", // Can be restricted via env.CORS_ORIGIN
      credentials: true,
    })
  );

  app.use(express.json({ limit: "15mb" }));

  // Serve uploaded images statically
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Mount SaaS Auth routes
  app.use("/api/auth", createUserAuthController());

  // Mount Zalo Auth & Session routes
  app.use("/api/zalo", createZaloAuthController());

  // Mount Auto-Reply & Bot Config routes
  app.use("/api/zalo", createAutoReplyController());

  // Mount SePay & Billing routes
  app.use("/api/billing", createBillingController());

  // Mount Admin routes (Users, Transactions, Bots, Stats)
  app.use("/api/admin", createAdminController());

  return app;
}
