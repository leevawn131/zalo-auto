"use client";

import React, { useEffect, useState } from "react";
import { connectSocket, getSocket } from "@/lib/socket";
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Smartphone,
  ShieldCheck,
} from "lucide-react";

interface QRLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function QRLoginModal({ isOpen, onClose, onSuccess }: QRLoginModalProps) {
  const [status, setStatus] = useState<
    "CONNECTING" | "QR_PENDING" | "AUTHENTICATING" | "ONLINE" | "ERROR" | "EXPIRED"
  >("CONNECTING");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [scannedUser, setScannedUser] = useState<{ displayName?: string; avatar?: string } | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQrImage(null);
      setScannedUser(null);
      setErrorMessage(null);
      setStatus("CONNECTING");
      return;
    }

    const socket = connectSocket();

    socket.on("qr_session_started", (data: { sessionId: string }) => {
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

    // Request QR login
    socket.emit("request_qr_login");

    return () => {
      socket.off("qr_session_started");
      socket.off("qr_status_update");
      socket.off("qr_error");
    };
  }, [isOpen, onClose, onSuccess]);

  if (!isOpen) return null;

  const handleRetry = () => {
    setStatus("CONNECTING");
    setErrorMessage(null);
    setScannedUser(null);
    setQrImage(null);
    const socket = getSocket();
    socket.emit("request_qr_login");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Kết nối tài khoản Zalo</h3>
              <p className="text-xs text-slate-500">Quét mã QR bằng ứng dụng Zalo trên điện thoại</p>
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
        <div className="p-6 flex flex-col items-center text-center">
          {status === "CONNECTING" && (
            <div className="py-12 flex flex-col items-center">
              <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-4" />
              <p className="text-sm font-medium text-slate-700">Đang khởi tạo mã QR...</p>
              <p className="text-xs text-slate-400 mt-1">Đang thiết lập kết nối an toàn với máy chủ</p>
            </div>
          )}

          {status === "QR_PENDING" && qrImage && (
            <div className="flex flex-col items-center">
              <div className="p-3 bg-white rounded-xl shadow-md border-2 border-dashed border-blue-200 relative group">
                <img
                  src={qrImage}
                  alt="Zalo QR Code"
                  className="w-64 h-64 object-contain rounded-lg"
                />
              </div>

              <div className="mt-4 flex items-center space-x-2 text-xs text-slate-600 bg-blue-50/80 px-3 py-1.5 rounded-full border border-blue-100">
                <Smartphone className="w-4 h-4 text-blue-600 animate-pulse" />
                <span>Mở Zalo &gt; Chọn biểu tượng Quét mã QR</span>
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

              <h4 className="font-semibold text-slate-800 text-base">
                {scannedUser?.displayName || "Tài khoản Zalo"}
              </h4>
              <p className="text-xs text-blue-600 font-medium mt-1">Đã nhận diện mã quét!</p>
              <p className="text-xs text-slate-500 mt-2 max-w-xs">
                Vui lòng nhấn <span className="font-semibold text-slate-700">"Đăng nhập"</span> trên màn hình ứng dụng Zalo của bạn để xác nhận.
              </p>
            </div>
          )}

          {status === "ONLINE" && (
            <div className="py-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="font-semibold text-slate-800 text-lg">Đăng nhập thành công!</h4>
              <p className="text-xs text-slate-500 mt-1">Phiên đăng nhập đã được lưu và mã hóa an toàn.</p>
            </div>
          )}

          {status === "EXPIRED" && (
            <div className="py-8 flex flex-col items-center">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="font-semibold text-slate-800">Mã QR đã hết hạn</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">Vui lòng làm mới để lấy mã QR mới.</p>
              <button
                onClick={handleRetry}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
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
              <h4 className="font-semibold text-slate-800">Không thể kết nối</h4>
              <p className="text-xs text-red-600 mt-1 mb-4 max-w-xs">{errorMessage || "Đã xảy ra lỗi"}</p>
              <button
                onClick={handleRetry}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử lại</span>
              </button>
            </div>
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
