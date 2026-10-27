import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { sePayService } from "../../modules/billing/sepay.service.js";

/**
 * Middleware ensuring the tenant user has an active, unexpired paid subscription.
 * If expired or un-upgraded, blocks access with 402 Payment Required.
 */
export async function requireActiveSubscription(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const isActive = await sePayService.isUserSubscriptionActive(userId);
  if (!isActive) {
    res.status(402).json({
      error: "SUBSCRIPTION_REQUIRED",
      message:
        "Tài khoản chưa nâng cấp gói hoặc gói thuê bao đã hết hạn. Vui lòng thanh toán để tiếp tục sử dụng.",
    });
    return;
  }

  next();
}
