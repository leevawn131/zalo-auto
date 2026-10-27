export class ZaloAuthError extends Error {
  constructor(message: string, public readonly code: string = "ZALO_AUTH_ERROR") {
    super(message);
    this.name = "ZaloAuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ZaloSessionNotFoundError extends ZaloAuthError {
  constructor(accountId: string) {
    super(`Session not found for account: ${accountId}`, "SESSION_NOT_FOUND");
    this.name = "ZaloSessionNotFoundError";
  }
}

export class ZaloSessionCorruptedError extends ZaloAuthError {
  constructor(details?: string) {
    super(`Session payload corrupted or failed decryption: ${details || "unknown"}`, "SESSION_CORRUPTED");
    this.name = "ZaloSessionCorruptedError";
  }
}

export class ZaloInvalidSessionError extends ZaloAuthError {
  constructor(reason: string = "Session is invalid or has expired") {
    super(reason, "INVALID_SESSION");
    this.name = "ZaloInvalidSessionError";
  }
}

export class ZaloNetworkError extends ZaloAuthError {
  constructor(message: string) {
    super(`Network connection failure: ${message}`, "NETWORK_ERROR");
    this.name = "ZaloNetworkError";
  }
}

export class ZaloQrAbortedError extends ZaloAuthError {
  constructor() {
    super("QR code login process was aborted", "QR_ABORTED");
    this.name = "ZaloQrAbortedError";
  }
}

export class ZaloQrDeclinedError extends ZaloAuthError {
  constructor() {
    super("QR code login was declined on mobile device", "QR_DECLINED");
    this.name = "ZaloQrDeclinedError";
  }
}

export class ZaloQrExpiredError extends ZaloAuthError {
  constructor() {
    super("QR code expired before being scanned", "QR_EXPIRED");
    this.name = "ZaloQrExpiredError";
  }
}

export class TenantAccessDeniedError extends ZaloAuthError {
  constructor(userId: string, accountId: string) {
    super(`User ${userId} does not have permission to access account ${accountId}`, "TENANT_ACCESS_DENIED");
    this.name = "TenantAccessDeniedError";
  }
}
