import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "cookie",
      "cookies",
      "cookies[*].value",
      "secretKey",
      "token",
      "sessionData",
      "encryptedData",
      "credentials",
      "*.cookie",
      "*.cookies",
      "*.secretKey",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
          },
        }
      : undefined,
});
