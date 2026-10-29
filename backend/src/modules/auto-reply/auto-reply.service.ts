import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import crypto from "node:crypto";
import { ThreadType, type Message, type Undo, type API } from "zca-js";
import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { ruleMatcher, RuleMatcher } from "./rule-matcher.js";
import { rateLimiter, AutoReplyRateLimiter } from "./rate-limiter.js";
import { messageLogger, MessageLoggerService } from "./message-logger.service.js";
import { groupManager, GroupManagerService } from "./group-manager.service.js";
import type { RuleDefinition } from "./auto-reply.types.js";

export class AutoReplyService {
  constructor(
    private matcher: RuleMatcher = ruleMatcher,
    private limiter: AutoReplyRateLimiter = rateLimiter,
    private msgLogger: MessageLoggerService = messageLogger,
    private grpManager: GroupManagerService = groupManager
  ) {}

  /**
   * Bind auto-reply and message logging listeners to an active Zalo API instance
   */
  public attachListeners(accountId: string, api: API): void {
    logger.info({ accountId }, "Attaching Auto-Reply & Anti-Revoke listeners to Zalo listener");

    // Message listener
    api.listener.on("message", (message: Message) => {
      void this.handleIncomingMessage(accountId, api, message);
    });

    // Undo listener (tin nhắn bị thu hồi / gỡ)
    api.listener.on("undo", (undo: Undo) => {
      void this.handleUndoEvent(accountId, undo);
    });

    // Trigger background sync of all groups for account
    try {
      void this.grpManager.syncAccountGroups(accountId, api);
    } catch (err) {
      logger.debug({ accountId, err }, "Failed to initiate group sync");
    }
  }

  public async handleIncomingMessage(accountId: string, api: API, message: Message): Promise<void> {
    const rawData = message.data;
    const isPlainText = typeof rawData.content === "string";
    const content = isPlainText ? (rawData.content as string) : "";
    const msgId = String(rawData.msgId || rawData.cliMsgId || Date.now());
    const cliMsgId = rawData.cliMsgId ? String(rawData.cliMsgId) : undefined;
    const threadType = message.type === ThreadType.Group ? "GROUP" : "USER";

    // Auto cache group metadata if it's a group message
    if (message.type === ThreadType.Group) {
      void this.grpManager.ensureGroupCached(accountId, message.threadId, api);
    }

    // 1. Anti-Revoke Message Logging: Always save message to DB immediately
    await this.msgLogger.logMessage({
      accountId,
      threadId: message.threadId,
      threadType,
      msgId,
      cliMsgId,
      senderUid: rawData.uidFrom || "unknown",
      senderName: rawData.dName,
      content: content || "[Non-text message / Attachment]",
      isSelf: message.isSelf,
      rawPayload: rawData as Record<string, unknown>,
    });

    // 2. Deduplication check: ignore duplicate events from socket echoes
    if (this.limiter.isDuplicateMessage(msgId)) {
      return;
    }

    // 3. Skip if not plain text
    if (!isPlainText || !content.trim()) {
      return;
    }

    // 4. Fetch bot configuration & active rules
    const botConfig = await prisma.botConfiguration.findUnique({
      where: { accountId },
      include: {
        rules: {
          where: { isEnabled: true },
          orderBy: { priority: "desc" },
        },
      },
    });

    if (!botConfig || !botConfig.isEnabled) {
      return; // Bot is disabled
    }

    // 5. Check self-message policy
    if (message.isSelf && !botConfig.replySelf) {
      return;
    }

    // 6. Check thread type policy (Group vs Private)
    if (message.type === ThreadType.Group && !botConfig.replyInGroup) {
      return;
    }
    if (message.type === ThreadType.User && !botConfig.replyInPrivate) {
      return;
    }

    // 7. Check infinite ping-pong loop risk
    if (this.limiter.isLoopRisk(accountId, message.threadId)) {
      logger.warn({ accountId, threadId: message.threadId }, "Suppressed auto-reply due to loop risk");
      return;
    }

    // 8. Check rate limiting
    if (this.limiter.isRateLimited(accountId, botConfig.rateLimitPerMinute)) {
      logger.warn({ accountId }, "Auto-reply rate limit exceeded for account");
      return;
    }

    // 9. Match rules
    const activeRules: RuleDefinition[] = botConfig.rules.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      matchType: r.matchType,
      replyMessage: r.replyMessage,
      replyImageUrl: r.replyImageUrl,
      isEnabled: r.isEnabled,
      priority: r.priority,
    }));

    const matchResult = this.matcher.match(content, activeRules);
    if (!matchResult.matched || (!matchResult.replyText && !matchResult.replyImageUrl)) {
      return;
    }

    // 10. Humanized typing delay (simulate typing delay)
    const delayMs = this.limiter.calculateDelay(botConfig.delayMinMs, botConfig.delayMaxMs);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // 11. Send reply via zca-js api.sendMessage (supports text and/or image)
    try {
      logger.info(
        {
          accountId,
          threadId: message.threadId,
          ruleId: matchResult.ruleId,
          hasImage: !!matchResult.replyImageUrl,
        },
        "Sending auto-reply"
      );

      if (matchResult.replyImageUrl) {
        const localImagePath = await this.resolveImagePath(matchResult.replyImageUrl);
        if (localImagePath) {
          await api.sendMessage(
            {
              msg: matchResult.replyText || "",
              attachments: [localImagePath],
            },
            message.threadId,
            message.type
          );
        } else if (matchResult.replyText) {
          await api.sendMessage(matchResult.replyText, message.threadId, message.type);
        }
      } else if (matchResult.replyText) {
        await api.sendMessage(matchResult.replyText, message.threadId, message.type);
      }

      // Log outgoing reply
      const logContent = matchResult.replyImageUrl
        ? `${matchResult.replyText || ""} [Ảnh: ${matchResult.replyImageUrl}]`.trim()
        : matchResult.replyText || "";

      await this.msgLogger.logMessage({
        accountId,
        threadId: message.threadId,
        threadType,
        msgId: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderUid: "bot_self",
        senderName: "AutoReply Bot",
        content: logContent,
        isSelf: true,
      });
    } catch (err: unknown) {
      logger.error({ err, accountId, threadId: message.threadId }, "Failed to send auto-reply");
    }
  }

  /**
   * Resolve a reply image URL (local path or remote URL) to an existing local file on disk
   */
  public async resolveImagePath(imageUrl: string): Promise<string | null> {
    try {
      const trimmed = imageUrl.trim();
      if (!trimmed) return null;

      // 1. Local path relative to uploads: /uploads/...
      if (trimmed.startsWith("/uploads/")) {
        const localPath = path.join(process.cwd(), trimmed);
        if (fs.existsSync(localPath)) {
          return localPath;
        }
      }

      // 2. Direct absolute path on server
      if (fs.existsSync(trimmed)) {
        return trimmed;
      }

      // 3. Remote HTTP/HTTPS URL
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const cacheDir = path.join(process.cwd(), "uploads", "cache");
        await fsPromises.mkdir(cacheDir, { recursive: true });

        const urlHash = crypto.createHash("md5").update(trimmed).digest("hex");
        const ext = path.extname(new URL(trimmed).pathname) || ".jpg";
        const cachedFile = path.join(cacheDir, `${urlHash}${ext}`);

        if (fs.existsSync(cachedFile)) {
          return cachedFile;
        }

        const res = await fetch(trimmed);
        if (!res.ok) {
          logger.warn({ url: trimmed, status: res.status }, "Failed to download remote reply image");
          return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        await fsPromises.writeFile(cachedFile, Buffer.from(arrayBuffer));
        return cachedFile;
      }

      return null;
    } catch (err) {
      logger.error({ err, imageUrl }, "Error resolving image path for reply");
      return null;
    }
  }

  public async handleUndoEvent(accountId: string, undo: Undo): Promise<void> {
    const rawData = undo.data;
    const msgId = rawData.msgId ? String(rawData.msgId) : undefined;
    const cliMsgId = rawData.cliMsgId ? String(rawData.cliMsgId) : undefined;

    await this.msgLogger.markMessageRevoked({
      accountId,
      msgId,
      cliMsgId,
    });
  }
}

export const autoReplyService = new AutoReplyService();
