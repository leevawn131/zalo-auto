import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { prisma } from "../../config/database.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid authorization token" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
      email?: string;
      role?: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isBanned: true, banReason: true },
    });

    if (!user) {
      res.status(401).json({ error: "Unauthorized: User no longer exists" });
      return;
    }

    if (user.isBanned) {
      res.status(403).json({
        error: "Tài khoản của bạn đã bị tạm khóa bởi Quản trị viên.",
        reason: user.banReason || "Vi phạm điều khoản dịch vụ",
      });
      return;
    }

    req.userId = user.id;
    req.userEmail = user.email;
    req.userRole = user.role;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized: Token is expired or invalid" });
    return;
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized: Missing authentication" });
    return;
  }

  if (req.userRole !== "ADMIN") {
    res.status(403).json({ error: "Forbidden: Quyền truy cập dành riêng cho Quản trị viên (Admin)" });
    return;
  }

  next();
}
