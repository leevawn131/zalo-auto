import type { ThreadType } from "zca-js";

export enum MatchType {
  EXACT = "EXACT",
  CONTAINS = "CONTAINS",
  REGEX = "REGEX",
}

export interface RuleDefinition {
  id: string;
  keyword: string;
  matchType: MatchType | string;
  replyMessage: string;
  replyImageUrl?: string | null;
  isEnabled: boolean;
  priority: number;
}

export interface BotConfigData {
  id: string;
  accountId: string;
  isEnabled: boolean;
  rateLimitPerMinute: number;
  delayMinMs: number;
  delayMaxMs: number;
  replySelf: boolean;
  replyInGroup: boolean;
  replyInPrivate: boolean;
}

export interface IncomingMessageContext {
  accountId: string;
  threadId: string;
  threadType: ThreadType;
  msgId: string;
  cliMsgId?: string;
  senderUid: string;
  senderName?: string;
  content: string;
  isSelf: boolean;
  timestamp: number;
}

export interface AutoReplyResult {
  matched: boolean;
  ruleId?: string;
  replyText?: string;
  replyImageUrl?: string | null;
  reason?: string;
}
