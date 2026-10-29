export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  activeSubscriptions: number;
  totalRevenue: number;
  totalTransactions: number;
  paidTransactions: number;
  totalZaloAccounts: number;
  onlineZaloAccounts: number;
  revenueByPlan: Record<string, number>;
  recentTransactions: Array<{
    id: string;
    paymentCode: string;
    amount: number;
    status: string;
    paidAt: Date | null;
    userEmail: string;
  }>;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isBanned: boolean;
  banReason: string | null;
  createdAt: Date;
  accountsCount: number;
  onlineAccountsCount: number;
  transactionsCount: number;
  subscription: {
    id?: string;
    planCode: string;
    status: string;
    expiresAt: Date | null;
    daysRemaining: number;
    isActive: boolean;
    maxBots: number;
  } | null;
}

export interface UpdateUserSubscriptionDto {
  planCode?: string;
  addDays?: number;
  customExpiresAt?: string;
  maxBots?: number;
  status?: "ACTIVE" | "EXPIRED" | "CANCELLED";
}

export interface BanUserDto {
  isBanned: boolean;
  reason?: string;
}

export interface UpdateUserRoleDto {
  role: "USER" | "ADMIN";
}
