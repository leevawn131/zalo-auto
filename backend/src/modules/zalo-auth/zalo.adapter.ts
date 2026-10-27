import {
  Zalo,
  API,
  LoginQRCallbackEventType,
  type LoginQRCallbackEvent,
} from "zca-js";
import type { ZaloCredentials } from "./zalo-auth.types.js";

export { LoginQRCallbackEventType, type LoginQRCallbackEvent, API };

export interface IZaloAdapter {
  loginQR(
    options?: { userAgent?: string; language?: string; qrPath?: string },
    callback?: (event: LoginQRCallbackEvent) => unknown
  ): Promise<API>;

  login(credentials: ZaloCredentials): Promise<API>;
}

export class RealZaloAdapter implements IZaloAdapter {
  private zalo: Zalo;

  constructor(options?: { logging?: boolean }) {
    this.zalo = new Zalo({ logging: options?.logging ?? false });
  }

  public async loginQR(
    options?: { userAgent?: string; language?: string; qrPath?: string },
    callback?: (event: LoginQRCallbackEvent) => unknown
  ): Promise<API> {
    return this.zalo.loginQR(options, callback);
  }

  public async login(credentials: ZaloCredentials): Promise<API> {
    return this.zalo.login({
      imei: credentials.imei,
      cookie: credentials.cookie as never,
      userAgent: credentials.userAgent,
      language: credentials.language,
    });
  }
}
