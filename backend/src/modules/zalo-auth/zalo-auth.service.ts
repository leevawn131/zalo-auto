import crypto from "node:crypto";
import { logger } from "../../config/logger.js";
import { autoReplyService } from "../auto-reply/auto-reply.service.js";
import {
  type IZaloAdapter,
  RealZaloAdapter,
  LoginQRCallbackEventType,
  type LoginQRCallbackEvent,
  type API,
} from "./zalo.adapter.js";
import { sessionService, ZaloSessionService } from "./zalo-session.service.js";
import { sessionRepository, ZaloSessionRepository } from "./zalo-session.repository.js";
import { ZaloConnectionStateMachine } from "./zalo-state-machine.js";
import {
  ZaloAccountStatus,
  type QREventData,
  type ZaloCredentials,
} from "./zalo-auth.types.js";
import {
  ZaloAuthError,
  ZaloNetworkError,
  ZaloInvalidSessionError,
  ZaloQrAbortedError,
  ZaloQrDeclinedError,
} from "./zalo-auth.errors.js";

export interface PendingQRSession {
  sessionId: string;
  userId: string;
  stateMachine: ZaloConnectionStateMachine;
  abortController?: AbortController;
  retryAction?: () => unknown;
  abortAction?: () => unknown;
  onEvent?: (event: QREventData) => void;
  scannedInfo?: { avatar: string; displayName: string };
  credentials?: ZaloCredentials;
  createdAt: Date;
}

export interface ActiveConnection {
  accountId: string;
  userId: string;
  api: API;
  stateMachine: ZaloConnectionStateMachine;
  reconnectTimeout?: NodeJS.Timeout;
}

export class ZaloAuthService {
  private activeQRSessions = new Map<string, PendingQRSession>();
  private activeConnections = new Map<string, ActiveConnection>();

  constructor(
    private adapter: IZaloAdapter = new RealZaloAdapter({ logging: false }),
    private sessionSvc: ZaloSessionService = sessionService,
    private repository: ZaloSessionRepository = sessionRepository
  ) {}

  /**
   * Start a QR login flow for a user
   */
  public async startQRLogin(
    userId: string,
    onEvent?: (event: QREventData) => void
  ): Promise<{ sessionId: string }> {
    const sessionId = crypto.randomUUID();
    const stateMachine = new ZaloConnectionStateMachine(ZaloAccountStatus.DISCONNECTED);

    const pendingSession: PendingQRSession = {
      sessionId,
      userId,
      stateMachine,
      onEvent,
      createdAt: new Date(),
    };

    this.activeQRSessions.set(sessionId, pendingSession);
    stateMachine.transitionTo(ZaloAccountStatus.QR_PENDING, "QR login requested");

    // Launch async QR listener
    void this.executeQRFlow(sessionId);

    return { sessionId };
  }

  private async executeQRFlow(sessionId: string): Promise<void> {
    const session = this.activeQRSessions.get(sessionId);
    if (!session) return;

    try {
      const api = await this.adapter.loginQR(
        {
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          language: "vi",
        },
        (event: LoginQRCallbackEvent) => {
          this.handleQRCallbackEvent(sessionId, event);
        }
      );

      // Successfully authenticated
      await this.handleLoginSuccess(sessionId, api);
    } catch (error: unknown) {
      this.handleLoginError(sessionId, error);
    } finally {
      this.activeQRSessions.delete(sessionId);
    }
  }

  private handleQRCallbackEvent(sessionId: string, event: LoginQRCallbackEvent): void {
    const session = this.activeQRSessions.get(sessionId);
    if (!session) return;

    switch (event.type) {
      case LoginQRCallbackEventType.QRCodeGenerated: {
        session.retryAction = event.actions.retry;
        session.abortAction = event.actions.abort;

        // Image in event.data.image is raw base64 string
        const base64Data = event.data.image.startsWith("data:")
          ? event.data.image
          : `data:image/png;base64,${event.data.image}`;

        session.onEvent?.({
          sessionId,
          code: event.data.code,
          image: base64Data,
          status: ZaloAccountStatus.QR_PENDING,
          message: "QR Code ready to scan",
        });
        break;
      }

      case LoginQRCallbackEventType.QRCodeScanned: {
        session.scannedInfo = {
          avatar: event.data.avatar,
          displayName: event.data.display_name,
        };
        session.stateMachine.transitionTo(
          ZaloAccountStatus.AUTHENTICATING,
          "User scanned QR on phone"
        );

        session.onEvent?.({
          sessionId,
          avatar: event.data.avatar,
          displayName: event.data.display_name,
          status: ZaloAccountStatus.AUTHENTICATING,
          message: "Please confirm login on your mobile phone",
        });
        break;
      }

      case LoginQRCallbackEventType.QRCodeExpired: {
        session.retryAction = event.actions.retry;
        session.abortAction = event.actions.abort;

        session.onEvent?.({
          sessionId,
          status: ZaloAccountStatus.QR_PENDING,
          message: "QR Code expired. Click retry to refresh.",
        });
        break;
      }

      case LoginQRCallbackEventType.QRCodeDeclined: {
        session.stateMachine.transitionTo(ZaloAccountStatus.ERROR, "Login rejected on mobile");
        session.onEvent?.({
          sessionId,
          status: ZaloAccountStatus.ERROR,
          message: "Login request was declined on your phone.",
        });
        break;
      }

      case LoginQRCallbackEventType.GotLoginInfo: {
        session.credentials = {
          cookie: event.data.cookie,
          imei: event.data.imei,
          userAgent: event.data.userAgent,
          language: "vi",
        };
        break;
      }
    }
  }

  private async handleLoginSuccess(sessionId: string, api: API): Promise<void> {
    const session = this.activeQRSessions.get(sessionId);
    if (!session) return;

    try {
      session.stateMachine.transitionTo(
        ZaloAccountStatus.AUTHENTICATED,
        "Authentication confirmed"
      );

      // Extract UID and cookies from API/session
      const uid = api.getOwnId ? api.getOwnId() : "unknown_zalo_uid";
      const displayName = session.scannedInfo?.displayName || `Zalo User (${uid})`;
      const avatar = session.scannedInfo?.avatar;

      // Extract credentials
      let credentials = session.credentials;
      if (!credentials && api.getCookie) {
        const cookieJar = api.getCookie();
        const jsonJar = cookieJar ? cookieJar.toJSON() : null;
        credentials = {
          imei: "generated_imei",
          cookie: (jsonJar?.cookies as never) || [],
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          language: "vi",
        };
      }

      if (!credentials) {
        throw new ZaloAuthError("Could not retrieve session credentials from completed login");
      }

      // Securely encrypt and persist session to PostgreSQL
      const account = await this.sessionSvc.saveSession({
        userId: session.userId,
        zaloId: uid,
        displayName,
        avatar,
        credentials,
      });

      // Bind active connection
      this.bindActiveConnection(account.id, session.userId, api, session.stateMachine);

      session.onEvent?.({
        sessionId,
        status: ZaloAccountStatus.ONLINE,
        displayName,
        avatar,
        message: "Successfully connected to Zalo!",
      });

      logger.info({ accountId: account.id, zaloId: uid }, "Zalo account connected successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Error saving Zalo login session");
      session.onEvent?.({
        sessionId,
        status: ZaloAccountStatus.ERROR,
        message: `Failed to save account session: ${msg}`,
      });
    }
  }

  private handleLoginError(sessionId: string, error: unknown): void {
    const session = this.activeQRSessions.get(sessionId);
    if (!session) return;

    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ sessionId, error: errMsg }, "QR Login ended with error");

    if (session.stateMachine.getStatus() !== ZaloAccountStatus.ERROR) {
      session.stateMachine.transitionTo(ZaloAccountStatus.ERROR, errMsg);
    }

    session.onEvent?.({
      sessionId,
      status: ZaloAccountStatus.ERROR,
      message: errMsg,
    });
  }

  /**
   * Bind an active API client and setup listeners
   */
  public bindActiveConnection(
    accountId: string,
    userId: string,
    api: API,
    existingStateMachine?: ZaloConnectionStateMachine
  ): ActiveConnection {
    // Stop existing connection for this account if any to enforce strict 1-worker-per-account rule
    this.stopActiveConnection(accountId);

    const sm =
      existingStateMachine ||
      new ZaloConnectionStateMachine(ZaloAccountStatus.AUTHENTICATED);

    const activeConn: ActiveConnection = {
      accountId,
      userId,
      api,
      stateMachine: sm,
    };

    this.activeConnections.set(accountId, activeConn);

    // Setup listener event hooks
    this.setupListenerHooks(accountId, api, sm);

    // Attach Auto-Reply & Anti-Revoke message listeners
    try {
      autoReplyService.attachListeners(accountId, api);
    } catch (err) {
      logger.error({ err, accountId }, "Failed to attach AutoReply listeners");
    }

    // Transition to ONLINE
    if (sm.getStatus() !== ZaloAccountStatus.ONLINE) {
      sm.transitionTo(ZaloAccountStatus.CONNECTING, "Starting listener");
      api.listener.start({ retryOnClose: false });
      sm.transitionTo(ZaloAccountStatus.ONLINE, "Listener connected");
    }

    void this.repository.updateAccountStatus(accountId, ZaloAccountStatus.ONLINE);
    return activeConn;
  }

  private setupListenerHooks(
    accountId: string,
    api: API,
    sm: ZaloConnectionStateMachine
  ): void {
    const active = this.activeConnections.get(accountId);
    if (!active) return;

    api.listener.on("connected", () => {
      logger.info({ accountId }, "Zalo WebSocket listener connected");
      if (sm.getStatus() !== ZaloAccountStatus.ONLINE) {
        sm.transitionTo(ZaloAccountStatus.ONLINE, "Socket connected");
        void this.repository.updateAccountStatus(accountId, ZaloAccountStatus.ONLINE);
      }
    });

    api.listener.on("disconnected", (code: number, reason: string) => {
      logger.warn({ accountId, code, reason }, "Zalo WebSocket disconnected");
      this.handleSocketDisconnection(accountId, code, reason);
    });

    api.listener.on("closed", (code: number, reason: string) => {
      logger.warn({ accountId, code, reason }, "Zalo WebSocket closed");
      this.handleSocketDisconnection(accountId, code, reason);
    });

    api.listener.on("error", (err: unknown) => {
      logger.error({ accountId, err }, "Zalo listener error occurred");
    });
  }

  private handleSocketDisconnection(accountId: string, code: number, reason: string): void {
    const active = this.activeConnections.get(accountId);
    if (!active) return;

    // Code 3000: DuplicateConnection, Code 3003: KickConnection
    if (code === 3000 || code === 3003) {
      logger.warn({ accountId, code, reason }, "Zalo session kicked or replaced by another device");
      active.stateMachine.transitionTo(
        ZaloAccountStatus.REAUTH_REQUIRED,
        `Session terminated by server (code ${code}: ${reason})`
      );
      void this.sessionSvc.invalidateSession(accountId, `Kicked: ${reason}`);
      this.activeConnections.delete(accountId);
      return;
    }

    // Abnormal / network closure (e.g. 1006)
    if (active.stateMachine.canReconnect()) {
      active.stateMachine.transitionTo(
        ZaloAccountStatus.RECONNECTING,
        `Socket closed unexpectedly (code ${code}: ${reason})`
      );
      void this.repository.updateAccountStatus(
        accountId,
        ZaloAccountStatus.RECONNECTING,
        reason
      );

      const delay = active.stateMachine.getBackoffDelay();
      logger.info({ accountId, delay, retry: active.stateMachine.getRetryCount() }, "Scheduling reconnection");

      if (active.reconnectTimeout) {
        clearTimeout(active.reconnectTimeout);
      }

      active.reconnectTimeout = setTimeout(() => {
        void this.restoreConnection(accountId, active.userId);
      }, delay);
    } else {
      active.stateMachine.transitionTo(
        ZaloAccountStatus.ERROR,
        "Exceeded maximum reconnect attempts"
      );
      void this.repository.updateAccountStatus(
        accountId,
        ZaloAccountStatus.ERROR,
        "Exceeded maximum reconnect attempts"
      );
    }
  }

  /**
   * Restore connection from persistent encrypted session (e.g. on server restart)
   */
  public async restoreConnection(accountId: string, userId: string): Promise<boolean> {
    logger.info({ accountId, userId }, "Attempting to restore Zalo connection from session");

    try {
      // Decrypt credentials
      const credentials = await this.sessionSvc.getDecryptedCredentials(accountId, userId);

      // Attempt login via adapter
      const api = await this.adapter.login(credentials);

      // Bind connection and start listener
      this.bindActiveConnection(accountId, userId, api);
      logger.info({ accountId }, "Connection successfully restored");
      return true;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ accountId, error: errMsg }, "Failed to restore connection");

      // Check if this is an authentication failure vs transient network issue
      if (
        errMsg.toLowerCase().includes("đăng nhập thất bại") ||
        errMsg.toLowerCase().includes("invalid") ||
        errMsg.toLowerCase().includes("unauthorized")
      ) {
        // Session invalid -> REAUTH_REQUIRED
        await this.sessionSvc.invalidateSession(accountId, errMsg);
      } else {
        // Transient error -> state RECONNECTING or ERROR
        await this.repository.updateAccountStatus(accountId, ZaloAccountStatus.ERROR, errMsg);
      }

      return false;
    }
  }

  /**
   * Disconnect and stop an active connection
   */
  public async disconnectAccount(accountId: string, userId: string): Promise<void> {
    // Verify tenant permission
    const account = await this.repository.getAccountByIdAndUser(accountId, userId);
    if (!account) return;

    this.stopActiveConnection(accountId);
    await this.repository.updateAccountStatus(accountId, ZaloAccountStatus.STOPPED);
    logger.info({ accountId, userId }, "Zalo account stopped by user");
  }

  /**
   * Cleanly stop a running active connection
   */
  private stopActiveConnection(accountId: string): void {
    const active = this.activeConnections.get(accountId);
    if (!active) return;

    if (active.reconnectTimeout) {
      clearTimeout(active.reconnectTimeout);
    }

    try {
      active.api.listener.stop();
    } catch {
      // Ignore listener stop errors
    }

    this.activeConnections.delete(accountId);
  }

  /**
   * Parse various cookie/credentials input formats:
   * 1. Full JSON Credentials: { imei, cookie, userAgent }
   * 2. Cookie JSON array: [ { name, value, domain }, ... ]
   * 3. Object with cookies property: { cookies: [ ... ] }
   * 4. DevTools Tab/Space-separated row copy (Name \t Value \t Domain \t Path ...)
   * 5. Raw cookie string: zpw_sek=xxx; _zlang=vi (with or without "Cookie:" prefix)
   * 6. Colon-separated: zpw_sek: xxx
   * 7. Direct token string: dSDM.461439611...
   */
  public parseCredentialsInput(
    cookieData: string,
    customImei?: string,
    customUserAgent?: string
  ): ZaloCredentials {
    let raw = cookieData.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    // Strip "Cookie:" or "cookie:" header prefix if copied directly from Network request headers
    raw = raw.replace(/^cookie:\s*/i, "").trim();

    const defaultUA =
      customUserAgent?.trim() ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

    const defaultImei =
      customImei?.trim() ||
      `${crypto.randomUUID()}-${crypto.createHash("md5").update(defaultUA).digest("hex")}`;

    let cookies: Array<{
      key?: string;
      name?: string;
      value: string;
      domain?: string;
      path?: string;
      hostOnly?: boolean;
    }> = [];

    // Case 1: JSON format
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);

        // Subcase 1a: Full credentials object { imei, cookie, userAgent }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.cookie) {
          const cookieArr = Array.isArray(parsed.cookie)
            ? parsed.cookie
            : parsed.cookie.cookies || [];
          return {
            imei: parsed.imei || defaultImei,
            userAgent: parsed.userAgent || defaultUA,
            cookie: cookieArr,
            language: parsed.language || "vi",
          };
        }

        // Subcase 1b: Object with cookies property { cookies: [...] }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.cookies) {
          cookies = parsed.cookies;
        } else if (Array.isArray(parsed)) {
          // Subcase 1c: Direct array of cookie objects [ { name, value }, ... ]
          cookies = parsed;
        }
      } catch {
        // Fall back to text parsing
      }
    }

    // Case 2: Text parsing (TSV, DevTools, key-value, raw token, semicolon-delimited)
    if (cookies.length === 0) {
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      for (const line of lines) {
        // Check if line contains Tabs or 2+ consecutive spaces (DevTools Application -> Cookies table copy)
        if (line.includes("\t") || /\s{2,}/.test(line)) {
          const cols = line.split(/\t+|\s{2,}/).map((c) => c.trim()).filter(Boolean);
          if (cols.length >= 2) {
            const name = cols[0];
            const value = cols[1];
            const domain = (cols[2] || "chat.zalo.me").replace(/^\./, "");
            const path = cols[3] || "/";
            cookies.push({
              name,
              key: name,
              value,
              domain,
              path,
              hostOnly: false,
            });
            continue;
          }
        }

        // Check if line contains standard semicolon or equals (e.g. zpw_sek=xxx; _zlang=vi)
        if (line.includes("=") || line.includes(";")) {
          const parts = line.split(";").map((p) => p.trim()).filter(Boolean);
          for (const p of parts) {
            const eqIdx = p.indexOf("=");
            if (eqIdx > -1) {
              const name = p.slice(0, eqIdx).trim();
              const value = p.slice(eqIdx + 1).trim();
              if (name) {
                cookies.push({
                  name,
                  key: name,
                  value,
                  domain: "chat.zalo.me",
                  path: "/",
                  hostOnly: false,
                });
              }
            }
          }
          continue;
        }

        // Check if line is colon-separated: "zpw_sek: abc..."
        if (line.includes(":") && !line.includes("http")) {
          const colIdx = line.indexOf(":");
          const name = line.slice(0, colIdx).trim();
          const value = line.slice(colIdx + 1).trim();
          if (name && value) {
            cookies.push({
              name,
              key: name,
              value,
              domain: "chat.zalo.me",
              path: "/",
              hostOnly: false,
            });
            continue;
          }
        }

        // If single line and looks like a raw zpw_sek token (no whitespace, length >= 20)
        if (lines.length === 1 && !line.includes(" ") && line.length >= 20) {
          cookies.push({
            name: "zpw_sek",
            key: "zpw_sek",
            value: line.trim(),
            domain: "chat.zalo.me",
            path: "/",
            hostOnly: false,
          });
        }
      }
    }

    if (cookies.length === 0) {
      throw new ZaloAuthError("Không thể nhận diện định dạng Cookie. Vui lòng kiểm tra lại nội dung dán.");
    }

    const normalized = cookies.map((c: any) => ({
      key: c.key || c.name,
      name: c.name || c.key,
      value: String(c.value ?? ""),
      domain: (c.domain || "chat.zalo.me").replace(/^\./, ""),
      path: c.path || "/",
      hostOnly: false,
    }));

    return {
      imei: defaultImei,
      userAgent: defaultUA,
      cookie: normalized,
      language: "vi",
    };
  }

  /**
   * Directly authenticate a Zalo account via Cookie / Session credentials
   */
  public async loginWithCredentials(
    userId: string,
    params: {
      cookieData: string;
      imei?: string;
      userAgent?: string;
    }
  ): Promise<{ account: any }> {
    const { cookieData, imei, userAgent } = params;
    if (!cookieData || !cookieData.trim()) {
      throw new ZaloAuthError("Vui lòng cung cấp chuỗi Cookie hoặc JSON Credentials.");
    }

    const credentials = this.parseCredentialsInput(cookieData, imei, userAgent);

    const cookieList = Array.isArray(credentials.cookie)
      ? credentials.cookie
      : (credentials.cookie as any)?.cookies || [];
    if (cookieList.length === 0) {
      throw new ZaloAuthError("Không tìm thấy dữ liệu cookie hợp lệ.");
    }

    let api: API;
    try {
      api = await this.adapter.login(credentials);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, userId }, "Failed to login with provided credentials");
      throw new ZaloAuthError(
        `Đăng nhập bằng Cookie thất bại: ${msg}. Vui lòng kiểm tra lại Cookie hoặc lấy Cookie mới từ chat.zalo.me`
      );
    }

    const uid = typeof api.getOwnId === "function" ? api.getOwnId() : "unknown_zalo_uid";
    let displayName = `Zalo User (${uid})`;
    let avatar: string | undefined = undefined;

    try {
      if (typeof (api as any).fetchAccountInfo === "function") {
        const profileRes = await (api as any).fetchAccountInfo();
        if (profileRes?.profile) {
          displayName = profileRes.profile.displayName || profileRes.profile.zaloName || displayName;
          avatar = profileRes.profile.avatar;
        }
      }
    } catch (e) {
      logger.warn({ e }, "Could not fetch profile info during cookie login, using defaults");
    }

    // Encrypt and persist session
    const account = await this.sessionSvc.saveSession({
      userId,
      zaloId: uid,
      displayName,
      avatar,
      credentials,
    });

    // Bind active socket and auto-reply
    this.bindActiveConnection(account.id, userId, api);

    return {
      account: {
        id: account.id,
        zaloId: uid,
        displayName,
        avatar,
        status: ZaloAccountStatus.ONLINE,
      },
    };
  }

  public getActiveConnection(accountId: string): ActiveConnection | undefined {
    return this.activeConnections.get(accountId);
  }

  public getPendingQRSession(sessionId: string): PendingQRSession | undefined {
    return this.activeQRSessions.get(sessionId);
  }
}

export const authService = new ZaloAuthService();
