import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../../common/middlewares/auth.middleware.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export function createUserAuthController(): Router {
  const router = Router();

  router.post("/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = registerSchema.parse(req.body);

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res.status(400).json({ error: "Email already registered" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
        },
      });

      // Issue JWT
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(201).json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid registration data", details: err.errors });
        return;
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  router.post("/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      if (user.isBanned) {
        res.status(403).json({
          error: "Tài khoản của bạn đã bị tạm khóa bởi Quản trị viên.",
          reason: user.banReason || "Vi phạm điều khoản dịch vụ",
        });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid login data", details: err.errors });
        return;
      }
      res.status(500).json({ error: "Login failed" });
    }
  });

  router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, name: true, role: true, isBanned: true, banReason: true, createdAt: true },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({ user });
    } catch {
      res.status(500).json({ error: "Failed to retrieve user profile" });
    }
  });

  return router;
}
