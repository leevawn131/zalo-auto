"use client";

import React, { useEffect, useState, useRef } from "react";
import { fetchWithAuth, API_URL } from "@/lib/api";
import {
  X,
  Plus,
  Trash2,
  Check,
  Settings,
  Sliders,
  MessageSquare,
  Bot,
  RefreshCw,
  AlertCircle,
  Image as ImageIcon,
  Upload,
  Link as LinkIcon,
  ExternalLink,
  Pencil,
  Tag,
} from "lucide-react";

interface Rule {
  id: string;
  keyword: string;
  matchType: "EXACT" | "CONTAINS" | "REGEX";
  replyMessage: string;
  replyImageUrl?: string | null;
  isEnabled: boolean;
  priority: number;
}

interface BotConfig {
  id: string;
  accountId: string;
  isEnabled: boolean;
  rateLimitPerMinute: number;
  delayMinMs: number;
  delayMaxMs: number;
  replySelf: boolean;
  replyInGroup: boolean;
  replyInPrivate: boolean;
  rules: Rule[];
}

interface BotConfigModalProps {
  isOpen: boolean;
  accountId: string | null;
  accountName: string;
  onClose: () => void;
}

export function BotConfigModal({
  isOpen,
  accountId,
  accountName,
  onClose,
}: BotConfigModalProps) {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"rules" | "settings">("rules");

  // New / editing rule form
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [newMatchType, setNewMatchType] = useState<"EXACT" | "CONTAINS" | "REGEX">("CONTAINS");
  const [newReplyMessage, setNewReplyMessage] = useState("");
  const [newReplyImageUrl, setNewReplyImageUrl] = useState("");
  const [newPriority, setNewPriority] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !accountId) return;
    loadConfig();
  }, [isOpen, accountId]);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/bot-config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Failed to load bot config", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBot = async () => {
    if (!config || !accountId) return;
    const nextState = !config.isEnabled;
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/bot-config`, {
        method: "PUT",
        body: JSON.stringify({ isEnabled: nextState }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig((prev) => (prev ? { ...prev, isEnabled: data.config.isEnabled } : null));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || !accountId) return;
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/bot-config`, {
        method: "PUT",
        body: JSON.stringify({
          delayMinMs: config.delayMinMs,
          delayMaxMs: config.delayMaxMs,
          rateLimitPerMinute: config.rateLimitPerMinute,
          replyInPrivate: config.replyInPrivate,
          replyInGroup: config.replyInGroup,
          replySelf: config.replySelf,
        }),
      });
      if (res.ok) {
        alert("Cập nhật cài đặt thành công!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Vui lòng chọn tệp hình ảnh (PNG, JPG, WEBP).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Dung lượng ảnh tối đa 10MB.");
      return;
    }

    setIsUploadingImage(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await fetchWithAuth("/api/zalo/bot/upload-image", {
            method: "POST",
            body: JSON.stringify({
              fileData: base64Data,
              fileName: file.name,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Tải ảnh thất bại");
          setNewReplyImageUrl(data.url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setUploadError(msg);
        } finally {
          setIsUploadingImage(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
      setIsUploadingImage(false);
    }
  };

  const handleStartEdit = (rule: Rule) => {
    setEditingRuleId(rule.id);
    setNewKeyword(rule.keyword);
    setNewMatchType(rule.matchType);
    setNewReplyMessage(rule.replyMessage || "");
    setNewReplyImageUrl(rule.replyImageUrl || "");
    setNewPriority(rule.priority || 0);
    setUploadError(null);
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setNewKeyword("");
    setNewMatchType("CONTAINS");
    setNewReplyMessage("");
    setNewReplyImageUrl("");
    setNewPriority(0);
    setUploadError(null);
  };

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !newKeyword.trim()) return;

    if (!newReplyMessage.trim() && !newReplyImageUrl.trim()) {
      alert("Vui lòng nhập tin nhắn trả lời HOẶC đính kèm ảnh trả lời.");
      return;
    }

    try {
      if (editingRuleId) {
        // Cập nhật quy tắc hiện có
        const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/rules/${editingRuleId}`, {
          method: "PUT",
          body: JSON.stringify({
            keyword: newKeyword.trim(),
            matchType: newMatchType,
            replyMessage: newReplyMessage.trim(),
            replyImageUrl: newReplyImageUrl.trim() || null,
            priority: newPriority,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setConfig((prev) =>
            prev
              ? {
                  ...prev,
                  rules: prev.rules.map((r) => (r.id === editingRuleId ? data.rule : r)),
                }
              : null
          );
          handleCancelEdit();
        } else {
          const errData = await res.json();
          alert(errData.error || "Cập nhật quy tắc thất bại");
        }
      } else {
        // Thêm mới quy tắc
        const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/rules`, {
          method: "POST",
          body: JSON.stringify({
            keyword: newKeyword.trim(),
            matchType: newMatchType,
            replyMessage: newReplyMessage.trim(),
            replyImageUrl: newReplyImageUrl.trim() || null,
            priority: newPriority,
            isEnabled: true,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setConfig((prev) =>
            prev ? { ...prev, rules: [data.rule, ...prev.rules] } : null
          );
          handleCancelEdit();
        } else {
          const errData = await res.json();
          alert(errData.error || "Thêm quy tắc thất bại");
        }
      }
    } catch (err) {
      console.error("Failed to save rule", err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!accountId) return;
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/rules/${ruleId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConfig((prev) =>
          prev ? { ...prev, rules: prev.rules.filter((r) => r.id !== ruleId) } : null
        );
      }
    } catch (err) {
      console.error("Failed to delete rule", err);
    }
  };

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    if (!accountId) return;
    try {
      const res = await fetchWithAuth(`/api/zalo/accounts/${accountId}/rules/${ruleId}`, {
        method: "PUT",
        body: JSON.stringify({ isEnabled: !currentEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                rules: prev.rules.map((r) => (r.id === ruleId ? data.rule : r)),
              }
            : null
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatImageUrl = (url: string) => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `${API_URL}${url}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-2 sm:p-2.5 bg-blue-100 text-blue-600 rounded-xl flex-shrink-0">
              <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Cấu hình Auto-Reply</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">Tài khoản: {accountName}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {config && (
              <button
                onClick={handleToggleBot}
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all shadow-sm ${
                  config.isEnabled
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                }`}
              >
                <span>{config.isEnabled ? "Bot: Bật" : "Bot: Tắt"}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-100 px-4 sm:px-6 bg-white overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("rules")}
            className={`py-3 text-xs font-semibold border-b-2 mr-4 sm:mr-6 whitespace-nowrap transition-all ${
              activeTab === "rules"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <span className="hidden sm:inline">Từ khóa phản hồi</span>
            <span className="sm:hidden">Từ khóa</span> ({config?.rules.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "settings"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            <span className="hidden sm:inline">Cài đặt nâng cao (Độ trễ &amp; Giới hạn)</span>
            <span className="sm:hidden">Cài đặt bot</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-2" />
              <p className="text-xs text-slate-400">Đang tải cấu hình...</p>
            </div>
          ) : activeTab === "rules" ? (
            <div className="space-y-6">
              {/* Add / Edit Rule Form */}
              <form
                onSubmit={handleSubmitRule}
                className={`p-4 rounded-2xl border transition-all space-y-3 ${
                  editingRuleId
                    ? "bg-amber-50/70 border-amber-300 shadow-sm"
                    : "bg-blue-50/50 border-blue-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4
                    className={`text-xs font-bold flex items-center space-x-1.5 ${
                      editingRuleId ? "text-amber-900" : "text-blue-900"
                    }`}
                  >
                    {editingRuleId ? (
                      <>
                        <Pencil className="w-4 h-4 text-amber-600" />
                        <span>Chỉnh sửa quy tắc trả lời</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 text-blue-600" />
                        <span>Thêm quy tắc trả lời mới (Hỗ trợ nhiều từ khóa)</span>
                      </>
                    )}
                  </h4>

                  {editingRuleId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200 transition-colors shadow-2xs"
                    >
                      Hủy sửa
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Từ khóa (Keyword) <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Cách nhau bằng dấu phẩy (,)
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: stk, số tài khoản, qr, bank"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    />

                    {/* Preview parsed keywords tags */}
                    {newKeyword
                      .split(/[,|\n]+/)
                      .map((k) => k.trim())
                      .filter((k) => k.length > 0).length > 1 && (
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 mt-1.5">
                        <span className="text-[10px] text-blue-700 font-medium">
                          Sẽ nhận diện{" "}
                          {
                            newKeyword
                              .split(/[,|\n]+/)
                              .map((k) => k.trim())
                              .filter((k) => k.length > 0).length
                          }{" "}
                          từ khóa riêng biệt:
                        </span>
                        {newKeyword
                          .split(/[,|\n]+/)
                          .map((k) => k.trim())
                          .filter((k) => k.length > 0)
                          .map((kw, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200"
                            >
                              #{kw}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Loại khớp
                    </label>
                    <select
                      value={newMatchType}
                      onChange={(e) => setNewMatchType(e.target.value as any)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                    >
                      <option value="CONTAINS">Chứa từ khóa</option>
                      <option value="EXACT">Khớp chính xác</option>
                      <option value="REGEX">Biểu thức Regex</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nội dung tin nhắn trả lời (Text)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Nhập nội dung bot trả lời (có thể để trống nếu chỉ muốn gửi ảnh)..."
                    value={newReplyMessage}
                    onChange={(e) => setNewReplyMessage(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none bg-white"
                  />
                </div>

                {/* IMAGE REPLY ATTACHMENT */}
                <div className="bg-white p-3 rounded-xl border border-blue-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-700 flex items-center space-x-1.5">
                      <ImageIcon className="w-4 h-4 text-indigo-600" />
                      <span>Hình ảnh đính kèm phản hồi (Tùy chọn)</span>
                    </label>
                    {newReplyImageUrl && (
                      <button
                        type="button"
                        onClick={() => setNewReplyImageUrl("")}
                        className="text-[10px] text-red-500 hover:underline flex items-center space-x-0.5"
                      >
                        <X className="w-3 h-3" />
                        <span>Xóa ảnh</span>
                      </button>
                    )}
                  </div>

                  {newReplyImageUrl ? (
                    <div className="flex items-center space-x-3 p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <img
                        src={formatImageUrl(newReplyImageUrl)}
                        alt="Preview"
                        className="w-16 h-16 object-cover rounded-md border border-slate-200 shadow-sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-slate-700 truncate">
                          Đã chọn ảnh phản hồi
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{newReplyImageUrl}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={newReplyImageUrl}
                          onChange={(e) => setNewReplyImageUrl(e.target.value)}
                          placeholder="Dán link ảnh (https://...) hoặc tải ảnh lên"
                          className="w-full text-xs pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                      </div>

                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/png,image/jpeg,image/webp,image/jpg"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />

                      <button
                        type="button"
                        disabled={isUploadingImage}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center space-x-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-200 transition-colors disabled:opacity-50 shrink-0"
                      >
                        {isUploadingImage ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Đang tải...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Tải ảnh lên</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {uploadError && (
                    <p className="text-[10px] text-red-500 font-medium">{uploadError}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-500">Độ ưu tiên:</span>
                    <input
                      type="number"
                      value={newPriority}
                      onChange={(e) => setNewPriority(parseInt(e.target.value, 10) || 0)}
                      className="w-16 text-xs px-2 py-1 border border-slate-200 rounded-lg text-center bg-white"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    {editingRuleId && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="bg-white hover:bg-slate-100 text-slate-600 text-xs px-3 py-2 rounded-xl font-medium transition-colors border border-slate-200"
                      >
                        Hủy
                      </button>
                    )}
                    <button
                      type="submit"
                      className={`${
                        editingRuleId
                          ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20"
                          : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                      } text-white text-xs px-4 py-2 rounded-xl font-medium transition-colors shadow-sm`}
                    >
                      {editingRuleId ? "Lưu thay đổi" : "Lưu quy tắc"}
                    </button>
                  </div>
                </div>
              </form>

              {/* Rules List */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-600">Danh sách quy tắc đã lưu</h4>

                {config?.rules.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    Chưa có từ khóa nào. Hãy tạo từ khóa đầu tiên ở trên!
                  </div>
                ) : (
                  config?.rules.map((rule) => {
                    const ruleKeywords = rule.keyword
                      .split(/[,|\n]+/)
                      .map((k) => k.trim())
                      .filter((k) => k.length > 0);

                    return (
                      <div
                        key={rule.id}
                        className={`p-3.5 bg-white rounded-xl border shadow-sm flex items-start justify-between gap-3 transition-all ${
                          editingRuleId === rule.id
                            ? "border-amber-400 ring-2 ring-amber-200 bg-amber-50/20"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <div className="flex items-center space-x-1 flex-wrap gap-1">
                              {ruleKeywords.map((kw, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/60"
                                >
                                  #{kw}
                                </span>
                              ))}
                            </div>

                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                              {rule.matchType === "CONTAINS"
                                ? "Chứa từ"
                                : rule.matchType === "EXACT"
                                ? "Chính xác"
                                : "Regex"}
                            </span>
                            {rule.replyImageUrl && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center space-x-1">
                                <ImageIcon className="w-2.5 h-2.5" />
                                <span>Có hình ảnh</span>
                              </span>
                            )}
                            {rule.priority > 0 && (
                              <span className="text-[10px] text-blue-600 font-medium">
                                Ưu tiên: {rule.priority}
                              </span>
                            )}
                          </div>

                          {rule.replyMessage && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg leading-relaxed whitespace-pre-wrap">
                              {rule.replyMessage}
                            </p>
                          )}

                          {rule.replyImageUrl && (
                            <div className="flex items-center space-x-2 pt-1">
                              <a
                                href={formatImageUrl(rule.replyImageUrl)}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative inline-block"
                              >
                                <img
                                  src={formatImageUrl(rule.replyImageUrl)}
                                  alt="Rule attachment"
                                  className="w-16 h-16 object-cover rounded-lg border border-slate-200 group-hover:opacity-90 transition-opacity"
                                />
                                <div className="absolute inset-0 bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </div>
                              </a>
                              <span className="text-[10px] text-slate-400">Bấm để phóng to ảnh</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5 flex-shrink-0 pt-1">
                          {/* Sửa quy tắc */}
                          <button
                            type="button"
                            onClick={() => handleStartEdit(rule)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              editingRuleId === rule.id
                                ? "bg-amber-100 text-amber-700"
                                : "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                            }`}
                            title="Chỉnh sửa quy tắc này"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Bật / Tắt */}
                          <button
                            type="button"
                            onClick={() => handleToggleRule(rule.id, rule.isEnabled)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                              rule.isEnabled
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                            }`}
                          >
                            {rule.isEnabled ? "Bật" : "Tắt"}
                          </button>

                          {/* Xóa */}
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Xóa quy tắc"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* Settings Tab */
            config && (
              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Độ trễ gõ phím tối thiểu (ms)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={config.delayMinMs}
                      onChange={(e) =>
                        setConfig({ ...config, delayMinMs: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Giả lập thời gian suy nghĩ/gõ phím (mặc định 1000ms)
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Độ trễ gõ phím tối đa (ms)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30000}
                      value={config.delayMaxMs}
                      onChange={(e) =>
                        setConfig({ ...config, delayMaxMs: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Độ trễ tối đa trước khi gửi (mặc định 3000ms)
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Giới hạn phản hồi tối đa (tin / phút)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={config.rateLimitPerMinute}
                    onChange={(e) =>
                      setConfig({ ...config, rateLimitPerMinute: parseInt(e.target.value, 10) || 30 })
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Bảo vệ tài khoản tránh bị Zalo giới hạn tốc độ hoặc khóa tính năng
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <label className="flex items-center space-x-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={config.replyInPrivate}
                      onChange={(e) => setConfig({ ...config, replyInPrivate: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Tự động trả lời tin nhắn cá nhân (1-1)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={config.replyInGroup}
                      onChange={(e) => setConfig({ ...config, replyInGroup: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Tự động trả lời trong nhóm trò chuyện</span>
                  </label>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-2.5 rounded-xl font-semibold transition-colors disabled:opacity-50 text-center justify-center"
                  >
                    {isSaving ? "Đang lưu..." : "Lưu cài đặt"}
                  </button>
                </div>
              </form>
            )
          )}
        </div>
      </div>
    </div>
  );
}
