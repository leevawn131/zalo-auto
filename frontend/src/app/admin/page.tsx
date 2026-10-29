"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { fetchWithAuth, getStoredToken, removeStoredToken } from "@/lib/api";
import {
  Users,
  CreditCard,
  Bot,
  Shield,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Trash2,
  Edit,
  ArrowLeft,
  Calendar,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserX,
  Plus,
  X,
  ExternalLink,
  PowerOff,
} from "lucide-react";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  activeSubscriptions: number;
  totalRevenue: number;
  totalTransactions: number;
  paidTransactions: number;
  totalZaloAccounts: number;
  onlineZaloAccounts: number;
  revenueByPlan?: Record<string, number>;
  recentTransactions: Array<{
    id: string;
    paymentCode: string;
    amount: number;
    status: string;
    paidAt: string | null;
    userEmail: string;
  }>;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isBanned: boolean;
  banReason: string | null;
  createdAt: string;
  accountsCount: number;
  onlineAccountsCount: number;
  transactionsCount: number;
  subscription: {
    id?: string;
    planCode: string;
    status: string;
    expiresAt: string | null;
    daysRemaining: number;
    isActive: boolean;
    maxBots: number;
  } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ email: string; name?: string; role?: string } | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  // Dashboard Stats
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "transactions" | "bots">("users");

  // Users Tab State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("ALL");
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Transactions Tab State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txSearch, setTxSearch] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState("ALL");
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [isLoadingTxs, setIsLoadingTxs] = useState(false);

  // Bots Tab State
  const [bots, setBots] = useState<any[]>([]);
  const [botSearch, setBotSearch] = useState("");
  const [botStatusFilter, setBotStatusFilter] = useState("ALL");
  const [botPage, setBotPage] = useState(1);
  const [botTotalPages, setBotTotalPages] = useState(1);
  const [isLoadingBots, setIsLoadingBots] = useState(false);

  // Modals State
  const [subModalUser, setSubModalUser] = useState<AdminUser | null>(null);
  const [subPlanCode, setSubPlanCode] = useState("STARTER_2");
  const [subAddDays, setSubAddDays] = useState(30);
  const [subMaxBots, setSubMaxBots] = useState(2);
  const [isSavingSub, setIsSavingSub] = useState(false);

  const [banModalUser, setBanModalUser] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [isSavingBan, setIsSavingBan] = useState(false);

  const [deleteModalUser, setDeleteModalUser] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const showSuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  const showError = (msg: string) => {
    setActionErrorMsg(msg);
    setTimeout(() => setActionErrorMsg(null), 4000);
  };

  const checkAdminAuth = async () => {
    const token = getStoredToken();
    if (!token) {
      router.push("/");
      return;
    }

    try {
      const res = await fetchWithAuth("/api/auth/me");
      if (!res.ok) throw new Error("Auth failed");
      const data = await res.json();

      if (data.user.role !== "ADMIN") {
        setIsUnauthorized(true);
        setTimeout(() => router.push("/"), 2500);
        return;
      }

      setCurrentUser(data.user);
      loadDashboardStats();
      loadUsers();
    } catch {
      router.push("/");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleLogout = () => {
    removeStoredToken();
    router.push("/");
  };

  const loadDashboardStats = async () => {
    try {
      const res = await fetchWithAuth("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const query = new URLSearchParams({
        page: userPage.toString(),
        limit: "15",
        ...(userSearch ? { search: userSearch } : {}),
        ...(userStatusFilter !== "ALL" ? { status: userStatusFilter } : {}),
      });

      const res = await fetchWithAuth(`/api/admin/users?${query}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setUserTotalPages(data.totalPages || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadTransactions = async () => {
    setIsLoadingTxs(true);
    try {
      const query = new URLSearchParams({
        page: txPage.toString(),
        limit: "15",
        ...(txSearch ? { search: txSearch } : {}),
        ...(txStatusFilter !== "ALL" ? { status: txStatusFilter } : {}),
      });

      const res = await fetchWithAuth(`/api/admin/transactions?${query}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTxTotalPages(data.totalPages || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingTxs(false);
    }
  };

  const loadBots = async () => {
    setIsLoadingBots(true);
    try {
      const query = new URLSearchParams({
        page: botPage.toString(),
        limit: "15",
        ...(botSearch ? { search: botSearch } : {}),
        ...(botStatusFilter !== "ALL" ? { status: botStatusFilter } : {}),
      });

      const res = await fetchWithAuth(`/api/admin/zalo-accounts?${query}`);
      if (res.ok) {
        const data = await res.json();
        setBots(data.accounts || []);
        setBotTotalPages(data.totalPages || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBots(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") loadUsers();
    else if (activeTab === "transactions") loadTransactions();
    else if (activeTab === "bots") loadBots();
  }, [activeTab, userPage, userStatusFilter, txPage, txStatusFilter, botPage, botStatusFilter]);

  // Handle User Subscription Save
  const handleSaveSubscription = async () => {
    if (!subModalUser) return;
    setIsSavingSub(true);
    try {
      const res = await fetchWithAuth(`/api/admin/users/${subModalUser.id}/subscription`, {
        method: "PUT",
        body: JSON.stringify({
          planCode: subPlanCode,
          addDays: Number(subAddDays),
          maxBots: Number(subMaxBots),
          status: "ACTIVE",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi cập nhật gói");

      showSuccess(`Đã cập nhật gói thành công cho ${subModalUser.email}`);
      setSubModalUser(null);
      loadUsers();
      loadDashboardStats();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingSub(false);
    }
  };

  // Handle Ban / Unban User
  const handleSaveBan = async () => {
    if (!banModalUser) return;
    setIsSavingBan(true);
    const targetStatus = !banModalUser.isBanned;
    try {
      const res = await fetchWithAuth(`/api/admin/users/${banModalUser.id}/ban`, {
        method: "PUT",
        body: JSON.stringify({
          isBanned: targetStatus,
          reason: targetStatus ? banReason || "Bị khóa bởi Admin" : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi thay đổi trạng thái");

      showSuccess(targetStatus ? `Đã khóa ${banModalUser.email}` : `Đã mở khóa ${banModalUser.email}`);
      setBanModalUser(null);
      setBanReason("");
      loadUsers();
      loadDashboardStats();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingBan(false);
    }
  };

  // Handle Toggle Admin Role
  const handleToggleRole = async (user: AdminUser) => {
    const nextRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    const confirmMsg =
      nextRole === "ADMIN"
        ? `Bạn có chắc muốn nâng cấp [${user.email}] lên làm ADMIN (Toàn quyền quản trị)?`
        : `Bạn có chắc muốn hạ quyền [${user.email}] xuống làm USER thông thường?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetchWithAuth(`/api/admin/users/${user.id}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi cập nhật quyền");

      showSuccess(`Đã cập nhật quyền của ${user.email} thành ${nextRole}`);
      loadUsers();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle Delete User
  const handleDeleteUser = async () => {
    if (!deleteModalUser) return;
    setIsDeletingUser(true);
    try {
      const res = await fetchWithAuth(`/api/admin/users/${deleteModalUser.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi xóa người dùng");

      showSuccess(`Đã xóa vĩnh viễn tài khoản ${deleteModalUser.email}`);
      setDeleteModalUser(null);
      loadUsers();
      loadDashboardStats();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Handle Manual Approve Transaction
  const handleApproveTransaction = async (txId: string, paymentCode: string) => {
    if (!confirm(`Xác nhận duyệt thủ công giao dịch ${paymentCode}? Người dùng sẽ được kích hoạt/gia hạn gói ngay lập tức.`)) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/admin/transactions/${txId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi duyệt giao dịch");

      showSuccess(`Đã duyệt thành công giao dịch ${paymentCode}!`);
      loadTransactions();
      loadDashboardStats();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle Force Disconnect Bot
  const handleDisconnectBot = async (botId: string, displayName: string) => {
    if (!confirm(`Ngắt kết nối bot [${displayName}]? Trạng thái bot sẽ chuyển sang STOPPED.`)) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/admin/zalo-accounts/${botId}/disconnect`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi ngắt kết nối bot");

      showSuccess(`Đã ngắt kết nối bot ${displayName}`);
      loadBots();
      loadDashboardStats();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-4 shadow-lg shadow-red-500/20">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Truy cập bị từ chối (403 Forbidden)</h2>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Trang này chỉ dành riêng cho Quản trị viên (Admin). Đang chuyển hướng bạn về trang chủ...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      <Navbar user={currentUser} onLogout={handleLogout} isAdminPage={true} />

      {/* Global Toast Alerts */}
      {actionSuccessMsg && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-500 text-white text-xs px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-semibold">{actionSuccessMsg}</span>
        </div>
      )}
      {actionErrorMsg && (
        <div className="fixed top-20 right-6 z-50 bg-rose-500 text-white text-xs px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 animate-in slide-in-from-top-2">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-semibold">{actionErrorMsg}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 space-y-8">
        {/* Admin Header Banner */}
        <div className="bg-gradient-to-r from-slate-800 via-indigo-950 to-slate-800 border border-slate-700/80 p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-black text-white">Bảng Quản Trị Hệ Thống SaaS</h2>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  SUPER ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Quản lý toàn bộ người dùng, kích hoạt gói thuê bao, giám sát giao dịch và bot Zalo
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto">
            <button
              onClick={() => {
                loadDashboardStats();
                if (activeTab === "users") loadUsers();
                if (activeTab === "transactions") loadTransactions();
                if (activeTab === "bots") loadBots();
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Làm mới</span>
            </button>
            <Link
              href="/"
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Về Bot Dashboard</span>
            </Link>
          </div>
        </div>

        {/* Real-time Metric Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Tổng người dùng</span>
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-white">{stats.totalUsers}</span>
                <span className="text-xs text-emerald-400 font-medium">({stats.activeUsers} active)</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-700/50">
                <span>Bị khóa: <strong className="text-rose-400">{stats.bannedUsers}</strong></span>
                <span>Gói active: <strong className="text-emerald-400">{stats.activeSubscriptions}</strong></span>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Tổng doanh thu (SePay)</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-emerald-400">
                  {stats.totalRevenue.toLocaleString("vi-VN")} đ
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-700/50">
                <span>Đã thu: <strong className="text-white">{stats.paidTransactions}</strong> GD</span>
                <span>Tổng: <strong className="text-slate-300">{stats.totalTransactions}</strong> GD</span>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Bot Zalo Toàn Hệ Thống</span>
                <Bot className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-white">{stats.totalZaloAccounts}</span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{stats.onlineZaloAccounts} Online</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-700/50">
                <span>Ngoại tuyến: <strong className="text-slate-300">{stats.totalZaloAccounts - stats.onlineZaloAccounts}</strong></span>
                <span>Tỉ lệ online: <strong className="text-indigo-400">{stats.totalZaloAccounts > 0 ? Math.round((stats.onlineZaloAccounts / stats.totalZaloAccounts) * 100) : 0}%</strong></span>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Phân bố gói thuê bao</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div className="space-y-1 pt-1 text-xs">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">STARTER_2 (100k):</span>
                  <span className="font-bold text-blue-400">{stats.revenueByPlan?.["STARTER_2"] || 0}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">STANDARD_5 (550k):</span>
                  <span className="font-bold text-indigo-400">{stats.revenueByPlan?.["STANDARD_5"] || 0}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">PRO_9 (1.100k):</span>
                  <span className="font-bold text-amber-400">{stats.revenueByPlan?.["PRO_9"] || 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "users"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                : "bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Quản lý Người Dùng ({stats?.totalUsers || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("transactions")}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "transactions"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                : "bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Giao Dịch SePay ({stats?.totalTransactions || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("bots")}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === "bots"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                : "bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Zalo Bots Toàn Hệ Thống ({stats?.totalZaloAccounts || 0})</span>
          </button>
        </div>

        {/* ================= TAB 1: USERS ================= */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/70 p-4 rounded-2xl border border-slate-700/60">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Tìm email hoặc họ tên..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <span className="text-xs text-slate-400">Lọc:</span>
                <select
                  value={userStatusFilter}
                  onChange={(e) => {
                    setUserStatusFilter(e.target.value);
                    setUserPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">Tất cả tài khoản</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="BANNED">Đang bị khóa</option>
                  <option value="ADMIN">Chỉ tài khoản ADMIN</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase border-b border-slate-700">
                    <tr>
                      <th className="px-5 py-3.5">Người dùng</th>
                      <th className="px-5 py-3.5">Gói Thuê Bao</th>
                      <th className="px-5 py-3.5">Thời hạn</th>
                      <th className="px-5 py-3.5">Zalo Bots</th>
                      <th className="px-5 py-3.5">Trạng thái</th>
                      <th className="px-5 py-3.5">Ngày tạo</th>
                      <th className="px-5 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 text-slate-300">
                    {isLoadingUsers ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500" />
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-500">
                          Không tìm thấy người dùng nào
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-xs">
                                {u.email.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-semibold text-white">{u.name || "Chưa đặt tên"}</span>
                                  {u.role === "ADMIN" && (
                                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30 font-bold">
                                      ADMIN
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 block">{u.email}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            {u.subscription?.isActive ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span>{u.subscription.planCode}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-700/50 text-slate-400 border border-slate-700">
                                <span>Chưa kích hoạt</span>
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {u.subscription?.isActive ? (
                              <div>
                                <span className="font-bold text-white">Còn {u.subscription.daysRemaining} ngày</span>
                                <span className="text-[10px] text-slate-400 block">
                                  Hết hạn: {new Date(u.subscription.expiresAt!).toLocaleDateString("vi-VN")}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">—</span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span className="font-semibold text-white">
                              {u.accountsCount} / {u.subscription?.maxBots || 0}
                            </span>
                            {u.onlineAccountsCount > 0 && (
                              <span className="text-[10px] text-emerald-400 block">
                                ({u.onlineAccountsCount} online)
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            {u.isBanned ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                <Lock className="w-3 h-3" />
                                <span>Đang bị khóa</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400">
                                <span>Hoạt động</span>
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4 text-slate-400 text-[11px]">
                            {new Date(u.createdAt).toLocaleDateString("vi-VN")}
                          </td>

                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* Edit Subscription */}
                              <button
                                onClick={() => {
                                  setSubModalUser(u);
                                  setSubPlanCode(u.subscription?.planCode || "STARTER_2");
                                  setSubMaxBots(u.subscription?.maxBots || 2);
                                  setSubAddDays(30);
                                }}
                                className="p-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors"
                                title="Gia hạn / Chỉnh sửa gói"
                              >
                                <Edit className="w-4 h-4" />
                              </button>

                              {/* Ban / Unban */}
                              <button
                                onClick={() => {
                                  setBanModalUser(u);
                                  setBanReason(u.banReason || "");
                                }}
                                disabled={u.id === currentUser?.email}
                                className={`p-2 rounded-xl transition-colors ${
                                  u.isBanned
                                    ? "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400"
                                    : "bg-amber-600/20 hover:bg-amber-600/30 text-amber-400"
                                }`}
                                title={u.isBanned ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                              >
                                {u.isBanned ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                              </button>

                              {/* Promote / Demote Role */}
                              <button
                                onClick={() => handleToggleRole(u)}
                                className="p-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 transition-colors"
                                title={u.role === "ADMIN" ? "Hạ quyền thành USER" : "Nâng cấp làm ADMIN"}
                              >
                                <Shield className="w-4 h-4" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => setDeleteModalUser(u)}
                                className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 transition-colors"
                                title="Xóa người dùng"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {userTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700 bg-slate-900/60 text-xs text-slate-400">
                  <span>Trang {userPage} / {userTotalPages}</span>
                  <div className="space-x-2">
                    <button
                      disabled={userPage <= 1}
                      onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <button
                      disabled={userPage >= userTotalPages}
                      onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: TRANSACTIONS ================= */}
        {activeTab === "transactions" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/70 p-4 rounded-2xl border border-slate-700/60">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Tìm mã INV, email..."
                  value={txSearch}
                  onChange={(e) => {
                    setTxSearch(e.target.value);
                    setTxPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <span className="text-xs text-slate-400">Trạng thái:</span>
                <select
                  value={txStatusFilter}
                  onChange={(e) => {
                    setTxStatusFilter(e.target.value);
                    setTxPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">Tất cả giao dịch</option>
                  <option value="PAID">Thành công (PAID)</option>
                  <option value="PENDING">Đang chờ (PENDING)</option>
                  <option value="FAILED">Thất bại (FAILED)</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase border-b border-slate-700">
                    <tr>
                      <th className="px-5 py-3.5">Mã Giao Dịch</th>
                      <th className="px-5 py-3.5">Người thanh toán</th>
                      <th className="px-5 py-3.5">Số tiền</th>
                      <th className="px-5 py-3.5">Mã Ngân Hàng (Ref)</th>
                      <th className="px-5 py-3.5">Trạng thái</th>
                      <th className="px-5 py-3.5">Thời gian</th>
                      <th className="px-5 py-3.5 text-right">Duyệt thủ công</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 text-slate-300">
                    {isLoadingTxs ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500" />
                        </td>
                      </tr>
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-500">
                          Chưa có giao dịch nào
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-5 py-4 font-mono font-bold text-white">{tx.paymentCode}</td>
                          <td className="px-5 py-4">{tx.user?.email || "—"}</td>
                          <td className="px-5 py-4 font-bold text-emerald-400">
                            {tx.amount.toLocaleString("vi-VN")} đ
                          </td>
                          <td className="px-5 py-4 font-mono text-slate-400 text-[11px]">
                            {tx.referenceCode || "—"}
                          </td>
                          <td className="px-5 py-4">
                            {tx.status === "PAID" ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>THÀNH CÔNG</span>
                              </span>
                            ) : tx.status === "PENDING" ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <span>CHỜ XỬ LÝ</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400">
                                <span>THẤT BÀI</span>
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-slate-400 text-[11px]">
                            {new Date(tx.createdAt).toLocaleString("vi-VN")}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {tx.status === "PENDING" ? (
                              <button
                                onClick={() => handleApproveTransaction(tx.id, tx.paymentCode)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-emerald-500/20 transition-all"
                              >
                                Duyệt ngay
                              </button>
                            ) : (
                              <span className="text-slate-500 text-xs">Đã duyệt</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {txTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700 bg-slate-900/60 text-xs text-slate-400">
                  <span>Trang {txPage} / {txTotalPages}</span>
                  <div className="space-x-2">
                    <button
                      disabled={txPage <= 1}
                      onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <button
                      disabled={txPage >= txTotalPages}
                      onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: ALL BOTS ================= */}
        {activeTab === "bots" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-800/70 p-4 rounded-2xl border border-slate-700/60">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Tìm tên bot, Zalo ID, email chủ..."
                  value={botSearch}
                  onChange={(e) => {
                    setBotSearch(e.target.value);
                    setBotPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <span className="text-xs text-slate-400">Trạng thái:</span>
                <select
                  value={botStatusFilter}
                  onChange={(e) => {
                    setBotStatusFilter(e.target.value);
                    setBotPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">Tất cả bot</option>
                  <option value="ONLINE">Trực tuyến (ONLINE)</option>
                  <option value="STOPPED">Đã dừng (STOPPED)</option>
                  <option value="DISCONNECTED">Mất kết nối</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase border-b border-slate-700">
                    <tr>
                      <th className="px-5 py-3.5">Tài khoản Zalo</th>
                      <th className="px-5 py-3.5">Chủ sở hữu</th>
                      <th className="px-5 py-3.5">Trạng thái</th>
                      <th className="px-5 py-3.5">Auto-Reply</th>
                      <th className="px-5 py-3.5">Lần online cuối</th>
                      <th className="px-5 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 text-slate-300">
                    {isLoadingBots ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500" />
                        </td>
                      </tr>
                    ) : bots.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-500">
                          Chưa có tài khoản Zalo nào
                        </td>
                      </tr>
                    ) : (
                      bots.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center space-x-3">
                              {b.avatar ? (
                                <img src={b.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold">
                                  Z
                                </div>
                              )}
                              <div>
                                <span className="font-semibold text-white block">{b.displayName}</span>
                                <span className="text-[10px] text-slate-400 font-mono">ID: {b.zaloId}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <span className="font-medium text-slate-200 block">{b.user?.email}</span>
                            <span className="text-[10px] text-slate-400">{b.user?.name || "User"}</span>
                          </td>

                          <td className="px-5 py-4">
                            {b.status === "ONLINE" ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                <span>ONLINE</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-700/50 text-slate-400">
                                <span>{b.status}</span>
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`text-[11px] font-semibold ${
                                b.botConfig?.isEnabled ? "text-emerald-400" : "text-slate-500"
                              }`}
                            >
                              {b.botConfig?.isEnabled ? "Đang bật" : "Đang tắt"}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              ({b.botConfig?._count?.rules || 0} quy tắc)
                            </span>
                          </td>

                          <td className="px-5 py-4 text-slate-400 text-[11px]">
                            {b.lastSeenAt ? new Date(b.lastSeenAt).toLocaleString("vi-VN") : "Chưa có"}
                          </td>

                          <td className="px-5 py-4 text-right">
                            {b.status === "ONLINE" && (
                              <button
                                onClick={() => handleDisconnectBot(b.id, b.displayName)}
                                className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 transition-colors"
                                title="Ngắt kết nối bot này"
                              >
                                <PowerOff className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {botTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700 bg-slate-900/60 text-xs text-slate-400">
                  <span>Trang {botPage} / {botTotalPages}</span>
                  <div className="space-x-2">
                    <button
                      disabled={botPage <= 1}
                      onClick={() => setBotPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <button
                      disabled={botPage >= botTotalPages}
                      onClick={() => setBotPage((p) => Math.min(botTotalPages, p + 1))}
                      className="px-3 py-1 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ================= MODAL: EDIT SUBSCRIPTION ================= */}
      {subModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Gia Hạn / Điều Chỉnh Gói Thuê Bao</h3>
                <p className="text-xs text-slate-400">{subModalUser.email}</p>
              </div>
              <button
                onClick={() => setSubModalUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Gói Thuê Bao:</label>
                <select
                  value={subPlanCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSubPlanCode(code);
                    if (code === "STARTER_2") setSubMaxBots(2);
                    else if (code === "STANDARD_5") setSubMaxBots(5);
                    else if (code === "PRO_9") setSubMaxBots(9);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="STARTER_2">STARTER_2 (100.000 đ - 2 bot)</option>
                  <option value="STANDARD_5">STANDARD_5 (550.000 đ - 5 bot)</option>
                  <option value="PRO_9">PRO_9 (1.100.000 đ - 9 bot)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Cộng thêm số ngày sử dụng:</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[30, 60, 180, 365].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setSubAddDays(days)}
                      className={`py-1.5 rounded-lg border font-bold text-center transition-all ${
                        subAddDays === days
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      +{days} ngày
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  value={subAddDays}
                  onChange={(e) => setSubAddDays(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Hoặc tự gõ số ngày tùy chỉnh..."
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Giới hạn số bot Zalo tối đa:</label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={subMaxBots}
                  onChange={(e) => setSubMaxBots(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setSubModalUser(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSavingSub}
                onClick={handleSaveSubscription}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isSavingSub ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: BAN USER ================= */}
      {banModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">
                {banModalUser.isBanned ? "Mở Khóa Tài Khoản" : "Khóa Tài Khoản Người Dùng"}
              </h3>
            </div>

            <p className="text-xs text-slate-300">
              {banModalUser.isBanned
                ? `Bạn có chắc muốn mở khóa cho tài khoản [${banModalUser.email}]? Người dùng sẽ đăng nhập và sử dụng bot trở lại bình thường.`
                : `Khi bị khóa, tài khoản [${banModalUser.email}] sẽ bị đăng xuất ngay lập tức và toàn bộ bot Zalo của họ sẽ dừng hoạt động.`}
            </p>

            {!banModalUser.isBanned && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Lý do khóa (sẽ hiển thị khi người dùng đăng nhập):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Spam tin nhắn vi phạm chính sách"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-3">
              <button
                type="button"
                onClick={() => setBanModalUser(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isSavingBan}
                onClick={handleSaveBan}
                className={`px-5 py-2 text-white text-xs font-semibold rounded-xl shadow-md disabled:opacity-50 flex items-center space-x-1.5 ${
                  banModalUser.isBanned
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
                }`}
              >
                {isSavingBan ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : banModalUser.isBanned ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                <span>{banModalUser.isBanned ? "Mở khóa ngay" : "Xác nhận khóa"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: DELETE USER ================= */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-800 border border-rose-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-500">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Xóa Vĩnh Viễn Người Dùng</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa tài khoản <strong className="text-white">{deleteModalUser.email}</strong>?
              Hành động này sẽ xóa toàn bộ:
            </p>
            <ul className="text-xs text-slate-400 list-disc list-inside space-y-1">
              <li>{deleteModalUser.accountsCount} tài khoản bot Zalo và phiên đăng nhập.</li>
              <li>Toàn bộ cấu hình trả lời tự động và quy tắc từ khóa.</li>
              <li>Lịch sử gói thuê bao và giao dịch thanh toán.</li>
            </ul>
            <p className="text-[11px] text-rose-400 font-bold">Hành động này KHÔNG THỂ hoàn tác!</p>

            <div className="flex items-center justify-end space-x-2 pt-3">
              <button
                type="button"
                onClick={() => setDeleteModalUser(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={handleDeleteUser}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-rose-500/20 disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isDeletingUser ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Xóa vĩnh viễn</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
