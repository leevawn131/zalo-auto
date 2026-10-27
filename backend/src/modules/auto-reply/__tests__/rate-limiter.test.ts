import { describe, it, expect, beforeEach } from "vitest";
import { AutoReplyRateLimiter } from "../rate-limiter.js";

describe("AutoReplyRateLimiter", () => {
  let limiter: AutoReplyRateLimiter;

  beforeEach(() => {
    limiter = new AutoReplyRateLimiter();
  });

  it("should detect duplicate message IDs", () => {
    expect(limiter.isDuplicateMessage("msg_001")).toBe(false);
    expect(limiter.isDuplicateMessage("msg_001")).toBe(true);
    expect(limiter.isDuplicateMessage("msg_002")).toBe(false);
  });

  it("should enforce sliding window rate limit per account", () => {
    const accountId = "acc_test_rate";
    const maxLimit = 3;

    expect(limiter.isRateLimited(accountId, maxLimit)).toBe(false); // 1
    expect(limiter.isRateLimited(accountId, maxLimit)).toBe(false); // 2
    expect(limiter.isRateLimited(accountId, maxLimit)).toBe(false); // 3
    // 4th request exceeds max limit of 3
    expect(limiter.isRateLimited(accountId, maxLimit)).toBe(true);
  });

  it("should detect loop risk when replying to the same thread within debounce window", () => {
    const accountId = "acc_loop";
    const threadId = "thread_123";

    expect(limiter.isLoopRisk(accountId, threadId, 1000)).toBe(false);
    // Immediate subsequent reply should flag loop risk
    expect(limiter.isLoopRisk(accountId, threadId, 1000)).toBe(true);
  });

  it("should calculate delay within configured bounds", () => {
    for (let i = 0; i < 20; i++) {
      const delay = limiter.calculateDelay(1000, 2500);
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });
});
