# Zalo Auto-Reply SaaS

Hệ thống SaaS quản lý tài khoản Zalo cá nhân, tự động trả lời tin nhắn theo từ khóa/quy tắc, hỗ trợ đa tài khoản (multi-tenancy) và tích hợp thanh toán SePay.

> **Thư viện Zalo cốt lõi:** Bắt buộc sử dụng duy nhất gói chính chủ `zca-js@2.2.0` (từ repository `RFS-ADRENO/zca-js`). Đã được khóa phiên bản trong `backend/package.json`.

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
│           └── zalo-auth/          # Module Zalo Authentication cốt lõi
│               ├── zalo-auth.types.ts
│               ├── zalo-auth.errors.ts
│               ├── zalo-state-machine.ts    # State machine 10 trạng thái + Exponential backoff
│               ├── zalo.adapter.ts          # Adapter bọc zca-js v2.2.0
│               ├── zalo-session.crypto.ts   # Mã hóa AES-256-GCM + IV + Tag + Xoay key
│               ├── zalo-session.repository.ts # Database persistence với tenant isolation
│               ├── zalo-session.service.ts  # Session lifecycle & Invalidation
│               ├── zalo-auth.service.ts     # QR login flow & connection restoration
│               ├── zalo-auth.controller.ts  # REST APIs cho Zalo accounts
│               ├── zalo-auth.gateway.ts     # Socket.IO gateway stream QR realtime
│               └── __tests__/               # Test suites (Vitest)
└── frontend/                       # Next.js 14 + React + TypeScript + Tailwind CSS
    └── src/
        ├── components/
        │   ├── QRLoginModal.tsx    # Modal quét QR realtime qua WebSocket
        │   ├── AccountList.tsx     # Danh sách bot, trạng thái & thao tác
        │   └── Navbar.tsx
        ├── lib/                    # API client & Socket.io client
        └── app/                    # Next.js App Router (Dashboard & Auth)
```

---

## 2. Trạng thái kết nối (Connection State Machine)

Hệ thống quản lý 10 trạng thái kết nối chuẩn xác cho từng tài khoản Zalo:

1. `DISCONNECTED`: Chưa kết nối.
2. `QR_PENDING`: Đang chờ người dùng quét mã QR.
3. `AUTHENTICATING`: Đã quét mã QR trên điện thoại, chờ xác nhận.
4. `AUTHENTICATED`: Đã xác thực thành công trên mobile.
5. `CONNECTING`: Đang khởi tạo kết nối WebSocket với máy chủ Zalo.
6. `ONLINE`: Đang trực tuyến, listener hoạt động và sẵn sàng nhận/gửi tin nhắn.
7. `RECONNECTING`: Mất mạng tạm thời, đang tự động kết nối lại theo cơ chế **Exponential Backoff** có jitter.
8. `REAUTH_REQUIRED`: Phiên đăng nhập bị hủy (do người dùng đăng nhập nơi khác - code 3000/3003, hoặc cookie hết hạn). Yêu cầu quét lại QR.
9. `ERROR`: Gặp lỗi không phục hồi được.
10. `STOPPED`: Người dùng chủ động tạm dừng bot.

---

## 3. Bảo mật & Mã hóa dữ liệu

- **Mã hóa phiên đăng nhập (Session):** Toàn bộ cookie, token, IMEI của tài khoản Zalo được mã hóa bằng thuật toán đối xứng xác thực **AES-256-GCM** với IV ngẫu nhiên 12-byte và Authentication Tag 16-byte trước khi ghi vào database PostgreSQL.
- **Phát hiện sửa đổi dữ liệu (Tamper Detection):** Bất kỳ sự thay đổi dù chỉ 1 bit ở Ciphertext, IV hoặc Auth Tag sẽ kích hoạt ngoại lệ `ZaloSessionCorruptedError` và từ chối tải session.
- **Xoay vòng khóa (Key Rotation):** Hỗ trợ đăng ký nhiều phiên bản khóa (`v1`, `v2`, ...) để cập nhật khóa an toàn mà không làm gián đoạn hệ thống.
- **Cô lập người dùng (Multi-tenancy):** Mọi thao tác đọc/ghi session và điều khiển bot đều được kiểm tra quyền sở hữu (`userId`) nghiêm ngặt tại tầng repository.
- **Bảo mật nhật ký (Log Redaction):** Logger sử dụng Pino tự động lọc và ẩn (`[REDACTED]`) các trường nhạy cảm như cookie, token, password, secretKey.

---

## 4. Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Khởi động Database (PostgreSQL & Redis)

```bash
docker-compose up -d
```

### Bước 2: Cấu hình biến môi trường Backend

File `backend/.env`:
```env
PORT=4000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zalo_auto?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="zalo-saas-jwt-secret-very-secure-32chars-min"
SESSION_SECRET_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
CORS_ORIGIN="http://localhost:3000"
NODE_ENV=development
```

Đồng bộ cơ sở dữ liệu:
```bash
cd backend
npx prisma db push
```

### Bước 3: Chạy Kiểm thử (Unit & Integration Tests)

```bash
npm test
```
Tất cả 20 test cases bao phủ mã hóa AES-256-GCM, cô lập tenant, state machine, vòng đời QR code, phục hồi session và ngắt kết nối socket kick sẽ được chạy tự động.

### Bước 4: Chạy Ứng dụng

Mở terminal chạy Backend:
```bash
npm run dev:backend
# Backend chạy tại http://localhost:4000
```

Mở terminal chạy Frontend Dashboard:
```bash
npm run dev:frontend
# Giao diện web chạy tại http://localhost:3000
```

---

## 5. Tiến độ triển khai các Phase

- [x] **Phase 1: ZCA-JS Authentication** *(Hoàn thành)*
  - Khóa phiên bản `zca-js@2.2.0` từ upstream chính thức.
  - Nghiên cứu chính xác API `loginQR`, `login(credentials)`, `listener`.
  - Thiết kế state machine 10 trạng thái kết nối có exponential backoff.
  - Module mã hóa session AES-256-GCM với tamper detection & key rotation.
  - Database schema Prisma đầy đủ 9 bảng quan hệ.
  - Real-time QR Login Modal qua Socket.io & REST APIs.
  - Khôi phục session an toàn, phân biệt lỗi mạng và lỗi hết hạn phiên (`REAUTH_REQUIRED`).
  - Toàn bộ 20 unit & integration tests pass 100%.
- [ ] **Phase 2: Auto-Reply Engine**
  - Listener tin nhắn cá nhân (`ThreadType.User`) và nhóm (`ThreadType.Group`).
  - Luật phản hồi: Khớp chính xác (EXACT), Chứa từ khóa (CONTAINS), Biểu thức chính quy (REGEX).
  - Rate limiting, typing delay giả lập, debounce chống lặp vô hạn.
  - Bắt sự kiện thu hồi tin nhắn (`undo`) và lưu lịch sử.
- [ ] **Phase 3: SaaS Dashboard & Worker Management**
  - Giao diện tùy chỉnh từ khóa, độ trễ và rule auto-reply.
  - Độc lập worker cho từng tài khoản Zalo.
  - Hỗ trợ gán proxy riêng cho từng tài khoản.
- [ ] **Phase 4: SePay Subscription**
  - Quản lý gói thuê bao theo tháng.
  - Sinh mã VietQR chuyển khoản tự động.
  - Webhook SePay đối soát giao dịch và tự động gia hạn / ngắt bot khi hết hạn.
