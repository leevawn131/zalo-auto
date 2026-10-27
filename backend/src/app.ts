import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { createUserAuthController } from "./modules/auth/user-auth.controller.js";
import { createZaloAuthController } from "./modules/zalo-auth/zalo-auth.controller.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: "*", // Can be restricted via env.CORS_ORIGIN
      credentials: true,
    })
  );

  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Mount SaaS Auth routes
  app.use("/api/auth", createUserAuthController());

  // Mount Zalo Auth & Session routes
  app.use("/api/zalo", createZaloAuthController());

  return app;
}
