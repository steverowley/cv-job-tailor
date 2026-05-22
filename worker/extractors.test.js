import { describe, expect, it } from "vitest";
import {
  extractCssColors,
  extractCssFonts,
  extractOpenAIError,
  extractOpenAIStructuredAnalysis,
  explainUpstreamStatus,
  isReadableContent,
  sanitizeBrandHint,
  shouldRetryViaReaderProxy,
  timingSafeEqual,
} from "./index.js";

describe("extractOpenAIStructuredAnalysis", () => {
  it("returns null for falsy or empty inputs", () => {
    expect(extractOpenAIStructuredAnalysis(null)).toBeNull();
    expect(extractOpenAIStructuredAnalysis(undefined)).toBeNull();
    expect(extractOpenAIStructuredAnalysis({})).toBeNull();
  });

  it("parses the top-level output_text shortcut", () => {
    const payload = { output_text: JSON.stringify({ hello: "world" }) };
    expect(extractOpenAIStructuredAnalysis(payload)).toEqual({ hello: "world" });
  });

  it("falls through to per-block extraction when output_text is unparseable", () => {
    const payload = {
      output_text: "not json {{",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify({ a: 1 }) }] },
      ],
    };
    expect(extractOpenAIStructuredAnalysis(payload)).toEqual({ a: 1 });
  });

  it("accepts both output_text and text block types", () => {
    const outputText = {
      output: [{ content: [{ type: "output_text", text: '{"a":1}' }] }],
    };
    const text = {
      output: [{ content: [{ type: "text", text: '{"b":2}' }] }],
    };
    expect(extractOpenAIStructuredAnalysis(outputText)).toEqual({ a: 1 });
    expect(extractOpenAIStructuredAnalysis(text)).toEqual({ b: 2 });
  });

  it("skips blocks with unparseable JSON and continues searching", () => {
    const payload = {
      output: [
        { content: [{ type: "output_text", text: "garbage" }] },
        { content: [{ type: "output_text", text: '{"found":true}' }] },
      ],
    };
    expect(extractOpenAIStructuredAnalysis(payload)).toEqual({ found: true });
  });

  it("returns null when no parseable block is found", () => {
    const payload = {
      output: [
        { content: [{ type: "output_text", text: "garbage" }] },
        { content: [{ type: "image", url: "..." }] },
      ],
    };
    expect(extractOpenAIStructuredAnalysis(payload)).toBeNull();
  });

  it("ignores output that is not an array", () => {
    expect(extractOpenAIStructuredAnalysis({ output: "not-an-array" })).toBeNull();
  });
});

describe("extractOpenAIError", () => {
  it("returns the message from a JSON error envelope", () => {
    const body = JSON.stringify({ error: { message: "Rate limited" } });
    expect(extractOpenAIError(body)).toBe("Rate limited");
  });

  it("returns the first 500 chars of non-JSON bodies", () => {
    const body = "x".repeat(800);
    expect(extractOpenAIError(body)).toBe("x".repeat(500));
  });

  it("returns empty string when the body is missing or empty", () => {
    expect(extractOpenAIError("")).toBe("");
    // @ts-expect-error — intentional null
    expect(extractOpenAIError(null)).toBe("");
  });

  it("returns empty string when JSON has no error.message", () => {
    expect(extractOpenAIError(JSON.stringify({ status: "ok" }))).toBe("");
  });
});

describe("extractCssColors", () => {
  it("returns an empty list for empty input", () => {
    expect(extractCssColors("")).toEqual([]);
  });

  it("matches hex, rgb(a), and hsl(a) forms", () => {
    const css = "body { color: #1b4d3e; background: rgb(255, 255, 255); border: rgba(0,0,0,0.5); }" +
      " a { color: hsl(120, 50%, 50%); } strong { color: hsla(0deg, 100%, 50%, 0.5); }";
    const found = extractCssColors(css);
    expect(found).toContain("#1b4d3e");
    expect(found).toContain("rgb(255, 255, 255)");
    expect(found).toContain("rgba(0,0,0,0.5)");
    expect(found).toContain("hsl(120, 50%, 50%)");
    expect(found).toContain("hsla(0deg, 100%, 50%, 0.5)");
  });

  it("deduplicates case-insensitively", () => {
    expect(extractCssColors("a{color:#FFF}b{color:#fff}")).toEqual(["#FFF"]);
  });

  it("does not greedily extend short hex into a longer hex", () => {
    // #fff in a #fffd context should be skipped because of the lookahead.
    expect(extractCssColors("border:#fffd")).toEqual(["#fffd"]);
  });
});

describe("extractCssFonts", () => {
  it("returns an empty list for empty input", () => {
    expect(extractCssFonts("")).toEqual([]);
  });

  it("returns the first family from each font-family rule", () => {
    const css = `body { font-family: "Inter", system-ui, sans-serif; }
                 h1 { font-family: 'Playfair Display', serif; }`;
    expect(extractCssFonts(css)).toEqual(["Inter", "Playfair Display"]);
  });

  it("skips generic and CSS keyword stacks", () => {
    const css = `body { font-family: sans-serif; }
                 .a { font-family: inherit; }
                 .b { font-family: monospace; }
                 .c { font-family: var(--brand-font); }`;
    expect(extractCssFonts(css)).toEqual([]);
  });

  it("deduplicates case-insensitively", () => {
    const css = `a { font-family: Inter; } b { font-family: INTER; }`;
    expect(extractCssFonts(css)).toEqual(["Inter"]);
  });
});

describe("sanitizeBrandHint", () => {
  it("returns an empty object for non-object inputs", () => {
    expect(sanitizeBrandHint(null)).toEqual({});
    expect(sanitizeBrandHint(undefined)).toEqual({});
    expect(sanitizeBrandHint("string")).toEqual({});
  });

  it("copies allow-listed string fields and truncates them to 200 chars", () => {
    const long = "x".repeat(300);
    const result = sanitizeBrandHint({
      companyName: "Acme",
      primaryColor: "#000",
      accentColor: "#fff",
      backgroundColor: "#fafafa",
      textColor: "#111",
      fontFamily: long,
      // Not in the allowlist:
      secret: "should-be-dropped",
    });
    expect(result.companyName).toBe("Acme");
    expect(result.fontFamily).toBe("x".repeat(200));
    expect(result).not.toHaveProperty("secret");
  });

  it("caps the palette at 8 entries and truncates each to 32 chars", () => {
    const result = sanitizeBrandHint({
      palette: Array.from({ length: 20 }, (_, i) => `entry-${i}-${"x".repeat(60)}`),
    });
    expect(result.palette).toHaveLength(8);
    expect(result.palette?.every((entry) => entry.length <= 32)).toBe(true);
  });

  it("rejects non-string palette entries", () => {
    const result = sanitizeBrandHint({ palette: ["#fff", 123, null, "#000"] });
    expect(result.palette).toEqual(["#fff", "#000"]);
  });
});

describe("shouldRetryViaReaderProxy", () => {
  it.each([403, 410, 429, 451, 500, 502, 599])("retries on %d", (status) => {
    expect(shouldRetryViaReaderProxy(status)).toBe(true);
  });

  it.each([200, 301, 304, 400, 401, 404])("does not retry on %d", (status) => {
    expect(shouldRetryViaReaderProxy(status)).toBe(false);
  });
});

describe("explainUpstreamStatus", () => {
  it("returns a human-readable hint for known statuses", () => {
    expect(explainUpstreamStatus(403)).toMatch(/403/);
    expect(explainUpstreamStatus(404)).toMatch(/404/);
    expect(explainUpstreamStatus(410)).toMatch(/410/);
    expect(explainUpstreamStatus(429)).toMatch(/429/);
    expect(explainUpstreamStatus(451)).toMatch(/451/);
    expect(explainUpstreamStatus(500)).toMatch(/server error/);
  });

  it("returns a generic explanation for unknown statuses", () => {
    expect(explainUpstreamStatus(418)).toMatch(/418/);
  });
});

describe("isReadableContent", () => {
  it("accepts empty/missing content-type and the documented text types", () => {
    expect(isReadableContent("")).toBe(true);
    expect(isReadableContent("text/html; charset=utf-8")).toBe(true);
    expect(isReadableContent("text/plain")).toBe(true);
    expect(isReadableContent("application/xhtml+xml")).toBe(true);
  });

  it("rejects binary types", () => {
    expect(isReadableContent("application/pdf")).toBe(false);
    expect(isReadableContent("image/png")).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings and false otherwise", () => {
    expect(timingSafeEqual("hunter2", "hunter2")).toBe(true);
    expect(timingSafeEqual("hunter2", "hunter3")).toBe(false);
  });

  it("returns false for differing lengths without short-circuiting on length alone", () => {
    expect(timingSafeEqual("short", "longer-string")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    // @ts-expect-error — intentional misuse
    expect(timingSafeEqual(null, "x")).toBe(false);
    // @ts-expect-error — intentional misuse
    expect(timingSafeEqual("x", undefined)).toBe(false);
  });

  it("returns true for empty matched strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
