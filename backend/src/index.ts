import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { ZaloAuthGateway } from "./modules/zalo-auth/zalo-auth.gateway.js";
import { prisma } from "./config/database.js";

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Initialize Socket.io Zalo Auth Gateway
  const zaloGateway = new ZaloAuthGateway(io);
  zaloGateway.init();

  server.listen(env.PORT, () => {
    logger.info(`🚀 Zalo Auto-Reply Backend running on http://localhost:${env.PORT}`);
    logger.info(`🔌 Socket.IO Gateway ready for real-time QR streaming`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info("Database disconnected. Server stopped.");
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
