import { describe, expect, it } from "vitest";
import { cleanText, looksLikeUsableCv } from "./documentParser";

describe("cleanText", () => {
  it("collapses repeated whitespace and tabs", () => {
    const cleaned = cleanText("foo   bar\t\t\tbaz");
    expect(cleaned).toBe("foo bar baz");
  });

  it("normalises line endings and trims", () => {
    expect(cleanText("  line one\r\n\r\n\r\nline two  ")).toBe("line one\n\nline two");
  });
});

describe("looksLikeUsableCv", () => {
  it("rejects very short content", () => {
    expect(looksLikeUsableCv("hello world")).toBe(false);
  });

  it("rejects content with no alphabetic words", () => {
    expect(looksLikeUsableCv("12345 ".repeat(120))).toBe(false);
  });

  it("accepts realistic CV-length text", () => {
    const cv = ("Experienced engineer with ten years of TypeScript and React work. ").repeat(20);
    expect(looksLikeUsableCv(cv)).toBe(true);
  });
});
