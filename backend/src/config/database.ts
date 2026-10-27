import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      { level: "error", emit: "event" },
      { level: "warn", emit: "event" },
    ],
  });

prisma.$on("error" as never, (e: unknown) => {
  logger.error({ err: e }, "Prisma error occurred");
});

prisma.$on("warn" as never, (e: unknown) => {
  logger.warn({ warning: e }, "Prisma warning");
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
