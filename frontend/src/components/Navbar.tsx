"use client";

import React from "react";
import { Bot, User, LogOut, Shield } from "lucide-react";

interface NavbarProps {
  user: { email: string; name?: string } | null;
  onLogout: () => void;
}

export function Navbar({ user, onLogout }: NavbarProps) {
  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/80">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-base leading-tight">
              Zalo Auto-Reply <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-semibold">SaaS</span>
            </h1>
            <p className="text-[11px] text-slate-400">Hệ thống phản hồi tự động đa tài khoản</p>
          </div>
        </div>

        {user ? (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-100/80 px-3 py-1.5 rounded-full">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-medium">{user.name || user.email}</span>
            </div>
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-emerald-500" />
            <span>Mã hóa AES-256</span>
          </div>
        )}
      </div>
    </header>
  );
}
