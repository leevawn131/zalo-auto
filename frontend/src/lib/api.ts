export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("zalo_saas_token");
}

export function setStoredToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("zalo_saas_token", token);
  }
}

export function removeStoredToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("zalo_saas_token");
  }
}

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    removeStoredToken();
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      // Token expired
    }
  }

  if (response.status === 402) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("subscription_required", {
          detail: {
            message:
              "Tính năng này yêu cầu gói thuê bao đang hoạt động. Vui lòng nâng cấp/gia hạn để tiếp tục.",
          },
        })
      );
    }
  }

  return response;
}
