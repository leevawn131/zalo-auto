import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("4000").transform((v) => parseInt(v, 10)),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16).default("zalo-saas-jwt-secret-very-secure-32chars-min"),
  SESSION_SECRET_KEY: z.string().min(32).default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SEPAY_API_KEY: z.string().default("test-sepay-api-key"),
  SEPAY_BANK_NAME: z.string().default("MBBank"),
  SEPAY_ACCOUNT_NUMBER: z.string().default("9999999999"),
  SEPAY_ACCOUNT_HOLDER: z.string().default("CONG TY CONG NGHE ZALO AUTO"),
});

export const env = envSchema.parse(process.env);
