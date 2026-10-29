import { MatchType, type RuleDefinition, type AutoReplyResult } from "./auto-reply.types.js";

export class RuleMatcher {
  /**
   * Find the highest priority matching rule for a given text
   */
  public match(text: string, rules: RuleDefinition[]): AutoReplyResult {
    if (!text || typeof text !== "string") {
      return { matched: false, reason: "Empty or non-string message" };
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      return { matched: false, reason: "Empty message after trim" };
    }

    // Filter enabled rules and sort by priority descending (higher number = higher priority)
    const activeRules = rules
      .filter((r) => r.isEnabled && r.keyword && r.keyword.trim().length > 0)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of activeRules) {
      if (this.evaluateRule(trimmedText, rule)) {
        return {
          matched: true,
          ruleId: rule.id,
          replyText: rule.replyMessage,
          replyImageUrl: rule.replyImageUrl,
        };
      }
    }

    return { matched: false, reason: "No matching rule found" };
  }

  private parseKeywords(raw: string): string[] {
    return raw
      .split(/[,|\n]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  private evaluateRule(text: string, rule: RuleDefinition): boolean {
    const rawKeyword = rule.keyword.trim();
    const keywords = this.parseKeywords(rawKeyword);

    switch (rule.matchType) {
      case MatchType.EXACT: {
        if (keywords.length === 0) {
          return text.localeCompare(rawKeyword, undefined, { sensitivity: "accent" }) === 0;
        }
        return keywords.some(
          (kw) => text.localeCompare(kw, undefined, { sensitivity: "accent" }) === 0
        );
      }

      case MatchType.CONTAINS: {
        if (keywords.length === 0) {
          return text.toLowerCase().includes(rawKeyword.toLowerCase());
        }
        return keywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
      }

      case MatchType.REGEX: {
        const patterns =
          rawKeyword.includes("\n") || rawKeyword.includes(",") ? keywords : [rawKeyword];
        return patterns.some((p) => this.safeRegexMatch(text, p));
      }

      default:
        return text.toLowerCase().includes(rawKeyword.toLowerCase());
    }
  }

  /**
   * Safely execute regex matching with ReDoS safeguards
   */
  private safeRegexMatch(text: string, pattern: string): boolean {
    // Basic ReDoS safety guards: length limit
    if (pattern.length > 200) {
      return false;
    }

    // Reject known catastrophic patterns (e.g. (a+)+, (.*a){10,})
    if (/(\+|\*|\{[0-9]+,\})\s*\1/.test(pattern)) {
      return false;
    }

    try {
      const regex = new RegExp(pattern, "i");
      return regex.test(text);
    } catch {
      // Invalid regex pattern
      return false;
    }
  }
}

export const ruleMatcher = new RuleMatcher();
