import crypto from "node:crypto";
import { logger } from "../../config/logger.js";
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

  public getActiveConnection(accountId: string): ActiveConnection | undefined {
    return this.activeConnections.get(accountId);
  }

  public getPendingQRSession(sessionId: string): PendingQRSession | undefined {
    return this.activeQRSessions.get(sessionId);
  }
}

export const authService = new ZaloAuthService();
