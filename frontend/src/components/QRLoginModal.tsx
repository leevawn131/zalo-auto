"use client";

import React, { useEffect, useState } from "react";
import { connectSocket, getSocket } from "@/lib/socket";
import { fetchWithAuth } from "@/lib/api";
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Smartphone,
  ShieldCheck,
  Cookie,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  KeyRound,
  Download,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";

interface QRLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function QRLoginModal({ isOpen, onClose, onSuccess }: QRLoginModalProps) {
  const [activeTab, setActiveTab] = useState<"qr" | "cookie">("qr");

  // QR Flow States
  const [status, setStatus] = useState<
    "CONNECTING" | "QR_PENDING" | "AUTHENTICATING" | "ONLINE" | "ERROR" | "EXPIRED"
  >("CONNECTING");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [scannedUser, setScannedUser] = useState<{ displayName?: string; avatar?: string } | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cookie Flow States
  const [cookieData, setCookieData] = useState("");
  const [customImei, setCustomImei] = useState("");
  const [customUserAgent, setCustomUserAgent] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isCookieLoading, setIsCookieLoading] = useState(false);
  const [cookieError, setCookieError] = useState<string | null>(null);
  const [cookieSuccess, setCookieSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQrImage(null);
      setScannedUser(null);
      setErrorMessage(null);
      setStatus("CONNECTING");
      setCookieData("");
      setCookieError(null);
      setCookieSuccess(null);
      setIsCookieLoading(false);
      return;
    }

    // Only initiate QR socket request if activeTab is "qr"
    if (activeTab === "qr") {
      const socket = connectSocket();

      socket.on("qr_session_started", () => {
        setStatus("QR_PENDING");
      });

      socket.on("qr_status_update", (data: any) => {
        if (data.status === "QR_PENDING") {
          if (data.image) {
            setQrImage(data.image);
          }
          if (data.message?.includes("expired")) {
            setStatus("EXPIRED");
          } else {
            setStatus("QR_PENDING");
          }
        } else if (data.status === "AUTHENTICATING") {
          setStatus("AUTHENTICATING");
          setScannedUser({
            displayName: data.displayName,
            avatar: data.avatar,
          });
        } else if (data.status === "ONLINE") {
          setStatus("ONLINE");
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1500);
        } else if (data.status === "ERROR") {
          setStatus("ERROR");
          setErrorMessage(data.message || "Lỗi trong quá trình đăng nhập");
        }
      });

      socket.on("qr_error", (data: { message: string }) => {
        setStatus("ERROR");
        setErrorMessage(data.message);
      });

      socket.emit("request_qr_login");

      return () => {
        socket.off("qr_session_started");
        socket.off("qr_status_update");
        socket.off("qr_error");
      };
    }
  }, [isOpen, activeTab, onClose, onSuccess]);

  if (!isOpen) return null;

  const handleRetryQR = () => {
    setStatus("CONNECTING");
    setErrorMessage(null);
    setScannedUser(null);
    setQrImage(null);
    const socket = getSocket();
    socket.emit("request_qr_login");
  };

  const handleDownloadQR = () => {
    if (!qrImage) return;
    const link = document.createElement("a");
    link.href = qrImage;
    link.download = `zalo-qr-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCookieLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cookieData.trim()) {
      setCookieError("Vui lòng dán chuỗi Cookie hoặc JSON Credentials vào ô bên dưới.");
      return;
    }

    setIsCookieLoading(true);
    setCookieError(null);
    setCookieSuccess(null);

    try {
      const res = await fetchWithAuth("/api/zalo/accounts/cookie/login", {
        method: "POST",
        body: JSON.stringify({
          cookieData: cookieData.trim(),
          imei: customImei.trim() || undefined,
          userAgent: customUserAgent.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || "Đăng nhập bằng Cookie không thành công.");
      }

      setCookieSuccess(data.message || "Đăng nhập Zalo bằng Cookie thành công!");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCookieError(msg);
    } finally {
      setIsCookieLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              {activeTab === "qr" ? <QrCode className="w-5 h-5" /> : <Cookie className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base leading-snug">
                Thêm tài khoản Zalo Bot
              </h3>
              <p className="text-xs text-slate-500">Chọn phương thức đăng nhập thuận tiện nhất cho bạn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-100/90 mx-6 mt-4 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab("qr")}
            className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "qr"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Quét mã QR (Khuyên dùng)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cookie")}
            className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "cookie"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Cookie className="w-4 h-4" />
            <span>Đăng nhập Cookie / Session</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* TAB 1: QR CODE */}
          {activeTab === "qr" && (
            <div className="flex flex-col items-center text-center">
              {status === "CONNECTING" && (
                <div className="py-12 flex flex-col items-center">
                  <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                  <p className="text-sm font-semibold text-slate-700">Đang khởi tạo mã QR...</p>
                  <p className="text-xs text-slate-400 mt-1">Đang thiết lập phiên kết nối an toàn với máy chủ</p>
                </div>
              )}

              {status === "QR_PENDING" && qrImage && (
                <div className="flex flex-col items-center w-full animate-in zoom-in-95 duration-200">
                  <div className="p-3 bg-white rounded-2xl shadow-md border-2 border-dashed border-blue-200 relative group">
                    <img
                      src={qrImage}
                      alt="Zalo QR Code"
                      className="w-60 h-60 object-contain rounded-xl"
                    />
                  </div>

                  {/* Quick Action Buttons for Mobile */}
                  <div className="flex items-center gap-2 mt-3 w-full max-w-xs">
                    <button
                      type="button"
                      onClick={handleDownloadQR}
                      className="flex-1 flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-3 rounded-xl text-xs font-semibold border border-slate-200 transition-all shadow-sm active:scale-95"
                      title="Lưu ảnh QR vào thư viện máy để quét"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      <span>Tải ảnh QR</span>
                    </button>
                    <a
                      href="zalo://"
                      className="flex-1 flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-500/20 active:scale-95"
                      title="Mở ứng dụng Zalo trên điện thoại này"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở app Zalo</span>
                    </a>
                  </div>

                  {/* 1-Phone Instruction Card */}
                  <div className="mt-3.5 w-full max-w-sm bg-gradient-to-br from-blue-50 to-indigo-50/50 p-3 rounded-2xl border border-blue-100/80 text-left text-[11px] text-slate-700 space-y-1.5 shadow-sm">
                    <div className="flex items-center space-x-1.5 font-bold text-blue-700">
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span>Nếu bạn chỉ dùng 1 chiếc điện thoại duy nhất:</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                      <li>Bấm <strong>"Tải ảnh QR"</strong> ở trên (hoặc chụp màn hình lại).</li>
                      <li>Bấm <strong>"Mở app Zalo"</strong> &gt; Bấm biểu tượng <strong>Quét QR</strong> ở góc trên bên phải thanh tìm kiếm.</li>
                      <li>Bấm biểu tượng <strong>🖼️ Thư viện ảnh</strong> (chọn ảnh mã QR vừa lưu) rồi bấm <strong>Xác nhận đăng nhập</strong> là xong!</li>
                    </ol>
                  </div>
                </div>
              )}

              {status === "AUTHENTICATING" && (
                <div className="py-8 flex flex-col items-center animate-in zoom-in-95 duration-200">
                  <div className="relative mb-4">
                    {scannedUser?.avatar ? (
                      <img
                        src={scannedUser.avatar}
                        alt="Avatar"
                        className="w-20 h-20 rounded-full border-4 border-blue-500 shadow-lg object-cover"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                        {scannedUser?.displayName?.[0] || "Z"}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 bg-green-500 text-white p-1 rounded-full shadow">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>

                  <h4 className="font-bold text-slate-800 text-base">
                    {scannedUser?.displayName || "Tài khoản Zalo"}
                  </h4>
                  <p className="text-xs text-blue-600 font-semibold mt-1">Đã nhận diện mã quét!</p>
                  <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed">
                    Vui lòng nhấn <span className="font-bold text-slate-800">"Đăng nhập"</span> trên màn hình ứng dụng Zalo của bạn để xác nhận liên kết bot.
                  </p>
                </div>
              )}

              {status === "ONLINE" && (
                <div className="py-10 flex flex-col items-center animate-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-lg">Đăng nhập thành công!</h4>
                  <p className="text-xs text-slate-500 mt-1">Bot đã sẵn sàng và đang bắt đầu hoạt động...</p>
                </div>
              )}

              {status === "EXPIRED" && (
                <div className="py-8 flex flex-col items-center">
                  <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <h4 className="font-bold text-slate-800">Mã QR đã hết hạn</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Vui lòng làm mới để lấy mã QR mới.</p>
                  <button
                    onClick={handleRetryQR}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Làm mới mã QR</span>
                  </button>
                </div>
              )}

              {status === "ERROR" && (
                <div className="py-8 flex flex-col items-center">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <h4 className="font-bold text-slate-800">Không thể kết nối</h4>
                  <p className="text-xs text-red-600 mt-1 mb-4 max-w-xs">{errorMessage || "Đã xảy ra lỗi"}</p>
                  <button
                    onClick={handleRetryQR}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Thử lại</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COOKIE / CREDENTIALS */}
          {activeTab === "cookie" && (
            <form onSubmit={handleCookieLogin} className="space-y-4">
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5 text-xs text-indigo-900 space-y-2">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center space-x-1.5 text-indigo-700">
                    <KeyRound className="w-4 h-4" />
                    <span>Đăng nhập không cần điện thoại</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowGuide(!showGuide)}
                    className="text-[11px] text-indigo-600 hover:underline flex items-center space-x-0.5"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{showGuide ? "Ẩn hướng dẫn" : "Cách lấy Cookie"}</span>
                  </button>
                </div>

                {showGuide ? (
                  <div className="bg-white/90 p-3 rounded-xl border border-indigo-200/80 text-[11px] space-y-1.5 text-slate-700">
                    <p className="font-semibold text-indigo-700">📌 3 bước lấy Cookie trên máy tính:</p>
                    <p>1. Mở trình duyệt truy cập và đăng nhập vào: <strong>chat.zalo.me</strong></p>
                    <p>2. Bấm phím <strong>F12</strong> (hoặc chuột phải chọn <em>Kiểm tra / Inspect</em>) &gt; Chọn tab <strong>Application (Ứng dụng)</strong> &gt; <strong>Cookies</strong> &gt; <strong>https://chat.zalo.me</strong></p>
                    <p>3. Copy giá trị của dòng <strong>zpw_sek</strong> (hoặc copy toàn bộ chuỗi cookie từ Header Network) rồi dán vào ô bên dưới.</p>
                    <p className="text-[10px] text-slate-400 italic">* Hỗ trợ cả định dạng: chuỗi raw cookie, mảng JSON từ tiện ích J2Team / EditThisCookie, hoặc full Credentials JSON.*</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Dành cho VPS hoặc máy chủ remote không quét được camera: dán chuỗi Cookie hoặc JSON Session đã lưu từ trình duyệt để đăng nhập trực tiếp.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Dữ liệu Cookie hoặc JSON Credentials <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={cookieData}
                  onChange={(e) => setCookieData(e.target.value)}
                  placeholder={`Ví dụ định dạng chuỗi: \nzpw_sek=xxx; _zlang=vi; ...\n\nHoặc định dạng JSON:\n[{"name": "zpw_sek", "value": "xxx"}]`}
                  className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50 resize-y"
                  required
                />
              </div>

              {/* Advanced options accordion */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between p-2.5 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-medium text-[11px]">Tùy chọn nâng cao (IMEI, User-Agent)</span>
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvanced && (
                  <div className="p-3 bg-white space-y-3 border-t border-slate-200 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Tùy chỉnh IMEI (Để trống hệ thống sẽ tự sinh UUID chuẩn)
                      </label>
                      <input
                        type="text"
                        value={customImei}
                        onChange={(e) => setCustomImei(e.target.value)}
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Tùy chỉnh User-Agent (Để trống hệ thống dùng Chrome Desktop)
                      </label>
                      <input
                        type="text"
                        value={customUserAgent}
                        onChange={(e) => setCustomUserAgent(e.target.value)}
                        placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
                        className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {cookieError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-xs text-red-600 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cookieError}</span>
                </div>
              )}

              {cookieSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center space-x-2 text-xs text-green-700 animate-in fade-in duration-150">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{cookieSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isCookieLoading || !cookieData.trim()}
                className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs transition-all shadow-md shadow-indigo-500/20"
              >
                {isCookieLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang xác thực Cookie với Zalo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Xác nhận &amp; Kết nối Zalo</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center text-xs text-slate-400 space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Phiên đăng nhập được bảo vệ bằng chuẩn mã hóa AES-256-GCM</span>
        </div>
      </div>
    </div>
  );
}
