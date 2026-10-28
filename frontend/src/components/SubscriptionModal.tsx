"use client";

import React, { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";
import {
  X,
  CreditCard,
  CheckCircle2,
  QrCode,
  Sparkles,
  RefreshCw,
  Copy,
  Clock,
  Shield,
} from "lucide-react";

interface Plan {
  code: string;
  name: string;
  price: number;
  durationDays: number;
  maxBots: number;
  description: string;
}

interface Invoice {
  transactionId: string;
  paymentCode: string;
  amount: number;
  qrCodeUrl: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscriptionUpdated: () => void;
  onStartConnectZalo?: () => void;
}

export function SubscriptionModal({
  isOpen,
  onClose,
  onSubscriptionUpdated,
  onStartConnectZalo,
}: SubscriptionModalProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSub, setCurrentSub] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>("STARTER_2");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);
  const [successInfo, setSuccessInfo] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) {
      setInvoice(null);
      setIsPaymentSuccess(false);
      setSuccessInfo(null);
      return;
    }
    loadData();
  }, [isOpen]);

  // Polling for invoice payment
  useEffect(() => {
    if (!invoice || isPaymentSuccess) return;

    const initialDays = currentSub?.daysRemaining || 0;
    const initialActive = currentSub?.isActive || false;

    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth("/api/billing/subscription");
        if (res.ok) {
          const data = await res.json();
          // Check if subscription status transitioned or extended
          if (data.isActive && (!initialActive || data.daysRemaining > initialDays)) {
            setIsPaymentSuccess(true);
            setSuccessInfo(data);
            setCurrentSub(data);
            setInvoice(null);
            onSubscriptionUpdated();
          }
        }
      } catch (err) {
        console.error("Polling subscription error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [invoice, currentSub, isPaymentSuccess, onSubscriptionUpdated]);

  const loadData = async () => {
    try {
      const [plansRes, subRes] = await Promise.all([
        fetchWithAuth("/api/billing/plans"),
        fetchWithAuth("/api/billing/subscription"),
      ]);

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans || []);
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setCurrentSub(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateInvoice = async (planCode: string) => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth("/api/billing/invoices", {
        method: "POST",
        body: JSON.stringify({ planCode }),
      });
      if (res.ok) {
        const data = await res.json();
        setInvoice(data.invoice);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">Gói Thuê Bao & Thanh Toán SePay</h3>
              <p className="text-xs text-slate-500">Kích hoạt và gia hạn bot tự động</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Current subscription banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-blue-900">Trạng thái gói:</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    currentSub?.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {currentSub?.isActive ? "ĐANG HOẠT ĐỘNG" : "CHƯA KÍCH HOẠT"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {currentSub?.isActive
                  ? `Còn lại ${currentSub.daysRemaining} ngày sử dụng (Hết hạn: ${new Date(
                      currentSub.subscription.expiresAt
                    ).toLocaleDateString("vi-VN")})`
                  : "Vui lòng chọn gói bên dưới để kích hoạt tài khoản bot của bạn"}
              </p>
            </div>
          </div>

          {isPaymentSuccess && successInfo ? (
            /* Payment Success Screen */
            <div className="py-8 px-4 text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20 border-2 border-emerald-300">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-1">
                <h4 className="text-2xl font-black text-slate-800">🎉 Thanh toán thành công!</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Hệ thống SePay đã xử lý giao dịch. Gói thuê bao Zalo Bot của bạn đã được kích hoạt thành công.
                </p>
              </div>

              <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl max-w-sm mx-auto text-left space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Thời gian sử dụng:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    {successInfo.daysRemaining} ngày
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Hạn sử dụng:</span>
                  <span className="font-bold text-slate-800">
                    {new Date(successInfo.subscription?.expiresAt || Date.now()).toLocaleDateString("vi-VN")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Số tài khoản bot tối đa:</span>
                  <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    {successInfo.maxBots} tài khoản
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    if (onStartConnectZalo) {
                      onStartConnectZalo();
                    } else {
                      onClose();
                    }
                  }}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded-2xl transition-all shadow-md shadow-blue-500/25 active:scale-95"
                >
                  🚀 Bắt đầu kết nối Zalo ngay
                </button>
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold px-5 py-3 rounded-2xl transition-all"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : invoice ? (
            /* VietQR Payment Screen */
            <div className="space-y-4 animate-in zoom-in-95 duration-200">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                <p className="text-xs font-semibold text-emerald-800">
                  Hóa đơn đã được tạo! Quét mã VietQR dưới đây để thanh toán tự động qua SePay.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-200">
                  <img
                    src={invoice.qrCodeUrl}
                    alt="VietQR SePay"
                    className="w-56 h-56 object-contain"
                  />
                </div>

                <div className="space-y-2 text-xs flex-1 w-full">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Ngân hàng:</span>
                    <span className="font-bold text-slate-800 text-sm">{invoice.bankName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Số tài khoản:</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {invoice.accountNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Chủ tài khoản:</span>
                    <span className="font-semibold text-slate-800">{invoice.accountHolder}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Số tiền:</span>
                    <span className="font-bold text-blue-600 text-base">
                      {invoice.amount.toLocaleString("vi-VN")} đ
                    </span>
                  </div>
                  <div className="pt-1">
                    <span className="text-slate-400 block text-[11px]">Nội dung chuyển khoản (bắt buộc):</span>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="font-mono font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 text-sm">
                        {invoice.paymentCode}
                      </span>
                      <button
                        onClick={() => copyToClipboard(invoice.paymentCode)}
                        className="p-1 text-slate-500 hover:text-blue-600 transition-colors"
                        title="Sao chép nội dung"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {isCopied && <span className="text-[10px] text-emerald-600">Đã chép!</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setInvoice(null)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  &larr; Chọn gói khác
                </button>
                <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Hệ thống tự động kích hoạt sau 5-10 giây khi nhận tiền</span>
                </div>
              </div>
            </div>
          ) : (
            /* Plan Cards */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800">Chọn gói thuê bao để kích hoạt</h4>
                <span className="text-[11px] text-rose-600 font-semibold bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-100">
                  Thuê bao bắt buộc (Không có dùng thử miễn phí)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {plans
                  .filter((p) => p.price > 0)
                  .map((plan) => (
                    <div
                      key={plan.code}
                      onClick={() => setSelectedPlan(plan.code)}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                        selectedPlan === plan.code
                          ? "border-blue-600 bg-blue-50/40 shadow-md shadow-blue-500/10"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <h5 className="font-bold text-sm text-slate-800">{plan.name}</h5>
                          {selectedPlan === plan.code && (
                            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        <div className="my-2.5">
                          <span className="text-xl font-black text-blue-600">
                            {plan.price.toLocaleString("vi-VN")}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {" "}đ / {plan.durationDays === 365 ? "1 năm" : plan.durationDays === 180 ? "6 tháng" : `${plan.durationDays} ngày`}
                          </span>
                          <div className="mt-1.5">
                            <span className="inline-block text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                              Tối đa {plan.maxBots} tài khoản
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 leading-relaxed mt-2">{plan.description}</p>
                    </div>
                  ))}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => handleCreateInvoice(selectedPlan)}
                  disabled={isLoading}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-6 py-3 rounded-2xl font-semibold transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Tạo mã thanh toán VietQR</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
