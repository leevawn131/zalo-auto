"use client";

import React, { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { QRLoginModal } from "@/components/QRLoginModal";
import { AccountList, type ZaloAccountItem } from "@/components/AccountList";
import { BotConfigModal } from "@/components/BotConfigModal";
import { MessageLogsModal } from "@/components/MessageLogsModal";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { fetchWithAuth, getStoredToken, setStoredToken, removeStoredToken, API_URL } from "@/lib/api";
import { connectSocket } from "@/lib/socket";
import {
  Plus,
  Bot,
  Zap,
  Lock,
  Mail,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null);
  const [accounts, setAccounts] = useState<ZaloAccountItem[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [configModalAccount, setConfigModalAccount] = useState<{ id: string; name: string } | null>(
    null
  );
  const [logsModalAccount, setLogsModalAccount] = useState<{ id: string; name: string } | null>(
    null
  );

  // Auth form state
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const existingToken = getStoredToken();
    if (existingToken) {
      setToken(existingToken);
      loadUserProfile();
      loadAccounts();
      loadSubscription();
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleSubRequired = () => {
      setIsSubModalOpen(true);
    };

    window.addEventListener("subscription_required", handleSubRequired);
    return () => {
      window.removeEventListener("subscription_required", handleSubRequired);
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = connectSocket();

    socket.on("account_status_changed", (data: { accountId: string; status: any }) => {
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === data.accountId ? { ...acc, status: data.status } : acc))
      );
    });

    socket.on("subscription_required", () => {
      setIsSubModalOpen(true);
    });

    return () => {
      socket.off("account_status_changed");
      socket.off("subscription_required");
    };
  }, [token]);

  const loadUserProfile = async () => {
    try {
      const res = await fetchWithAuth("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        handleLogout();
      }
    } catch {
      handleLogout();
    } finally {
      setIsLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const res = await fetchWithAuth("/api/zalo/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  };

  const loadSubscription = async () => {
    try {
      const res = await fetchWithAuth("/api/billing/subscription");
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = authMode === "login" ? { email, password } : { email, password, name };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Xác thực không thành công");
      }

      setStoredToken(data.token);
      setToken(data.token);
      setUser(data.user);
      loadAccounts();
      loadSubscription();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    removeStoredToken();
    setToken(null);
    setUser(null);
    setAccounts([]);
    setSubscription(null);
  };

  const handleReconnect = async (accountId: string) => {
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/reconnect`, {
        method: "POST",
      });
      if (res.ok) {
        loadAccounts();
      }
    } catch (err) {
      console.error("Failed to reconnect", err);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/disconnect`, {
        method: "POST",
      });
      if (res.ok) {
        loadAccounts();
      }
    } catch (err) {
      console.error("Failed to disconnect", err);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa tài khoản này và tất cả cấu hình liên quan?")) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadAccounts();
      }
    } catch (err) {
      console.error("Failed to delete account", err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar user={user} onLogout={handleLogout} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {!token ? (
          /* Authentication Screen */
          <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/30">
                <Bot className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">
                {authMode === "login" ? "Đăng nhập SaaS" : "Tạo tài khoản mới"}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Quản lý hệ thống Auto-Reply Zalo đa tài khoản
              </p>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center space-x-2 border border-red-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === "register" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Họ tên</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Văn A"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="ban@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mật khẩu</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl text-sm transition-colors shadow-md shadow-blue-500/20 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                ) : authMode === "login" ? (
                  "Đăng nhập"
                ) : (
                  "Đăng ký tài khoản"
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-slate-500">
              {authMode === "login" ? (
                <p>
                  Chưa có tài khoản?{" "}
                  <button
                    onClick={() => {
                      setAuthMode("register");
                      setAuthError(null);
                    }}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Đăng ký ngay
                  </button>
                </p>
              ) : (
                <p>
                  Đã có tài khoản?{" "}
                  <button
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError(null);
                    }}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Đăng nhập
                  </button>
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Dashboard Screen */
          <div className="space-y-6">
            {/* Warning Banner if Subscription is NOT active */}
            {!subscription?.isActive ? (
              <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-orange-500/10 border-2 border-amber-400 p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-amber-500 text-white rounded-2xl flex-shrink-0 shadow-md shadow-amber-500/30">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                      Tài khoản chưa kích hoạt hoặc đã hết hạn gói thuê bao!
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Tất cả tính năng kết nối bot, trả lời tự động và tùy chỉnh từ khóa đang tạm ngưng. Vui lòng thanh toán để mở khóa.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsSubModalOpen(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95 flex-shrink-0"
                >
                  Nâng cấp / Gia hạn ngay &rarr;
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-300 p-4 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-emerald-600 text-white rounded-2xl flex-shrink-0 shadow-md shadow-emerald-500/20">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">
                      Gói thuê bao đang hoạt động: Còn {subscription.daysRemaining} ngày sử dụng
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Hết hạn: {new Date(subscription.subscription?.expiresAt).toLocaleDateString("vi-VN")} • Tối đa {subscription.maxBots} tài khoản Zalo.
                    </p>
                  </div>
                </div>

                {accounts.length === 0 && (
                  <button
                    onClick={() => setIsQrModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 flex-shrink-0 flex items-center space-x-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Kết nối Zalo ngay</span>
                  </button>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Tài khoản Zalo kết nối</h2>
                <div className="flex items-center space-x-3 mt-1 text-xs text-slate-500">
                  <span>
                    Đang kết nối: <strong className="text-slate-800">{accounts.length}</strong> /{" "}
                    <strong className="text-blue-600">{subscription?.maxBots || 0}</strong> tài khoản cho phép
                  </span>
                  <span>•</span>
                  <span className="text-emerald-600 font-semibold">
                    {accounts.filter((a) => a.status === "ONLINE").length} đang trực tuyến
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  onClick={() => setIsSubModalOpen(true)}
                  className={`flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    subscription?.isActive
                      ? "bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-900 border border-emerald-200"
                      : "bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-amber-500/20 animate-bounce"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {subscription?.isActive
                      ? `Gói thuê bao (${subscription.daysRemaining} ngày - Tối đa ${subscription.maxBots} acc)`
                      : "Thanh toán gói để sử dụng"}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (!subscription?.isActive) {
                      setIsSubModalOpen(true);
                      return;
                    }
                    if (accounts.length >= (subscription?.maxBots || 0)) {
                      alert(`Bạn đã đạt giới hạn tối đa ${subscription?.maxBots} tài khoản của gói hiện tại. Vui lòng nâng cấp gói cao hơn để thêm tài khoản mới!`);
                      setIsSubModalOpen(true);
                      return;
                    }
                    setIsQrModalOpen(true);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl text-xs font-semibold transition-all shadow-md shadow-blue-500/20 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Kết nối Zalo mới</span>
                </button>
              </div>
            </div>

            {/* Account List */}
            <AccountList
              accounts={accounts}
              subscriptionActive={subscription?.isActive}
              onReconnect={handleReconnect}
              onDisconnect={handleDisconnect}
              onDelete={handleDelete}
              onReauth={() => {
                if (!subscription?.isActive) {
                  setIsSubModalOpen(true);
                  return;
                }
                setIsQrModalOpen(true);
              }}
              onOpenConfig={(id, name) => {
                if (!subscription?.isActive) {
                  setIsSubModalOpen(true);
                  return;
                }
                setConfigModalAccount({ id, name });
              }}
              onOpenLogs={(id, name) => {
                if (!subscription?.isActive) {
                  setIsSubModalOpen(true);
                  return;
                }
                setLogsModalAccount({ id, name });
              }}
              onRequireSubscription={() => setIsSubModalOpen(true)}
            />
          </div>
        )}
      </main>

      {/* QR Login Modal */}
      <QRLoginModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onSuccess={() => {
          loadAccounts();
        }}
      />

      {/* Bot Config Modal */}
      <BotConfigModal
        isOpen={!!configModalAccount}
        accountId={configModalAccount?.id || null}
        accountName={configModalAccount?.name || ""}
        onClose={() => setConfigModalAccount(null)}
      />

      {/* Message Logs Modal */}
      <MessageLogsModal
        isOpen={!!logsModalAccount}
        accountId={logsModalAccount?.id || null}
        accountName={logsModalAccount?.name || ""}
        onClose={() => setLogsModalAccount(null)}
      />

      {/* Subscription & SePay Modal */}
      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        onSubscriptionUpdated={() => {
          loadSubscription();
        }}
        onStartConnectZalo={() => {
          setIsSubModalOpen(false);
          setIsQrModalOpen(true);
        }}
      />
    </div>
  );
}
