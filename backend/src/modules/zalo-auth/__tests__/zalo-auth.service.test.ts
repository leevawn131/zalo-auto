import { describe, it, expect, vi, beforeEach } from "vitest";
import EventEmitter from "events";
import { ZaloAuthService } from "../zalo-auth.service.js";
import {
  type IZaloAdapter,
  LoginQRCallbackEventType,
  type LoginQRCallbackEvent,
  type API,
} from "../zalo.adapter.js";
import { ZaloSessionService } from "../zalo-session.service.js";
import { ZaloSessionRepository } from "../zalo-session.repository.js";
import { ZaloAccountStatus, type QREventData } from "../zalo-auth.types.js";

class MockListener extends EventEmitter {
  start = vi.fn();
  stop = vi.fn();
}

class MockAPI {
  listener = new MockListener();
  getOwnId = vi.fn().mockReturnValue("zalo_uid_mock_999");
  getCookie = vi.fn().mockReturnValue({
    toJSON: () => ({ cookies: [{ name: "zpw_sek", value: "cookie_val" }] }),
  });
}

class MockZaloAdapter implements IZaloAdapter {
  loginQRMock = vi.fn();
  loginMock = vi.fn();

  async loginQR(
    options?: { userAgent?: string; language?: string; qrPath?: string },
    callback?: (event: LoginQRCallbackEvent) => unknown
  ): Promise<API> {
    return this.loginQRMock(options, callback);
  }

  async login(credentials: unknown): Promise<API> {
    return this.loginMock(credentials);
  }
}

describe("ZaloAuthService (QR Lifecycle, Restoration & Reconnection)", () => {
  let adapter: MockZaloAdapter;
  let mockSessionService: Partial<ZaloSessionService>;
  let mockRepo: Partial<ZaloSessionRepository>;
  let authService: ZaloAuthService;

  beforeEach(() => {
    adapter = new MockZaloAdapter();

    mockSessionService = {
      saveSession: vi.fn().mockResolvedValue({
        id: "acc_123",
        userId: "user_test",
        zaloId: "zalo_uid_mock_999",
        displayName: "Test User",
        status: "AUTHENTICATED",
      }),
      getDecryptedCredentials: vi.fn().mockResolvedValue({
        imei: "mock_imei",
        cookie: [],
        userAgent: "mock_ua",
        language: "vi",
      }),
      invalidateSession: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    mockRepo = {
      updateAccountStatus: vi.fn().mockResolvedValue(undefined),
      getAccountByIdAndUser: vi.fn().mockResolvedValue({
        id: "acc_123",
        userId: "user_test",
        status: "ONLINE",
      } as never),
    };

    authService = new ZaloAuthService(
      adapter,
      mockSessionService as ZaloSessionService,
      mockRepo as ZaloSessionRepository
    );
  });

  it("should handle full QR login flow from generation to successful connection", async () => {
    const eventsReceived: QREventData[] = [];
    const mockApi = new MockAPI();

    // Configure mock adapter to simulate the sequence of QR events from zca-js
    adapter.loginQRMock.mockImplementation(async (_options, callback) => {
      // 1. QR Code generated
      callback?.({
        type: LoginQRCallbackEventType.QRCodeGenerated,
        data: {
          code: "qr_code_123",
          image: "base64_encoded_image_string",
          options: { enabledCheckOCR: false, enabledMultiLayer: false },
          token: "tok_123",
        },
        actions: {
          saveToFile: vi.fn(),
          retry: vi.fn(),
          abort: vi.fn(),
        },
      });

      // 2. User scans QR
      callback?.({
        type: LoginQRCallbackEventType.QRCodeScanned,
        data: {
          avatar: "https://avatar.zalo.me/avatar.jpg",
          display_name: "Le Van A",
        },
        actions: {
          retry: vi.fn(),
          abort: vi.fn(),
        },
      });

      // 3. User confirms -> GotLoginInfo
      callback?.({
        type: LoginQRCallbackEventType.GotLoginInfo,
        data: {
          cookie: [{ key: "zpw_sek", value: "secret_cookie" }] as never,
          imei: "imei_test_xyz",
          userAgent: "test_ua",
        },
        actions: null,
      });

      // 4. Return API
      return mockApi as unknown as API;
    });

    const { sessionId } = await authService.startQRLogin("user_test", (evt) => {
      eventsReceived.push(evt);
    });

    expect(sessionId).toBeDefined();

    // Allow async execution of executeQRFlow
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(eventsReceived.length).toBeGreaterThanOrEqual(3);

    // Event 1: QR_PENDING
    expect(eventsReceived[0].status).toBe(ZaloAccountStatus.QR_PENDING);
    expect(eventsReceived[0].image).toContain("base64_encoded_image_string");

    // Event 2: AUTHENTICATING
    expect(eventsReceived[1].status).toBe(ZaloAccountStatus.AUTHENTICATING);
    expect(eventsReceived[1].displayName).toBe("Le Van A");

    // Final Event: ONLINE
    const finalEvent = eventsReceived[eventsReceived.length - 1];
    expect(finalEvent.status).toBe(ZaloAccountStatus.ONLINE);

    // Session persisted
    expect(mockSessionService.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_test",
        zaloId: "zalo_uid_mock_999",
        displayName: "Le Van A",
      })
    );

    // Listener started
    expect(mockApi.listener.start).toHaveBeenCalled();
  });

  it("should handle QR decline event and set status to ERROR", async () => {
    const eventsReceived: QREventData[] = [];

    adapter.loginQRMock.mockImplementation(async (_options, callback) => {
      callback?.({
        type: LoginQRCallbackEventType.QRCodeGenerated,
        data: {
          code: "qr_code_123",
          image: "img",
          options: { enabledCheckOCR: false, enabledMultiLayer: false },
          token: "tok",
        },
        actions: { saveToFile: vi.fn(), retry: vi.fn(), abort: vi.fn() },
      });

      callback?.({
        type: LoginQRCallbackEventType.QRCodeDeclined,
        data: { code: "qr_code_123" },
        actions: { retry: vi.fn(), abort: vi.fn() },
      });

      throw new Error("QRCode login declined");
    });

    await authService.startQRLogin("user_test", (evt) => {
      eventsReceived.push(evt);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorEvent = eventsReceived.find((e) => e.status === ZaloAccountStatus.ERROR);
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.message).toContain("declined");
  });

  it("should restore connection using existing saved credentials", async () => {
    const mockApi = new MockAPI();
    adapter.loginMock.mockResolvedValue(mockApi);

    const success = await authService.restoreConnection("acc_123", "user_test");

    expect(success).toBe(true);
    expect(mockSessionService.getDecryptedCredentials).toHaveBeenCalledWith("acc_123", "user_test");
    expect(adapter.loginMock).toHaveBeenCalled();
    expect(mockApi.listener.start).toHaveBeenCalled();
  });

  it("should transition to REAUTH_REQUIRED when restore fails with authentication error", async () => {
    adapter.loginMock.mockRejectedValue(new Error("Đăng nhập thất bại: Session expired"));

    const success = await authService.restoreConnection("acc_123", "user_test");

    expect(success).toBe(false);
    expect(mockSessionService.invalidateSession).toHaveBeenCalledWith(
      "acc_123",
      expect.stringContaining("Đăng nhập thất bại")
    );
  });

  it("should transition to REAUTH_REQUIRED if kicked by Zalo server (close code 3003)", async () => {
    const mockApi = new MockAPI();
    adapter.loginMock.mockResolvedValue(mockApi);

    await authService.restoreConnection("acc_123", "user_test");
    const activeConn = authService.getActiveConnection("acc_123");
    expect(activeConn?.stateMachine.getStatus()).toBe(ZaloAccountStatus.ONLINE);

    // Simulate Zalo server emitting close event with Kick code 3003
    mockApi.listener.emit("closed", 3003, "KickConnection");

    expect(activeConn?.stateMachine.getStatus()).toBe(ZaloAccountStatus.REAUTH_REQUIRED);
    expect(mockSessionService.invalidateSession).toHaveBeenCalledWith(
      "acc_123",
      expect.stringContaining("KickConnection")
    );
  });

  it("should handle abnormal socket closure (1006) by transitioning to RECONNECTING", async () => {
    const mockApi = new MockAPI();
    adapter.loginMock.mockResolvedValue(mockApi);

    await authService.restoreConnection("acc_123", "user_test");
    const activeConn = authService.getActiveConnection("acc_123");

    // Simulate transient network loss (code 1006)
    mockApi.listener.emit("closed", 1006, "AbnormalClosure");

    expect(activeConn?.stateMachine.getStatus()).toBe(ZaloAccountStatus.RECONNECTING);
    expect(mockRepo.updateAccountStatus).toHaveBeenCalledWith(
      "acc_123",
      ZaloAccountStatus.RECONNECTING,
      "AbnormalClosure"
    );
  });

  describe("loginWithCredentials & parseCredentialsInput", () => {
    it("should parse raw cookie string correctly", () => {
      const creds = authService.parseCredentialsInput("zpw_sek=secret123; _zlang=vi");
      expect(creds.imei).toBeDefined();
      expect(creds.userAgent).toContain("Mozilla");
      expect(creds.cookie).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "zpw_sek", value: "secret123" }),
          expect.objectContaining({ key: "_zlang", value: "vi" }),
        ])
      );
    });

    it("should parse JSON cookie array correctly", () => {
      const jsonStr = JSON.stringify([{ name: "zpw_sek", value: "token456" }]);
      const creds = authService.parseCredentialsInput(jsonStr);
      expect(creds.cookie).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "zpw_sek", value: "token456" }),
        ])
      );
    });

    it("should parse DevTools tab-separated row copy correctly", () => {
      const devtoolsTsv =
        "zpw_sek\tdSDM.461439611.a0.kAbkVmgFgzY9-Ywrq_YlhedQoiNGmesQsOxdcRI-nzI4Yf_SWA33_8QsoiMZnPACZuLxC4--wI0B-Igb4PAlhW\t.chat.zalo.me\t/\t2027-01-27T09:01:58.284Z\t111\t✓\t✓\tLax\t\t\tMediu";
      const creds = authService.parseCredentialsInput(devtoolsTsv);
      expect(creds.cookie.length).toBeGreaterThan(0);
      expect(creds.cookie[0]).toEqual(
        expect.objectContaining({
          key: "zpw_sek",
          name: "zpw_sek",
          value:
            "dSDM.461439611.a0.kAbkVmgFgzY9-Ywrq_YlhedQoiNGmesQsOxdcRI-nzI4Yf_SWA33_8QsoiMZnPACZuLxC4--wI0B-Igb4PAlhW",
          domain: "chat.zalo.me",
        })
      );
    });

    it("should parse direct raw token string correctly", () => {
      const rawToken =
        "dSDM.461439611.a0.kAbkVmgFgzY9-Ywrq_YlhedQoiNGmesQsOxdcRI-nzI4Yf_SWA33_8QsoiMZnPACZuLxC4--wI0B-Igb4PAlhW";
      const creds = authService.parseCredentialsInput(rawToken);
      expect(creds.cookie[0]).toEqual(
        expect.objectContaining({
          key: "zpw_sek",
          value: rawToken,
        })
      );
    });

    it("should parse header with Cookie prefix correctly", () => {
      const headerStr = "Cookie: zpw_sek=token123; _zlang=vi";
      const creds = authService.parseCredentialsInput(headerStr);
      expect(creds.cookie).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "zpw_sek", value: "token123" }),
          expect.objectContaining({ key: "_zlang", value: "vi" }),
        ])
      );
    });

    it("should parse full credentials JSON correctly", () => {
      const fullJson = JSON.stringify({
        imei: "custom_imei_123",
        userAgent: "CustomUA/1.0",
        cookie: [{ key: "zpw_sek", value: "token789" }],
      });
      const creds = authService.parseCredentialsInput(fullJson);
      expect(creds.imei).toBe("custom_imei_123");
      expect(creds.userAgent).toBe("CustomUA/1.0");
      expect(creds.cookie).toEqual([{ key: "zpw_sek", value: "token789" }]);
    });

    it("should successfully authenticate via loginWithCredentials", async () => {
      const mockApi = new MockAPI();
      adapter.loginMock.mockResolvedValue(mockApi);

      const result = await authService.loginWithCredentials("user_test", {
        cookieData: "zpw_sek=valid_token; _zlang=vi",
      });

      expect(result.account).toBeDefined();
      expect(result.account.id).toBe("acc_123");
      expect(result.account.status).toBe(ZaloAccountStatus.ONLINE);
      expect(mockSessionService.saveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user_test",
          zaloId: "zalo_uid_mock_999",
        })
      );
      expect(mockApi.listener.start).toHaveBeenCalled();
    });

    it("should throw meaningful error if adapter.login fails during cookie login", async () => {
      adapter.loginMock.mockRejectedValue(new Error("Cookie expired"));

      await expect(
        authService.loginWithCredentials("user_test", {
          cookieData: "zpw_sek=expired_token",
        })
      ).rejects.toThrow("Đăng nhập bằng Cookie thất bại");
    });
  });
});
