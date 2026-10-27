"use client";

import React, { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";
import {
  X,
  RefreshCw,
  AlertTriangle,
  History,
  User,
  Users,
  Search,
  CheckCircle,
} from "lucide-react";

interface MessageEvent {
  id: string;
  threadId: string;
  threadType: "USER" | "GROUP";
  senderUid: string;
  senderName?: string;
  content: string;
  isSelf: boolean;
  isRevoked: boolean;
  revokedAt?: string;
  createdAt: string;
}

interface MessageLogsModalProps {
  isOpen: boolean;
  accountId: string | null;
  accountName: string;
  onClose: () => void;
}

export function MessageLogsModal({
  isOpen,
  accountId,
  accountName,
  onClose,
}: MessageLogsModalProps) {
  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokedOnly, setRevokedOnly] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!isOpen || !accountId) return;
    loadMessages();
  }, [isOpen, accountId, revokedOnly]);

  const loadMessages = async () => {
    setIsLoading(true);
    try {
      const url = `/api/zalo/accounts/${accountId}/messages?limit=50&revokedOnly=${revokedOnly}`;
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">Lịch sử tin nhắn & Tin đã thu hồi</h3>
              <p className="text-xs text-slate-500">Tài khoản: {accountName} ({total} tin nhắn)</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadMessages}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Làm mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setRevokedOnly(false)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                !revokedOnly
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Tất cả tin nhắn
            </button>
            <button
              onClick={() => setRevokedOnly(true)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                revokedOnly
                  ? "bg-rose-600 text-white"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Chỉ tin nhắn đã gỡ / thu hồi
            </button>
          </div>
        </div>

        {/* Message list */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3 bg-slate-50/50">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-2" />
              <p className="text-xs text-slate-400">Đang tải lịch sử tin nhắn...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
              Không tìm thấy tin nhắn nào.
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-2xl border shadow-sm transition-all ${
                  msg.isRevoked
                    ? "bg-rose-50/70 border-rose-200"
                    : msg.isSelf
                    ? "bg-blue-50/60 border-blue-100 ml-8"
                    : "bg-white border-slate-200 mr-8"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-xs text-slate-800">
                      {msg.senderName || msg.senderUid}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    {msg.threadType === "GROUP" ? (
                      <span className="inline-flex items-center text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                        <Users className="w-2.5 h-2.5 mr-0.5" /> Nhóm
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        <User className="w-2.5 h-2.5 mr-0.5" /> Cá nhân
                      </span>
                    )}
                  </div>

                  {msg.isRevoked && (
                    <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      <span>ĐÃ THU HỒI</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">
                  {msg.content}
                </p>

                {msg.isRevoked && msg.revokedAt && (
                  <p className="text-[10px] text-rose-500 mt-1.5 font-medium italic">
                    Người gửi đã bấm thu hồi lúc: {new Date(msg.revokedAt).toLocaleString("vi-VN")}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
