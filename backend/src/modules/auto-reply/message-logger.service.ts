import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";
import { TenantAccessDeniedError } from "../zalo-auth/zalo-auth.errors.js";

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
}

export const messageLogger = new MessageLoggerService();
