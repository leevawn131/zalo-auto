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
  ArrowLeft,
  ChevronRight,
  MessageSquare,
  Bot,
  Filter,
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

interface ConversationThread {
  threadId: string;
  threadType: "USER" | "GROUP";
  name: string;
  totalMessages: number;
  botMessages: number;
  userMessages: number;
  revokedCount: number;
  lastMessage: {
    content: string;
    createdAt: string;
    isSelf: boolean;
    isRevoked: boolean;
    senderName?: string;
  } | null;
  updatedAt: string;
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
  // Threads List State
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [threadFilter, setThreadFilter] = useState<"ALL" | "USER" | "GROUP" | "REVOKED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [totalAllMessages, setTotalAllMessages] = useState(0);

  // Selected Thread Detail State
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<MessageEvent[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [revokedOnly, setRevokedOnly] = useState(false);

  useEffect(() => {
    if (!isOpen || !accountId) {
      setSelectedThread(null);
      setSearchQuery("");
      setThreadFilter("ALL");
      return;
    }
    loadThreads();
  }, [isOpen, accountId, threadFilter]);

  useEffect(() => {
    if (!isOpen || !accountId || !selectedThread) return;
    loadThreadMessages(selectedThread.threadId);
  }, [selectedThread, revokedOnly]);

  const loadThreads = async () => {
    setIsLoadingThreads(true);
    try {
      const typeParam =
        threadFilter === "USER" ? "?type=USER" : threadFilter === "GROUP" ? "?type=GROUP" : "";
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/threads${typeParam}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads || []);
        setTotalAllMessages(data.totalMessages || 0);
      }
    } catch (err) {
      console.error("Failed to load conversation threads", err);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  const loadThreadMessages = async (threadId: string) => {
    setIsLoadingMessages(true);
    try {
      const url = `/api/zalo/accounts/${accountId}/messages?threadId=${encodeURIComponent(
        threadId
      )}&limit=100&revokedOnly=${revokedOnly}`;
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        setThreadMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to load thread messages", err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  if (!isOpen) return null;

  // Filter threads by search and revoked tab
  const displayedThreads = threads.filter((t) => {
    if (threadFilter === "REVOKED" && t.revokedCount === 0) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchContent = t.lastMessage?.content.toLowerCase().includes(q);
      const matchId = t.threadId.includes(q);
      return matchName || matchContent || matchId;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            {selectedThread ? (
              <button
                onClick={() => {
                  setSelectedThread(null);
                  loadThreads();
                }}
                className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-colors flex items-center space-x-1"
                title="Quay lại danh sách hội thoại"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs font-semibold hidden sm:inline">Quay lại</span>
              </button>
            ) : (
              <div className="p-2 sm:p-2.5 bg-blue-100 text-blue-600 rounded-xl flex-shrink-0">
                <History className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            )}

            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base truncate">
                {selectedThread ? (
                  <span className="flex items-center space-x-2">
                    <span className="truncate">{selectedThread.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        selectedThread.threadType === "GROUP"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {selectedThread.threadType === "GROUP" ? "Nhóm" : "Cá nhân"}
                    </span>
                  </span>
                ) : (
                  "Lịch sử tin nhắn & Hội thoại"
                )}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                {selectedThread
                  ? `${selectedThread.totalMessages} tin nhắn (gồm ${selectedThread.botMessages} tin bot) • ID: ${selectedThread.threadId}`
                  : `Tài khoản: ${accountName} • ${threads.length} hội thoại (${totalAllMessages} tin nhắn)`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
            <button
              onClick={() => {
                if (selectedThread) {
                  loadThreadMessages(selectedThread.threadId);
                } else {
                  loadThreads();
                }
              }}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Làm mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= VIEW 1: THREADS LIST ================= */}
        {!selectedThread ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search & Filter Header */}
            <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-white space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm kiếm người nhắn, nhóm hoặc nội dung..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setThreadFilter("ALL")}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all ${
                    threadFilter === "ALL"
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Tất cả ({threads.length})
                </button>
                <button
                  onClick={() => setThreadFilter("USER")}
                  className={`flex items-center space-x-1 text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all ${
                    threadFilter === "USER"
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Cá nhân ({threads.filter((t) => t.threadType === "USER").length})</span>
                </button>
                <button
                  onClick={() => setThreadFilter("GROUP")}
                  className={`flex items-center space-x-1 text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all ${
                    threadFilter === "GROUP"
                      ? "bg-purple-600 text-white shadow-sm shadow-purple-500/20"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Nhóm ({threads.filter((t) => t.threadType === "GROUP").length})</span>
                </button>
                <button
                  onClick={() => setThreadFilter("REVOKED")}
                  className={`flex items-center space-x-1 text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all ${
                    threadFilter === "REVOKED"
                      ? "bg-rose-600 text-white shadow-sm shadow-rose-500/20"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Có tin thu hồi ({threads.filter((t) => t.revokedCount > 0).length})</span>
                </button>
              </div>
            </div>

            {/* Threads List Stream */}
            <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-2.5 bg-slate-50/50">
              {isLoadingThreads ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                  <p className="text-xs text-slate-400">Đang tải danh sách hội thoại...</p>
                </div>
              ) : displayedThreads.length === 0 ? (
                <div className="text-center py-16 text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
                  <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-600">Chưa có lịch sử hội thoại nào</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Khi bot hoặc khách hàng nhắn tin trong Zalo, các đoạn chat sẽ tự động lưu và hiển thị tại đây.
                  </p>
                </div>
              ) : (
                displayedThreads.map((thread) => (
                  <div
                    key={thread.threadId}
                    onClick={() => setSelectedThread(thread)}
                    className="p-3.5 sm:p-4 bg-white hover:bg-blue-50/40 rounded-2xl border border-slate-200/80 hover:border-blue-300 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {/* Avatar */}
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-xs ${
                          thread.threadType === "GROUP"
                            ? "bg-purple-100 text-purple-700 border border-purple-200"
                            : "bg-blue-100 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {thread.threadType === "GROUP" ? (
                          <Users className="w-5 h-5 text-purple-600" />
                        ) : (
                          <User className="w-5 h-5 text-blue-600" />
                        )}
                      </div>

                      {/* Info & Snippet */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <h4 className="font-bold text-slate-800 text-sm truncate group-hover:text-blue-600 transition-colors">
                            {thread.name}
                          </h4>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                              thread.threadType === "GROUP"
                                ? "text-purple-700 bg-purple-50 border border-purple-100"
                                : "text-blue-700 bg-blue-50 border border-blue-100"
                            }`}
                          >
                            {thread.threadType === "GROUP" ? "(nhóm)" : "(cá nhân)"}
                          </span>
                        </div>

                        {/* Counts badges */}
                        <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                            {thread.totalMessages} tin nhắn mới
                          </span>
                          {thread.botMessages > 0 && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              (gồm {thread.botMessages} tin bot)
                            </span>
                          )}
                          {thread.revokedCount > 0 && (
                            <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100 flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3 text-rose-500" />
                              <span>{thread.revokedCount} tin đã thu hồi</span>
                            </span>
                          )}
                        </div>

                        {/* Last message preview */}
                        {thread.lastMessage && (
                          <p className="text-xs text-slate-400 truncate mt-1">
                            <span className="text-slate-600 font-medium">
                              {thread.lastMessage.isSelf
                                ? "Bot: "
                                : `${thread.lastMessage.senderName || "Khách"}: `}
                            </span>
                            {thread.lastMessage.content}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Time & Arrow */}
                    <div className="flex flex-col items-end space-y-1 flex-shrink-0">
                      <span className="text-[10px] text-slate-400">
                        {new Date(thread.updatedAt).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-400 flex items-center justify-center transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* ================= VIEW 2: CONVERSATION MESSAGES ================= */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Filter bar inside thread */}
            <div className="px-4 sm:px-6 py-2.5 border-b border-slate-100 bg-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setRevokedOnly(false)}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                    !revokedOnly
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Tất cả tin ({selectedThread.totalMessages})
                </button>
                <button
                  onClick={() => setRevokedOnly(true)}
                  className={`flex items-center space-x-1 text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                    revokedOnly
                      ? "bg-rose-600 text-white"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Tin đã thu hồi ({selectedThread.revokedCount})</span>
                </button>
              </div>

              <span className="text-[11px] text-slate-400 hidden sm:inline">
                {selectedThread.threadType === "GROUP" ? "Hội thoại nhóm" : "Tin nhắn cá nhân 1-1"}
              </span>
            </div>

            {/* Messages stream */}
            <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 space-y-3 bg-slate-50/50">
              {isLoadingMessages ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                  <p className="text-xs text-slate-400">Đang tải tin nhắn trong hội thoại...</p>
                </div>
              ) : threadMessages.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                  Không có tin nhắn nào trong bộ lọc này.
                </div>
              ) : (
                threadMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border shadow-xs transition-all ${
                      msg.isRevoked
                        ? "bg-rose-50/80 border-rose-200"
                        : msg.isSelf
                        ? "bg-blue-50/70 border-blue-200 ml-4 sm:ml-12"
                        : "bg-white border-slate-200 mr-4 sm:mr-12"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        {msg.isSelf ? (
                          <span className="inline-flex items-center text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            <Bot className="w-3 h-3 mr-1 text-blue-600" />
                            BOT TỰ ĐỘNG
                          </span>
                        ) : (
                          <span className="font-bold text-xs text-slate-800">
                            {msg.senderName || msg.senderUid}
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400">
                          {new Date(msg.createdAt).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>

                      {msg.isRevoked && (
                        <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>ĐÃ THU HỒI</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content}
                    </p>

                    {msg.isRevoked && msg.revokedAt && (
                      <p className="text-[10px] text-rose-500 mt-1.5 font-medium italic">
                        ⚠️ Người gửi đã bấm thu hồi tin này lúc:{" "}
                        {new Date(msg.revokedAt).toLocaleString("vi-VN")}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
