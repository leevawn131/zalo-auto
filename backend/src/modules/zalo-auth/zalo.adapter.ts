import {
  Zalo,
  API,
  LoginQRCallbackEventType,
  type LoginQRCallbackEvent,
} from "zca-js";
import { imageSize } from "image-size";
import fs from "node:fs/promises";
import type { ZaloCredentials } from "./zalo-auth.types.js";

export { LoginQRCallbackEventType, type LoginQRCallbackEvent, API };

export async function getImageMetadata(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const dimensions = imageSize(buffer);
    return {
      size: stats.size,
      width: dimensions.width || 800,
      height: dimensions.height || 600,
    };
  } catch {
    const stats = await fs.stat(filePath).catch(() => ({ size: 1024 }));
    return {
      size: stats.size,
      width: 800,
      height: 600,
    };
  }
}

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
    this.zalo = new Zalo({
      logging: options?.logging ?? false,
      imageMetadataGetter: getImageMetadata,
    });
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
