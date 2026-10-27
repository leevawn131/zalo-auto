import { ThreadType, type Message, type Undo, type API } from "zca-js";
import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { ruleMatcher, RuleMatcher } from "./rule-matcher.js";
import { rateLimiter, AutoReplyRateLimiter } from "./rate-limiter.js";
import { messageLogger, MessageLoggerService } from "./message-logger.service.js";
import type { RuleDefinition } from "./auto-reply.types.js";

export class AutoReplyService {
  constructor(
    private matcher: RuleMatcher = ruleMatcher,
    private limiter: AutoReplyRateLimiter = rateLimiter,
    private msgLogger: MessageLoggerService = messageLogger
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
  }

  public async handleIncomingMessage(accountId: string, api: API, message: Message): Promise<void> {
    const rawData = message.data;
    const isPlainText = typeof rawData.content === "string";
    const content = isPlainText ? (rawData.content as string) : "";
    const msgId = String(rawData.msgId || rawData.cliMsgId || Date.now());
    const cliMsgId = rawData.cliMsgId ? String(rawData.cliMsgId) : undefined;
    const threadType = message.type === ThreadType.Group ? "GROUP" : "USER";

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
      isEnabled: r.isEnabled,
      priority: r.priority,
    }));

    const matchResult = this.matcher.match(content, activeRules);
    if (!matchResult.matched || !matchResult.replyText) {
      return;
    }

    // 10. Humanized typing delay (simulate typing delay)
    const delayMs = this.limiter.calculateDelay(botConfig.delayMinMs, botConfig.delayMaxMs);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // 11. Send reply via zca-js api.sendMessage
    try {
      logger.info(
        { accountId, threadId: message.threadId, ruleId: matchResult.ruleId },
        "Sending auto-reply"
      );

      await api.sendMessage(matchResult.replyText, message.threadId, message.type);

      // Log outgoing reply
      await this.msgLogger.logMessage({
        accountId,
        threadId: message.threadId,
        threadType,
        msgId: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderUid: "bot_self",
        senderName: "AutoReply Bot",
        content: matchResult.replyText,
        isSelf: true,
      });
    } catch (err: unknown) {
      logger.error({ err, accountId, threadId: message.threadId }, "Failed to send auto-reply");
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
