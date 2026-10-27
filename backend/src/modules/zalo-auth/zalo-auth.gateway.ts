import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { authService, ZaloAuthService } from "./zalo-auth.service.js";
import { sessionRepository, ZaloSessionRepository } from "./zalo-session.repository.js";
import { sePayService, SePayService } from "../billing/sepay.service.js";
import type { QREventData } from "./zalo-auth.types.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export class ZaloAuthGateway {
  constructor(
    private io: Server,
    private service: ZaloAuthService = authService,
    private repository: ZaloSessionRepository = sessionRepository
  ) {}

  public init(): void {
    // Middleware for Socket.io JWT authentication
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
        socket.userId = decoded.userId;
        next();
      } catch (err) {
        logger.warn({ err }, "Socket authentication failed");
        next(new Error("Invalid or expired token"));
      }
    });

    this.io.on("connection", (socket: AuthenticatedSocket) => {
      const userId = socket.userId;
      if (!userId) {
        socket.disconnect();
        return;
      }

      // Join user tenant private room
      const userRoom = `user:${userId}`;
      void socket.join(userRoom);
      logger.info({ userId, socketId: socket.id }, "User connected to ZaloAuthGateway");

      // Handle request to start QR login
      socket.on("request_qr_login", async () => {
        try {
          const isSubActive = await sePayService.isUserSubscriptionActive(userId);
          if (!isSubActive) {
            socket.emit("subscription_required", {
              message: "Gói thuê bao chưa được kích hoạt hoặc đã hết hạn. Vui lòng thanh toán để tiếp tục.",
            });
            socket.emit("qr_error", {
              message: "Gói thuê bao chưa được kích hoạt hoặc đã hết hạn. Vui lòng gia hạn để tiếp tục.",
            });
            return;
          }

          // Check max bots limit
          const limitCheck = await sePayService.canUserAddAccount(userId);
          if (!limitCheck.allowed) {
            socket.emit("subscription_required", {
              message: limitCheck.reason,
            });
            socket.emit("qr_error", {
              message: limitCheck.reason,
            });
            return;
          }

          logger.info({ userId }, "Initiating QR login via gateway");

          const { sessionId } = await this.service.startQRLogin(userId, (event: QREventData) => {
            socket.emit("qr_status_update", event);
          });

          socket.emit("qr_session_started", { sessionId });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          socket.emit("qr_error", { message: msg });
        }
      });

      // Handle request to reconnect an account
      socket.on("request_reconnect", async (data: { accountId: string }) => {
        try {
          const isSubActive = await sePayService.isUserSubscriptionActive(userId);
          if (!isSubActive) {
            socket.emit("subscription_required", {
              message: "Gói thuê bao chưa được kích hoạt hoặc đã hết hạn. Vui lòng thanh toán để tiếp tục.",
            });
            socket.emit("reconnect_result", {
              accountId: data.accountId,
              success: false,
              error: "Gói thuê bao chưa được kích hoạt hoặc đã hết hạn.",
            });
            return;
          }

          const success = await this.service.restoreConnection(data.accountId, userId);
          socket.emit("reconnect_result", { accountId: data.accountId, success });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          socket.emit("reconnect_result", { accountId: data.accountId, success: false, error: msg });
        }
      });

      socket.on("disconnect", () => {
        logger.info({ userId, socketId: socket.id }, "User disconnected from ZaloAuthGateway");
      });
    });
  }

  /**
   * Broadcast status change to user tenant room
   */
  public notifyUserAccountStatus(userId: string, accountId: string, status: string, details?: unknown): void {
    this.io.to(`user:${userId}`).emit("account_status_changed", {
      accountId,
      status,
      details,
    });
  }
}
