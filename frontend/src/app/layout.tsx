import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Zalo Auto-Reply SaaS - Quản trị bot Zalo tự động",
  description: "Hệ thống quản lý bot Zalo đa tài khoản, auto-reply từ khóa và sao lưu tin nhắn",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
