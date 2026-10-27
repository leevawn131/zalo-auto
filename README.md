# Zalo Auto-Reply SaaS

Hệ thống SaaS chuyên nghiệp quản lý nhiều tài khoản Zalo cá nhân, tự động phản hồi tin nhắn theo từ khóa/quy tắc, lưu vết tin nhắn (kể cả tin nhắn đã bị đối phương thu hồi), bảo vệ phiên đăng nhập an toàn và tích hợp thanh toán SePay tự động qua VietQR.

> **Thư viện Zalo cốt lõi:** Bắt buộc sử dụng duy nhất gói chính chủ `zca-js@2.2.0` (từ repository `RFS-ADRENO/zca-js`). Đã khóa phiên bản nghiêm ngặt trong `backend/package.json`.

---

## 1. Kiến trúc hệ thống

```text
zalo-auto/
├── docker-compose.yml              # PostgreSQL 16 & Redis 7
├── backend/                        # Node.js + TypeScript + Express + Socket.IO + Prisma
│   ├── prisma/
│   │   └── schema.prisma           # 9 entity quan hệ multi-tenant
│   └── src/
│       ├── config/                 # Env (Zod), Logger (Pino redacted), Prisma DB
│       ├── common/middlewares/     # JWT Auth & Multi-tenant resolution
│       └── modules/
│           ├── auth/               # User registration, login, JWT issuance
│           ├── zalo-auth/          # Module Zalo Authentication & Session Management
│           │   ├── zalo-auth.types.ts
│           │   ├── zalo-auth.errors.ts
│           │   ├── zalo-state-machine.ts    # State machine 10 trạng thái + Exponential backoff
│           │   ├── zalo.adapter.ts          # Adapter bọc zca-js v2.2.0
│           │   ├── zalo-session.crypto.ts   # Mã hóa AES-256-GCM + IV + Tag + Xoay key
│           │   ├── zalo-session.repository.ts # Database persistence với tenant isolation
│           │   ├── zalo-session.service.ts  # Session lifecycle & Invalidation
│           │   ├── zalo-auth.service.ts     # QR login flow & connection restoration
│           │   ├── zalo-auth.controller.ts  # REST APIs cho Zalo accounts
│           │   └── zalo-auth.gateway.ts     # Socket.IO gateway stream QR realtime
│           ├── auto-reply/         # Module Auto-Reply Engine & Anti-Revoke
│           │   ├── auto-reply.types.ts
│           │   ├── rule-matcher.ts          # Khớp EXACT, CONTAINS, REGEX an toàn ReDoS
│           │   ├── rate-limiter.ts          # Deduplication, Loop risk & Typing delay
│           │   ├── message-logger.service.ts # Bắt & lưu tin nhắn, audit tin đã gỡ (undo)
│           │   ├── auto-reply.service.ts    # Điều phối auto-reply qua api.sendMessage
│           │   └── auto-reply.controller.ts # REST API cấu hình bot, rules & message logs
│           └── billing/            # Module Thuê bao & SePay VietQR
│               ├── billing.types.ts
│               ├── sepay.service.ts         # Sinh VietQR, xử lý Webhook SePay idempotent
│               ├── subscription-guard.service.ts # Tự động ngắt bot khi hết hạn thuê bao
│               └── billing.controller.ts    # REST API thanh toán & Webhook endpoint
└── frontend/                       # Next.js 14 + React + TypeScript + Tailwind CSS
    └── src/
        ├── components/
        │   ├── QRLoginModal.tsx         # Modal quét QR realtime qua WebSocket
        │   ├── AccountList.tsx          # Danh sách bot, trạng thái & thao tác nhanh
        │   ├── BotConfigModal.tsx       # Tùy chỉnh từ khóa, độ trễ & rate limit
        │   ├── MessageLogsModal.tsx     # Xem lịch sử tin nhắn & tin đã bị thu hồi
        │   ├── SubscriptionModal.tsx    # Nâng cấp gói, tạo mã VietQR SePay
        │   └── Navbar.tsx
        ├── lib/                         # API client & Socket.io client
        └── app/                         # Next.js App Router (Dashboard & Auth)
```

---

## 2. Tính năng nổi bật

### 2.1. Đăng nhập QR & Bảo vệ Session Cấp Doanh Nghiệp
- **Quét mã QR thời gian thực:** Backend nhận sự kiện từ `zca-js` và stream trực tiếp hình ảnh QR (base64) xuống giao diện qua Socket.IO.
- **Phản hồi trạng thái tức thì:** Khi người dùng quét mã trên điện thoại, hệ thống nhận diện và hiển thị ngay Avatar cùng tên tài khoản trên modal web.
- **Mã hóa AES-256-GCM:** Cookie, token, IMEI được mã hóa an toàn với IV ngẫu nhiên 12-byte và Auth Tag 16-byte trước khi lưu vào PostgreSQL.
- **Khôi phục phiên:** Khi khởi động lại server hoặc ngắt kết nối tạm thời, hệ thống tự động giải mã session và đăng nhập lại bằng `zalo.login(credentials)` mà không bắt người dùng quét lại QR.
- **State Machine 10 trạng thái:** Quản lý vòng đời chặt chẽ (`DISCONNECTED`, `QR_PENDING`, `AUTHENTICATING`, `AUTHENTICATED`, `CONNECTING`, `ONLINE`, `RECONNECTING`, `REAUTH_REQUIRED`, `ERROR`, `STOPPED`).
- **Phân biệt lỗi:** Lỗi mạng tạm thời tự động reconnect theo thuật toán Exponential Backoff; phiên bị thu hồi hoặc bị thiết bị khác chiếm quyền (code 3000, 3003) chuyển ngay sang `REAUTH_REQUIRED`.

### 2.2. Động cơ Auto-Reply & Chống Checkpoint
- **Hỗ trợ 3 cơ chế khớp:**
  - `EXACT`: Khớp chính xác không phân biệt hoa thường.
  - `CONTAINS`: Chứa từ khóa bất kỳ trong câu.
  - `REGEX`: Biểu thức chính quy có cơ chế bảo vệ ReDoS (độ dài, mẫu lặp nguy hiểm).
- **Độ ưu tiên quy tắc:** Hỗ trợ gán độ ưu tiên (`priority`), quy tắc có độ ưu tiên cao hơn sẽ được đối soát trước.
- **Giả lập hành vi người thật:** Tự động tạo độ trễ ngẫu nhiên (`delayMinMs` - `delayMaxMs`, ví dụ 1-3 giây) trước khi gửi phản hồi, tránh bị Zalo phát hiện tự động hóa.
- **Chống lặp vô hạn (Loop Prevention):** Cơ chế debounce theo từng hội thoại ngăn ngừa vòng lặp phản hồi vô tận khi 2 bot nhắn tin với nhau.
- **Giới hạn tốc độ (Rate Limit):** Giới hạn số tin gửi tối đa trên mỗi tài khoản trong 1 phút.
- **Deduplication:** Bộ đệm trượt tự động loại bỏ các tin nhắn trùng lặp do socket bắn lại.

### 2.3. Bắt và Lưu Trữ Tin Nhắn Đã Thu Hồi (Anti-Revoke)
- Khi có tin nhắn đến, hệ thống lưu ngay vào bảng `message_events`.
- Khi người gửi bấm "Thu hồi" (Gỡ tin nhắn), Zalo bắn sự kiện `undo`. Bot bắt sự kiện này và cập nhật cờ `isRevoked = true` kèm mốc thời gian `revokedAt`, **vẫn bảo toàn nguyên vẹn nội dung tin nhắn gốc trong database**.
- Giao diện cung cấp bộ lọc chuyên dụng xem các tin nhắn đã bị thu hồi.

### 2.4. Thanh Toán Tự Động SePay & Quản Lý Thuê Bao
- **Tích hợp VietQR SePay:** Khi chọn gói thuê bao (Tháng: 99.000đ, Năm: 990.000đ), hệ thống sinh mã hóa đơn duy nhất (`INV...`) và tạo mã QR chuyển khoản VietQR chuẩn Napas.
- **Xử lý Webhook Idempotent:** Bắt biến động số dư từ SePay qua Webhook, kiểm tra mã giao dịch, số tiền và mã tham chiếu ngân hàng (`referenceCode`) nhằm chống kích hoạt trùng lặp.
- **Gia hạn thông minh:** Nếu gói hiện tại vẫn còn hạn, thời gian 30 ngày / 365 ngày sẽ được cộng dồn tiếp nối ngày hết hạn cũ.
- **Subscription Guard:** Tự động kiểm tra và ngắt kết nối các bot của người dùng khi gói thuê bao hết hạn.

---

## 3. Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Khởi động Database (PostgreSQL 16 & Redis 7)

```bash
docker-compose up -d
```

### Bước 2: Cấu hình biến môi trường Backend

File `backend/.env`:
```env
PORT=4001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zalo_auto?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="zalo-saas-jwt-secret-very-secure-32chars-min"
SESSION_SECRET_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
CORS_ORIGIN="http://localhost:3000"
NODE_ENV=development
SEPAY_API_KEY="test-sepay-api-key"
SEPAY_BANK_NAME="MBBank"
SEPAY_ACCOUNT_NUMBER="9999999999"
SEPAY_ACCOUNT_HOLDER="CONG TY CONG NGHE ZALO AUTO"
```

Đồng bộ database schema Prisma:
```bash
cd backend
npx prisma db push
```

### Bước 3: Chạy Kiểm thử Toàn diện

```bash
npm test
```
Toàn bộ **38 test cases** bao phủ:
1. Mã hóa AES-256-GCM, IV ngẫu nhiên, phát hiện giả mạo & xoay vòng khóa.
2. Cô lập tenant người dùng trong database.
3. State machine 10 trạng thái kết nối & exponential backoff.
4. Vòng đời đăng nhập QR, quét mã, xác nhận, hết hạn, từ chối.
5. Khôi phục phiên làm việc và xử lý sự kiện ngắt kết nối kick (code 3003).
6. Khớp từ khóa EXACT, CONTAINS, REGEX an toàn ReDoS.
7. Bộ giới hạn tốc độ (Rate Limiter), chống trùng lặp (Deduplication) và chống vòng lặp (Loop Risk).
8. Auto-reply gửi tin nhắn qua `api.sendMessage` và lưu lịch sử.
9. Bắt sự kiện `undo` lưu vết tin nhắn đã bị thu hồi.
10. Sinh mã thanh toán SePay, xử lý Webhook đối soát và gia hạn cộng dồn.
11. Ngắt bot tự động khi thuê bao hết hạn (SubscriptionGuard).

### Bước 4: Khởi chạy Ứng dụng

Terminal 1 - Chạy Backend API & Worker:
```bash
npm run dev:backend
# Chạy tại http://localhost:4001
```

Terminal 2 - Chạy Frontend Dashboard:
```bash
npm run dev:frontend
# Chạy tại http://localhost:3000
```

---

## 4. Tình trạng hoàn thành dự án

- [x] **Phase 1: ZCA-JS Authentication** (Hoàn thành & Kiểm thử)
- [x] **Phase 2: Auto-Reply Engine & Anti-Revoke** (Hoàn thành & Kiểm thử)
- [x] **Phase 3: SaaS Dashboard & Worker Management** (Hoàn thành & Kiểm thử)
- [x] **Phase 4: SePay Subscription & VietQR Payment** (Hoàn thành & Kiểm thử)
