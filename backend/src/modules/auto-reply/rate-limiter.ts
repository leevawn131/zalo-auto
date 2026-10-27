export class AutoReplyRateLimiter {
  // Store processed message IDs with TTL: key = msgId, value = timestamp
  private processedMessages = new Map<string, number>();

  // Store sliding window timestamps: key = accountId, value = array of timestamps
  private accountReplyTimestamps = new Map<string, number[]>();

  // Store last reply timestamp per thread to prevent bot ping-pong loops: key = `${accountId}:${threadId}`, value = timestamp
  private lastThreadReplies = new Map<string, number>();

  private readonly MESSAGE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private readonly THREAD_LOOP_DEBOUNCE_MS = 3000; // 3 seconds between replies in same thread

  /**
   * Check if a message has already been processed (Deduplication)
   */
  public isDuplicateMessage(msgId: string): boolean {
    this.cleanExpiredMessageCache();
    if (!msgId) return false;

    if (this.processedMessages.has(msgId)) {
      return true;
    }

    this.processedMessages.set(msgId, Date.now());
    return false;
  }

  /**
   * Check if the account has exceeded its rate limit (Sliding window)
   */
  public isRateLimited(accountId: string, maxPerMinute: number = 30): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    let timestamps = this.accountReplyTimestamps.get(accountId) || [];
    // Retain only timestamps from the last 60 seconds
    timestamps = timestamps.filter((t) => t > oneMinuteAgo);

    if (timestamps.length >= maxPerMinute) {
      return true;
    }

    timestamps.push(now);
    this.accountReplyTimestamps.set(accountId, timestamps);
    return false;
  }

  /**
   * Check if replying to this thread might cause an infinite ping-pong loop
   */
  public isLoopRisk(accountId: string, threadId: string, debounceMs: number = this.THREAD_LOOP_DEBOUNCE_MS): boolean {
    const key = `${accountId}:${threadId}`;
    const now = Date.now();
    const lastReply = this.lastThreadReplies.get(key);

    if (lastReply && now - lastReply < debounceMs) {
      return true; // Too fast, likely in a bot loop
    }

    this.lastThreadReplies.set(key, now);
    return false;
  }

  /**
   * Calculate humanized typing delay between delayMinMs and delayMaxMs
   */
  public calculateDelay(minMs: number = 1000, maxMs: number = 3000): number {
    const min = Math.max(0, minMs);
    const max = Math.max(min, maxMs);
    return Math.floor(min + Math.random() * (max - min));
  }

  private cleanExpiredMessageCache(): void {
    const now = Date.now();
    // Only clean occasionally if map exceeds 500 items
    if (this.processedMessages.size > 500) {
      for (const [key, timestamp] of this.processedMessages.entries()) {
        if (now - timestamp > this.MESSAGE_CACHE_TTL_MS) {
          this.processedMessages.delete(key);
        }
      }
    }
  }

  public resetForTesting(): void {
    this.processedMessages.clear;
    this.accountReplyTimestamps.clear();
    this.lastThreadReplies.clear();
  }
}

export const rateLimiter = new AutoReplyRateLimiter();
