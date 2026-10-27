import { describe, it, expect } from "vitest";
import { RuleMatcher } from "../rule-matcher.js";
import { MatchType, type RuleDefinition } from "../auto-reply.types.js";

describe("RuleMatcher", () => {
  const matcher = new RuleMatcher();

  const mockRules: RuleDefinition[] = [
    {
      id: "r1",
      keyword: "xin chào",
      matchType: MatchType.EXACT,
      replyMessage: "Chào bạn! Tôi có thể giúp gì?",
      isEnabled: true,
      priority: 10,
    },
    {
      id: "r2",
      keyword: "giá",
      matchType: MatchType.CONTAINS,
      replyMessage: "Dạ gói cơ bản là 100k/tháng ạ.",
      isEnabled: true,
      priority: 5,
    },
    {
      id: "r3",
      keyword: "^(tư vấn|báo giá)$",
      matchType: MatchType.REGEX,
      replyMessage: "Vui lòng để lại số điện thoại nhân viên sẽ gọi lại.",
      isEnabled: true,
      priority: 20, // Higher priority than r1 & r2
    },
    {
      id: "r4",
      keyword: "tắt",
      matchType: MatchType.EXACT,
      replyMessage: "Quy tắc bị tắt",
      isEnabled: false,
      priority: 100,
    },
  ];

  it("should match EXACT keyword case-insensitively", () => {
    const res = matcher.match("Xin Chào", mockRules);
    expect(res.matched).toBe(true);
    expect(res.ruleId).toBe("r1");
    expect(res.replyText).toBe("Chào bạn! Tôi có thể giúp gì?");
  });

  it("should match CONTAINS keyword anywhere in the sentence", () => {
    const res = matcher.match("Cho mình xin giá sản phẩm với", mockRules);
    expect(res.matched).toBe(true);
    expect(res.ruleId).toBe("r2");
    expect(res.replyText).toBe("Dạ gói cơ bản là 100k/tháng ạ.");
  });

  it("should match REGEX pattern and prioritize higher priority rules", () => {
    const res = matcher.match("báo giá", mockRules);
    // Even though "giá" in r2 would match, r3 has priority 20 vs r2's priority 5
    expect(res.matched).toBe(true);
    expect(res.ruleId).toBe("r3");
    expect(res.replyText).toBe("Vui lòng để lại số điện thoại nhân viên sẽ gọi lại.");
  });

  it("should ignore disabled rules", () => {
    const res = matcher.match("tắt", mockRules);
    expect(res.matched).toBe(false);
  });

  it("should safely handle invalid or ReDoS regex patterns without throwing", () => {
    const dangerousRules: RuleDefinition[] = [
      {
        id: "evil",
        keyword: "(a+)+b", // classic ReDoS pattern
        matchType: MatchType.REGEX,
        replyMessage: "evil",
        isEnabled: true,
        priority: 1,
      },
      {
        id: "broken",
        keyword: "[unclosed-bracket",
        matchType: MatchType.REGEX,
        replyMessage: "broken",
        isEnabled: true,
        priority: 1,
      },
    ];

    expect(() => matcher.match("aaaaaaaaaaaaa", dangerousRules)).not.toThrow();
    const res = matcher.match("aaaaaaaaaaaaa", dangerousRules);
    expect(res.matched).toBe(false);
  });
});
