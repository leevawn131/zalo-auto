import { describe, it, expect, vi } from "vitest";
import { ZaloConnectionStateMachine } from "../zalo-state-machine.js";
import { ZaloAccountStatus } from "../zalo-auth.types.js";
import { ZaloAuthError } from "../zalo-auth.errors.js";

describe("ZaloConnectionStateMachine", () => {
  it("should initialize with DISCONNECTED status", () => {
    const sm = new ZaloConnectionStateMachine();
    expect(sm.getStatus()).toBe(ZaloAccountStatus.DISCONNECTED);
    expect(sm.getRetryCount()).toBe(0);
  });

  it("should allow valid normal login flow transitions", () => {
    const sm = new ZaloConnectionStateMachine();
    const stateListener = vi.fn();
    sm.onStateChange(stateListener);

    // DISCONNECTED -> QR_PENDING
    sm.transitionTo(ZaloAccountStatus.QR_PENDING, "QR initiated");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.QR_PENDING);

    // QR_PENDING -> AUTHENTICATING
    sm.transitionTo(ZaloAccountStatus.AUTHENTICATING, "QR Scanned on mobile");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.AUTHENTICATING);

    // AUTHENTICATING -> AUTHENTICATED
    sm.transitionTo(ZaloAccountStatus.AUTHENTICATED, "Confirmed on mobile");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.AUTHENTICATED);

    // AUTHENTICATED -> CONNECTING
    sm.transitionTo(ZaloAccountStatus.CONNECTING, "Starting connection");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.CONNECTING);

    // CONNECTING -> ONLINE
    sm.transitionTo(ZaloAccountStatus.ONLINE, "WebSocket connected");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.ONLINE);

    expect(stateListener).toHaveBeenCalledTimes(5);
  });

  it("should reject illegal state transitions", () => {
    const sm = new ZaloConnectionStateMachine(ZaloAccountStatus.DISCONNECTED);

    // Cannot jump directly from DISCONNECTED to ONLINE
    expect(() => {
      sm.transitionTo(ZaloAccountStatus.ONLINE);
    }).toThrow(ZaloAuthError);
  });

  it("should handle abnormal disconnect and track retries with exponential backoff", () => {
    const sm = new ZaloConnectionStateMachine(ZaloAccountStatus.ONLINE, { maxRetries: 3 });

    // Transient network drop: ONLINE -> RECONNECTING
    sm.transitionTo(ZaloAccountStatus.RECONNECTING, "Connection dropped");
    expect(sm.getRetryCount()).toBe(1);
    expect(sm.canReconnect()).toBe(true);

    const delay1 = sm.getBackoffDelay(1000, 10000);
    expect(delay1).toBeGreaterThanOrEqual(1000);

    // Retry 2
    sm.transitionTo(ZaloAccountStatus.RECONNECTING, "Retry 2");
    expect(sm.getRetryCount()).toBe(2);

    // Retry 3
    sm.transitionTo(ZaloAccountStatus.RECONNECTING, "Retry 3");
    expect(sm.getRetryCount()).toBe(3);
    expect(sm.canReconnect()).toBe(false);

    // Max retries exceeded -> transitions to ERROR
    sm.transitionTo(ZaloAccountStatus.ERROR, "Max retries exceeded");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.ERROR);
  });

  it("should transition to REAUTH_REQUIRED if kicked or cookie revoked", () => {
    const sm = new ZaloConnectionStateMachine(ZaloAccountStatus.ONLINE);
    sm.transitionTo(ZaloAccountStatus.REAUTH_REQUIRED, "Session kicked by Zalo");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.REAUTH_REQUIRED);

    // From REAUTH_REQUIRED user can only request new QR or disconnect/stop
    sm.transitionTo(ZaloAccountStatus.QR_PENDING, "User re-scanned QR");
    expect(sm.getStatus()).toBe(ZaloAccountStatus.QR_PENDING);
  });
});
