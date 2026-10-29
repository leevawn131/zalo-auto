import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { ThreadType, type Message, type Undo, type API } from "zca-js";
import { prisma } from "../../../config/database.js";
import { AutoReplyService } from "../auto-reply.service.js";
import { RuleMatcher } from "../rule-matcher.js";
import { AutoReplyRateLimiter } from "../rate-limiter.js";
import { MessageLoggerService } from "../message-logger.service.js";

describe("AutoReplyService (Incoming Messages & Revoked Logging)", () => {
  let service: AutoReplyService;
  let limiter: AutoReplyRateLimiter;
  let mockApi: { sendMessage: ReturnType<typeof vi.fn> };
  let accountId: string;
  let userId: string;

  beforeEach(async () => {
    await prisma.messageEvent.deleteMany({});
    await prisma.autoReplyRule.deleteMany({});
    await prisma.botConfiguration.deleteMany({});
    await prisma.zaloSession.deleteMany({});
    await prisma.zaloAccount.deleteMany({});
    await prisma.user.deleteMany({});

    // Create user & account
    const user = await prisma.user.create({
      data: { email: "bot_owner@example.com", passwordHash: "dummy" },
    });
    userId = user.id;

    const account = await prisma.zaloAccount.create({
      data: {
        userId: user.id,
        zaloId: "zalo_bot_owner_uid",
        displayName: "Bot Owner",
        status: "ONLINE",
      },
    });
    accountId = account.id;

    // Create BotConfig & Rule
    const botConfig = await prisma.botConfiguration.create({
      data: {
        accountId: account.id,
        isEnabled: true,
        delayMinMs: 0,
        delayMaxMs: 0,
        replyInPrivate: true,
        replyInGroup: false,
        replySelf: false,
      },
    });

    await prisma.autoReplyRule.create({
      data: {
        botConfigId: botConfig.id,
        keyword: "tư vấn",
        matchType: "CONTAINS",
        replyMessage: "Dạ em hỗ trợ tư vấn cho anh/chị ngay đây ạ!",
        isEnabled: true,
        priority: 1,
      },
    });

    limiter = new AutoReplyRateLimiter();
    mockApi = {
      sendMessage: vi.fn().mockResolvedValue({ message: { msgId: 100 }, attachment: [] }),
    };

    service = new AutoReplyService(new RuleMatcher(), limiter, new MessageLoggerService());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should match incoming message, send reply via api.sendMessage, and log to DB", async () => {
    const incomingMsg: Partial<Message> = {
      type: ThreadType.User,
      threadId: "user_thread_456",
      isSelf: false,
      data: {
        content: "Em cần tư vấn gói bot Zalo",
        msgId: "msg_zalo_101",
        cliMsgId: "cli_101",
        uidFrom: "customer_uid_777",
        dName: "Khách Hàng A",
      } as never,
    };

    await service.handleIncomingMessage(accountId, mockApi as unknown as API, incomingMsg as Message);

    // Verify api.sendMessage called with expected text
    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      "Dạ em hỗ trợ tư vấn cho anh/chị ngay đây ạ!",
      "user_thread_456",
      ThreadType.User
    );

    // Verify incoming message and outgoing reply were logged into PostgreSQL
    const loggedMessages = await prisma.messageEvent.findMany({
      where: { accountId },
      orderBy: { createdAt: "asc" },
    });

    expect(loggedMessages.length).toBe(2);
    expect(loggedMessages[0].content).toBe("Em cần tư vấn gói bot Zalo");
    expect(loggedMessages[0].isSelf).toBe(false);
    expect(loggedMessages[0].isRevoked).toBe(false);

    expect(loggedMessages[1].content).toBe("Dạ em hỗ trợ tư vấn cho anh/chị ngay đây ạ!");
    expect(loggedMessages[1].isSelf).toBe(true);
  });

  it("should not reply to self message when replySelf is false", async () => {
    const selfMsg: Partial<Message> = {
      type: ThreadType.User,
      threadId: "user_thread_456",
      isSelf: true,
      data: {
        content: "Tin nhắn của chính tôi cần tư vấn",
        msgId: "msg_zalo_self",
        uidFrom: "my_uid",
      } as never,
    };

    await service.handleIncomingMessage(accountId, mockApi as unknown as API, selfMsg as Message);
    expect(mockApi.sendMessage).not.toHaveBeenCalled();
  });

  it("should mark message as isRevoked=true when undo event is received (anti-revoke)", async () => {
    // 1. Log an incoming message first
    const incomingMsg: Partial<Message> = {
      type: ThreadType.User,
      threadId: "user_thread_456",
      isSelf: false,
      data: {
        content: "Tin nhắn bí mật sắp bị gỡ",
        msgId: "msg_to_be_revoked_999",
        uidFrom: "sender_xyz",
      } as never,
    };

    await service.handleIncomingMessage(accountId, mockApi as unknown as API, incomingMsg as Message);

    let logged = await prisma.messageEvent.findFirst({
      where: { accountId, msgId: "msg_to_be_revoked_999" },
    });
    expect(logged?.isRevoked).toBe(false);

    // 2. Sender revokes the message -> Zalo fires undo event
    const undoEvent: Partial<Undo> = {
      data: {
        msgId: "msg_to_be_revoked_999",
      } as never,
    };

    await service.handleUndoEvent(accountId, undoEvent as Undo);

    // 3. Verify message is still preserved in DB but marked as isRevoked = true
    logged = await prisma.messageEvent.findFirst({
      where: { accountId, msgId: "msg_to_be_revoked_999" },
    });

    expect(logged?.isRevoked).toBe(true);
    expect(logged?.revokedAt).toBeDefined();
    expect(logged?.content).toBe("Tin nhắn bí mật sắp bị gỡ");
  });

  it("should send reply with image attachment when rule has replyImageUrl", async () => {
    // Mock resolveImagePath
    vi.spyOn(service, "resolveImagePath").mockResolvedValue("/tmp/mock_image.png");

    const botConfig = await prisma.botConfiguration.findUnique({
      where: { accountId },
    });

    await prisma.autoReplyRule.create({
      data: {
        botConfigId: botConfig!.id,
        keyword: "bảng giá",
        matchType: "CONTAINS",
        replyMessage: "Dạ đây là bảng giá dịch vụ bên em ạ:",
        replyImageUrl: "/uploads/bang_gia.png",
        isEnabled: true,
        priority: 10,
      },
    });

    const incomingMsg: Partial<Message> = {
      type: ThreadType.User,
      threadId: "user_thread_456",
      isSelf: false,
      data: {
        content: "Cho mình xin bảng giá với",
        msgId: "msg_price_202",
        cliMsgId: "cli_202",
        uidFrom: "customer_uid_777",
        dName: "Khách Hàng B",
      } as never,
    };

    await service.handleIncomingMessage(accountId, mockApi as unknown as API, incomingMsg as Message);

    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      {
        msg: "Dạ đây là bảng giá dịch vụ bên em ạ:",
        attachments: ["/tmp/mock_image.png"],
      },
      "user_thread_456",
      ThreadType.User
    );
  });
});
