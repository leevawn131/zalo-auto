"use client";

import React from "react";
import Link from "next/link";
import { Bot, User, LogOut, Shield, LayoutDashboard } from "lucide-react";

interface NavbarProps {
  user: { email: string; name?: string; role?: string } | null;
  onLogout: () => void;
  isAdminPage?: boolean;
}

export function Navbar({ user, onLogout, isAdminPage = false }: NavbarProps) {
  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <Link href="/" className="flex items-center space-x-2 sm:space-x-3 group min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                Zalo Auto-Reply <span className="text-[10px] sm:text-xs text-blue-600 bg-blue-50 px-1.5 sm:px-2 py-0.5 rounded-full font-semibold">SaaS</span>
              </h1>
              <p className="hidden sm:block text-[11px] text-slate-400">Hệ thống phản hồi tự động đa tài khoản</p>
            </div>
          </Link>
        </div>

        {user ? (
          <div className="flex items-center space-x-1.5 sm:space-x-3 flex-shrink-0">
            {user.role === "ADMIN" && (
              isAdminPage ? (
                <Link
                  href="/"
                  className="flex items-center space-x-1 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border border-slate-200 shadow-sm"
                  title="Quay lại giao diện bot của bạn"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <span className="hidden sm:inline">Về Dashboard Bot</span>
                  <span className="sm:hidden">Bot</span>
                </Link>
              ) : (
                <Link
                  href="/admin"
                  className="flex items-center space-x-1 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white transition-all shadow-md shadow-amber-500/20 animate-pulse"
                  title="Mở bảng quản trị hệ thống"
                >
                  <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Quản trị Admin</span>
                  <span className="sm:hidden">Admin</span>
                </Link>
              )
            )}

            <div className="flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-100/80 px-2 sm:px-3 py-1.5 rounded-full max-w-[120px] sm:max-w-none">
              <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span className="font-medium max-w-[65px] sm:max-w-[120px] truncate">{user.name || user.email}</span>
              {user.role === "ADMIN" && (
                <span className="text-[9px] sm:text-[10px] font-bold text-amber-600 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 flex-shrink-0">ADMIN</span>
              )}
            </div>
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-slate-600 p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="hidden xs:inline">Mã hóa AES-256</span>
          </div>
        )}
      </div>
    </header>
  );
}
