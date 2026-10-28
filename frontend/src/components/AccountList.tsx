"use client";

import React from "react";
import {
  Play,
  Square,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Bot,
  CheckCircle,
  Clock,
} from "lucide-react";

export interface ZaloAccountItem {
  id: string;
  zaloId: string;
  displayName: string;
  avatar?: string;
  status:
    | "DISCONNECTED"
    | "QR_PENDING"
    | "AUTHENTICATING"
    | "AUTHENTICATED"
    | "CONNECTING"
    | "ONLINE"
    | "RECONNECTING"
    | "REAUTH_REQUIRED"
    | "ERROR"
    | "STOPPED";
  lastSeenAt?: string;
  errorReason?: string;
  createdAt: string;
  botConfig?: {
    isEnabled: boolean;
  };
}

interface AccountListProps {
  accounts: ZaloAccountItem[];
  subscriptionActive?: boolean;
  onReconnect: (accountId: string) => void;
  onDisconnect: (accountId: string) => void;
  onDelete: (accountId: string) => void;
  onReauth: () => void;
  onOpenConfig: (accountId: string, accountName: string) => void;
  onOpenLogs: (accountId: string, accountName: string) => void;
  onRequireSubscription?: () => void;
}

export function AccountList({
  accounts,
  subscriptionActive = false,
  onReconnect,
  onDisconnect,
  onDelete,
  onReauth,
  onOpenConfig,
  onOpenLogs,
  onRequireSubscription,
}: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Bot className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">Chưa có tài khoản Zalo nào</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6">
          Bấm vào nút bên dưới để quét mã QR và thêm tài khoản Zalo của bạn vào hệ thống tự động trả lời.
        </p>
        <button
          onClick={onReauth}
          className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-6 py-3 rounded-2xl font-semibold shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
        >
          <Bot className="w-4 h-4" />
          <span>Bấm vào đây để quét mã kết nối Zalo ngay</span>
        </button>
      </div>
    );
  }

  const renderStatusBadge = (account: ZaloAccountItem) => {
    switch (account.status) {
      case "ONLINE":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Trực tuyến</span>
          </span>
        );
      case "CONNECTING":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
            <span>Đang kết nối</span>
          </span>
        );
      case "RECONNECTING":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            <span>Đang thử lại...</span>
          </span>
        );
      case "REAUTH_REQUIRED":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            <span>Cần quét lại QR</span>
          </span>
        );
      case "STOPPED":
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Square className="w-2.5 h-2.5 text-slate-400" />
            <span>Đã dừng</span>
          </span>
        );
      case "ERROR":
      default:
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="w-3 h-3 text-red-500" />
            <span>Lỗi</span>
          </span>
        );
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                {account.avatar ? (
                  <img
                    src={account.avatar}
                    alt={account.displayName}
                    className="w-12 h-12 rounded-xl object-cover border border-slate-100 shadow-sm"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                    {account.displayName[0] || "Z"}
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">{account.displayName}</h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">UID: {account.zaloId}</p>
                </div>
              </div>

              {renderStatusBadge(account)}
            </div>

            {account.errorReason && (
              <div className="mt-3 text-xs bg-rose-50 text-rose-700 p-2.5 rounded-xl border border-rose-100 flex items-start space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">{account.errorReason}</span>
              </div>
            )}

            {/* Quick action badges */}
            <div className="mt-4 flex items-center space-x-2">
              <button
                onClick={() => {
                  if (!subscriptionActive) {
                    onRequireSubscription?.();
                    return;
                  }
                  onOpenConfig(account.id, account.displayName);
                }}
                className="flex items-center space-x-1 text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-blue-600" />
                <span>Từ khóa & Cài đặt</span>
              </button>

              <button
                onClick={() => {
                  if (!subscriptionActive) {
                    onRequireSubscription?.();
                    return;
                  }
                  onOpenLogs(account.id, account.displayName);
                }}
                className="flex items-center space-x-1 text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Lịch sử tin nhắn</span>
              </button>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {account.status === "REAUTH_REQUIRED" ? (
                <button
                  onClick={() => {
                    if (!subscriptionActive) {
                      onRequireSubscription?.();
                      return;
                    }
                    onReauth();
                  }}
                  className="flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Quét lại QR</span>
                </button>
              ) : account.status === "ONLINE" ? (
                <button
                  onClick={() => onDisconnect(account.id)}
                  className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <Square className="w-3 h-3" />
                  <span>Tạm dừng</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!subscriptionActive) {
                      onRequireSubscription?.();
                      return;
                    }
                    onReconnect(account.id);
                  }}
                  className="flex items-center space-x-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <Play className="w-3 h-3 text-blue-600" />
                  <span>Kết nối lại</span>
                </button>
              )}
            </div>

            <button
              onClick={() => onDelete(account.id)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Xóa tài khoản"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
