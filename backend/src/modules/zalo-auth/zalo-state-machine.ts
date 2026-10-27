import { ZaloAccountStatus } from "./zalo-auth.types.js";
import { ZaloAuthError } from "./zalo-auth.errors.js";

export interface StateTransitionEvent {
  from: ZaloAccountStatus;
  to: ZaloAccountStatus;
  reason?: string;
  timestamp: Date;
}

export type StateChangeCallback = (event: StateTransitionEvent) => void | Promise<void>;

export class ZaloConnectionStateMachine {
  private currentStatus: ZaloAccountStatus;
  private retryCount: number = 0;
  private readonly maxRetries: number;
  private readonly listeners: StateChangeCallback[] = [];

  // Valid state transitions graph
  private static readonly VALID_TRANSITIONS: Record<ZaloAccountStatus, ZaloAccountStatus[]> = {
    [ZaloAccountStatus.DISCONNECTED]: [
      ZaloAccountStatus.QR_PENDING,
      ZaloAccountStatus.CONNECTING,
      ZaloAccountStatus.STOPPED,
    ],
    [ZaloAccountStatus.QR_PENDING]: [
      ZaloAccountStatus.QR_PENDING, // Refreshing QR on expire
      ZaloAccountStatus.AUTHENTICATING, // Scanned
      ZaloAccountStatus.ERROR,
      ZaloAccountStatus.DISCONNECTED,
      ZaloAccountStatus.STOPPED,
    ],
    [ZaloAccountStatus.AUTHENTICATING]: [
      ZaloAccountStatus.AUTHENTICATED,
      ZaloAccountStatus.ERROR,
      ZaloAccountStatus.QR_PENDING,
      ZaloAccountStatus.DISCONNECTED,
    ],
    [ZaloAccountStatus.AUTHENTICATED]: [
      ZaloAccountStatus.CONNECTING,
      ZaloAccountStatus.ERROR,
      ZaloAccountStatus.DISCONNECTED,
    ],
    [ZaloAccountStatus.CONNECTING]: [
      ZaloAccountStatus.ONLINE,
      ZaloAccountStatus.RECONNECTING,
      ZaloAccountStatus.REAUTH_REQUIRED,
      ZaloAccountStatus.ERROR,
      ZaloAccountStatus.STOPPED,
      ZaloAccountStatus.DISCONNECTED,
    ],
    [ZaloAccountStatus.ONLINE]: [
      ZaloAccountStatus.RECONNECTING,
      ZaloAccountStatus.REAUTH_REQUIRED,
      ZaloAccountStatus.STOPPED,
      ZaloAccountStatus.DISCONNECTED,
      ZaloAccountStatus.ERROR,
    ],
    [ZaloAccountStatus.RECONNECTING]: [
      ZaloAccountStatus.ONLINE,
      ZaloAccountStatus.RECONNECTING,
      ZaloAccountStatus.REAUTH_REQUIRED,
      ZaloAccountStatus.ERROR,
      ZaloAccountStatus.STOPPED,
      ZaloAccountStatus.DISCONNECTED,
    ],
    [ZaloAccountStatus.REAUTH_REQUIRED]: [
      ZaloAccountStatus.QR_PENDING,
      ZaloAccountStatus.DISCONNECTED,
      ZaloAccountStatus.STOPPED,
    ],
    [ZaloAccountStatus.ERROR]: [
      ZaloAccountStatus.ERROR, // allow error reason update
      ZaloAccountStatus.QR_PENDING,
      ZaloAccountStatus.CONNECTING,
      ZaloAccountStatus.DISCONNECTED,
      ZaloAccountStatus.STOPPED,
    ],
    [ZaloAccountStatus.STOPPED]: [
      ZaloAccountStatus.CONNECTING,
      ZaloAccountStatus.QR_PENDING,
      ZaloAccountStatus.DISCONNECTED,
    ],
  };

  constructor(
    initialStatus: ZaloAccountStatus = ZaloAccountStatus.DISCONNECTED,
    options: { maxRetries?: number } = {}
  ) {
    this.currentStatus = initialStatus;
    this.maxRetries = options.maxRetries ?? 5;
  }

  public getStatus(): ZaloAccountStatus {
    return this.currentStatus;
  }

  public getRetryCount(): number {
    return this.retryCount;
  }

  public resetRetryCount(): void {
    this.retryCount = 0;
  }

  public onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Calculate exponential backoff in milliseconds
   */
  public getBackoffDelay(baseMs = 2000, maxMs = 60000): number {
    const exponent = Math.min(this.retryCount, 8);
    const delay = Math.min(baseMs * Math.pow(2, exponent), maxMs);
    // Add 10-25% jitter to prevent synchronized reconnect floods
    const jitter = delay * (0.1 + Math.random() * 0.15);
    return Math.floor(delay + jitter);
  }

  /**
   * Attempt state transition
   */
  public transitionTo(nextStatus: ZaloAccountStatus, reason?: string): StateTransitionEvent {
    const validTargets = ZaloConnectionStateMachine.VALID_TRANSITIONS[this.currentStatus] || [];

    if (!validTargets.includes(nextStatus)) {
      throw new ZaloAuthError(
        `Invalid state transition from '${this.currentStatus}' to '${nextStatus}'. Reason: ${reason || "none"}`,
        "INVALID_STATE_TRANSITION"
      );
    }

    const previousStatus = this.currentStatus;
    this.currentStatus = nextStatus;

    if (nextStatus === ZaloAccountStatus.ONLINE) {
      this.retryCount = 0;
    } else if (nextStatus === ZaloAccountStatus.RECONNECTING) {
      this.retryCount++;
    }

    const event: StateTransitionEvent = {
      from: previousStatus,
      to: nextStatus,
      reason,
      timestamp: new Date(),
    };

    // Notify registered listeners
    for (const listener of this.listeners) {
      try {
        void listener(event);
      } catch {
        // Suppress listener error so transition doesn't fail
      }
    }

    return event;
  }

  /**
   * Check if reconnection is allowed or if max retries exceeded
   */
  public canReconnect(): boolean {
    return this.retryCount < this.maxRetries;
  }
}
