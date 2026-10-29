import type { API } from "zca-js";
import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { TenantAccessDeniedError } from "../zalo-auth/zalo-auth.errors.js";
import { groupManager } from "./group-manager.service.js";

export interface LogMessageParams {
  accountId: string;
  threadId: string;
  threadType: "USER" | "GROUP";
  msgId: string;
  cliMsgId?: string;
  senderUid: string;
  senderName?: string;
  content: string;
  isSelf?: boolean;
  rawPayload?: Record<string, unknown>;
}

export class MessageLoggerService {
  /**
   * Log incoming or outgoing message into PostgreSQL
   */
  public async logMessage(params: LogMessageParams) {
    try {
      return await prisma.messageEvent.create({
        data: {
          accountId: params.accountId,
          threadId: params.threadId,
          threadType: params.threadType,
          msgId: params.msgId,
          cliMsgId: params.cliMsgId,
          senderUid: params.senderUid,
          senderName: params.senderName,
          content: params.content,
          isSelf: params.isSelf ?? false,
          isRevoked: false,
          rawPayload: params.rawPayload ? JSON.stringify(params.rawPayload) : null,
        },
      });
    } catch (err: unknown) {
      logger.error({ err, msgId: params.msgId }, "Failed to log message event");
      return null;
    }
  }

  /**
   * Mark message as revoked (gỡ tin nhắn) when Zalo sends undo event
   */
  public async markMessageRevoked(params: {
    accountId: string;
    msgId?: string;
    cliMsgId?: string;
  }) {
    const { accountId, msgId, cliMsgId } = params;
    logger.info({ accountId, msgId, cliMsgId }, "Received message revocation event");

    try {
      const updateResult = await prisma.messageEvent.updateMany({
        where: {
          accountId,
          OR: [
            ...(msgId ? [{ msgId }] : []),
            ...(cliMsgId ? [{ cliMsgId }] : []),
          ],
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });

      logger.info(
        { accountId, count: updateResult.count },
        "Marked message(s) as revoked in DB"
      );
      return updateResult.count > 0;
    } catch (err: unknown) {
      logger.error({ err, accountId, msgId }, "Failed to update revoked message status");
      return false;
    }
  }

  /**
   * Retrieve message logs for a tenant's account
   */
  public async getMessageLogs(
    accountId: string,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      revokedOnly?: boolean;
      threadId?: string;
    } = {}
  ) {
    // Strict tenant access check
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return null;
    }

    if (account.userId !== userId) {
      throw new TenantAccessDeniedError(userId, accountId);
    }

    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const skip = (page - 1) * limit;

    const where = {
      accountId,
      ...(options.revokedOnly ? { isRevoked: true } : {}),
      ...(options.threadId ? { threadId: options.threadId } : {}),
    };

    const [total, messages] = await Promise.all([
      prisma.messageEvent.count({ where }),
      prisma.messageEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      messages,
    };
  }

  /**
   * Retrieve conversation threads grouped by user / group
   */
  public async getConversationThreads(
    accountId: string,
    userId: string,
    options: {
      type?: "ALL" | "USER" | "GROUP";
      search?: string;
      api?: API;
    } = {}
  ) {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) return null;
    if (account.userId !== userId) {
      throw new TenantAccessDeniedError(userId, accountId);
    }

    const where = {
      accountId,
      ...(options.type && options.type !== "ALL" ? { threadType: options.type } : {}),
    };

    const threadGroups = await prisma.messageEvent.groupBy({
      by: ["threadId", "threadType"],
      where,
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: {
        _max: { createdAt: "desc" },
      },
    });

    // Resolve group metadata in batch
    const groupThreadIds = threadGroups
      .filter((g) => g.threadType === "GROUP")
      .map((g) => g.threadId);
    const groupMetaMap = await groupManager.getGroupNames(accountId, groupThreadIds, options.api);

    const threads = await Promise.all(
      threadGroups.map(async (group) => {
        const [latestMsg, latestOtherMsg, botCount, revokedCount] = await Promise.all([
          prisma.messageEvent.findFirst({
            where: { accountId, threadId: group.threadId },
            orderBy: { createdAt: "desc" },
          }),
          prisma.messageEvent.findFirst({
            where: { accountId, threadId: group.threadId, isSelf: false },
            orderBy: { createdAt: "desc" },
          }),
          prisma.messageEvent.count({
            where: { accountId, threadId: group.threadId, isSelf: true },
          }),
          prisma.messageEvent.count({
            where: { accountId, threadId: group.threadId, isRevoked: true },
          }),
        ]);

        let name = "";
        let avatar: string | null = null;
        if (group.threadType === "USER") {
          name = latestOtherMsg?.senderName || latestMsg?.senderName || `Khách hàng (${group.threadId.slice(-4)})`;
        } else {
          const groupMeta = groupMetaMap.get(group.threadId);
          if (groupMeta?.name) {
            name = groupMeta.name;
            avatar = groupMeta.avatar || null;
          } else {
            name = `Nhóm ${group.threadId.slice(-4)}`;
          }
        }

        const totalMessages = group._count.id;
        const userMessages = totalMessages - botCount;

        return {
          threadId: group.threadId,
          threadType: group.threadType as "USER" | "GROUP",
          name,
          avatar,
          totalMessages,
          botMessages: botCount,
          userMessages,
          revokedCount,
          lastMessage: latestMsg
            ? {
                content: latestMsg.content,
                createdAt: latestMsg.createdAt.toISOString(),
                isSelf: latestMsg.isSelf,
                isRevoked: latestMsg.isRevoked,
                senderName: latestMsg.senderName || (latestMsg.isSelf ? "Bot" : "Khách"),
              }
            : null,
          updatedAt: group._max.createdAt ? group._max.createdAt.toISOString() : new Date().toISOString(),
        };
      })
    );

    let result = threads;
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      result = threads.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.threadId.toLowerCase().includes(q) ||
          (t.lastMessage?.content && t.lastMessage.content.toLowerCase().includes(q))
      );
    }

    return {
      threads: result,
      totalThreads: result.length,
      totalMessages: threads.reduce((acc, t) => acc + t.totalMessages, 0),
    };
  }
}

export const messageLogger = new MessageLoggerService();
