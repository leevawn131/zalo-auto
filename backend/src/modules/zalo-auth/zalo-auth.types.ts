import type { SerializedCookie } from "tough-cookie";

export enum ZaloAccountStatus {
  DISCONNECTED = "DISCONNECTED",
  QR_PENDING = "QR_PENDING",
  AUTHENTICATING = "AUTHENTICATING",
  AUTHENTICATED = "AUTHENTICATED",
  CONNECTING = "CONNECTING",
  ONLINE = "ONLINE",
  RECONNECTING = "RECONNECTING",
  REAUTH_REQUIRED = "REAUTH_REQUIRED",
  ERROR = "ERROR",
  STOPPED = "STOPPED",
}

export interface ZaloCookie {
  domain: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name?: string;
  key?: string;
  path: string;
  sameSite?: string;
  secure?: boolean;
  session?: boolean;
  storeId?: string;
  value: string;
}

export interface ZaloCredentials {
  imei: string;
  cookie: SerializedCookie[] | ZaloCookie[];
  userAgent: string;
  language?: string;
}

export interface EncryptedSessionData {
  encryptedData: string;
  iv: string;
  authTag: string;
  keyVersion: string;
}

export interface QREventData {
  sessionId: string;
  code?: string;
  image?: string; // base64 data URL
  avatar?: string;
  displayName?: string;
  status: ZaloAccountStatus;
  message?: string;
}

export interface ZaloUserInfo {
  uid: string;
  name: string;
  avatar?: string;
}

export interface ActiveSessionContext {
  accountId: string;
  userId: string;
  status: ZaloAccountStatus;
  retryCount: number;
  lastConnectedAt?: Date;
  proxy?: string;
}
