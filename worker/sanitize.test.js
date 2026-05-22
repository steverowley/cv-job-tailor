import { describe, expect, it } from "vitest";
import {
  decodeHtmlAndCssEscapes,
  injectGeneratedHtmlCsp,
  sanitizeGeneratedHtml,
} from "./index.js";

const MINIMAL_DOC =
  '<!DOCTYPE html><html><head><style>body{color:#000}</style></head><body><h1>CV</h1></body></html>';

describe("sanitizeGeneratedHtml", () => {
  it("accepts a minimal valid document and injects the CSP meta tag", () => {
    const out = sanitizeGeneratedHtml(MINIMAL_DOC);
    expect(out).toContain('http-equiv="Content-Security-Policy"');
    expect(out).toContain("default-src 'none'");
    expect(out.indexOf("<head>")).toBeLessThan(out.indexOf("Content-Security-Policy"));
  });

  it("rejects empty or non-string input", () => {
    expect(() => sanitizeGeneratedHtml("")).toThrow(/non-empty string/);
    expect(() => sanitizeGeneratedHtml("   ")).toThrow(/non-empty string/);
    // @ts-expect-error — intentional non-string
    expect(() => sanitizeGeneratedHtml(null)).toThrow(/non-empty string/);
  });

  it("rejects input that does not start with <!DOCTYPE html>", () => {
    expect(() => sanitizeGeneratedHtml("<html><head></head><body></body></html>")).toThrow(
      /must start with <!DOCTYPE html>/,
    );
  });

  it.each([
    ["<script", '<!DOCTYPE html><html><head></head><body><script>alert(1)</script></body></html>'],
    [
      "<iframe",
      '<!DOCTYPE html><html><head></head><body><iframe src="x"></iframe></body></html>',
    ],
    [
      "<object",
      '<!DOCTYPE html><html><head></head><body><object data="x"></object></body></html>',
    ],
    ["<embed", '<!DOCTYPE html><html><head></head><body><embed src="x"></body></html>'],
    [
      "<form",
      '<!DOCTYPE html><html><head></head><body><form action="x"></form></body></html>',
    ],
    [
      "<base",
      '<!DOCTYPE html><html><head><base href="http://attacker.example/"></head><body></body></html>',
    ],
    [
      "http-equiv",
      '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=http://x"></head><body></body></html>',
    ],
    [
      "javascript:",
      '<!DOCTYPE html><html><head></head><body><a href="javascript:alert(1)">x</a></body></html>',
    ],
    [
      "vbscript:",
      '<!DOCTYPE html><html><head></head><body><a href="vbscript:msgbox(1)">x</a></body></html>',
    ],
    [
      "data:text/html",
      '<!DOCTYPE html><html><head></head><body><img src="data:text/html;base64,PHNjcmlwdD4="></body></html>',
    ],
    [
      "expression(",
      '<!DOCTYPE html><html><head><style>body{width:expression(alert(1))}</style></head><body></body></html>',
    ],
  ])("rejects raw %s", (_label, doc) => {
    expect(() => sanitizeGeneratedHtml(doc)).toThrow(/forbidden token/);
  });

  it("rejects event-handler attributes whether whitespace- or slash-separated", () => {
    const onspaced =
      '<!DOCTYPE html><html><head></head><body><div onclick="alert(1)"></div></body></html>';
    const onslashed =
      '<!DOCTYPE html><html><head></head><body><svg/onload="alert(1)"></svg></body></html>';
    expect(() => sanitizeGeneratedHtml(onspaced)).toThrow(/event-handler attribute/);
    expect(() => sanitizeGeneratedHtml(onslashed)).toThrow(/event-handler attribute/);
  });

  it("decodes CSS unicode escapes before scanning so they cannot hide forbidden tokens", () => {
    // \65 = e, \78 = x, \70 = p, \72 = r, \65 = e, \73 = s, \73 = s, \69 = i, \6f = o, \6e = n
    // "expression" entirely escaped, followed by literal "(".
    const css =
      "body{width:\\65\\78\\70\\72\\65\\73\\73\\69\\6f\\6e(alert(1))}";
    const doc = `<!DOCTYPE html><html><head><style>${css}</style></head><body></body></html>`;
    expect(() => sanitizeGeneratedHtml(doc)).toThrow(/forbidden token/);
  });

  it("decodes HTML entity escapes before scanning", () => {
    // &#x3c;script&#x3e; — angle brackets via hex entities
    const doc =
      "<!DOCTYPE html><html><head></head><body>&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;</body></html>";
    expect(() => sanitizeGeneratedHtml(doc)).toThrow(/forbidden token/);
  });

  it("rejects oversized documents", () => {
    const filler = "x".repeat(220_000);
    const doc = `<!DOCTYPE html><html><head></head><body>${filler}</body></html>`;
    expect(() => sanitizeGeneratedHtml(doc)).toThrow(/larger than/);
  });
});

describe("decodeHtmlAndCssEscapes", () => {
  it("decodes CSS hex escapes (\\XX optionally followed by whitespace)", () => {
    expect(decodeHtmlAndCssEscapes("\\41")).toBe("A");
    expect(decodeHtmlAndCssEscapes("\\000041")).toBe("A");
    expect(decodeHtmlAndCssEscapes("\\41 BC")).toBe("ABC");
  });

  it("decodes HTML hex entities (&#xNN;) and decimal entities (&#NN;)", () => {
    expect(decodeHtmlAndCssEscapes("&#x41;")).toBe("A");
    expect(decodeHtmlAndCssEscapes("&#65;")).toBe("A");
  });

  it("drops codepoints outside the valid Unicode range", () => {
    expect(decodeHtmlAndCssEscapes("\\ffffff")).toBe("");
    expect(decodeHtmlAndCssEscapes("&#x110000;")).toBe("");
  });
});

describe("injectGeneratedHtmlCsp", () => {
  it("inserts the CSP meta tag immediately after <head>", () => {
    const html =
      "<!DOCTYPE html><html><head><title>x</title></head><body></body></html>";
    const out = injectGeneratedHtmlCsp(html);
    expect(out).toMatch(/<head><meta http-equiv="Content-Security-Policy"/);
  });

  it("creates a <head> when only <html> is present", () => {
    const html = "<!DOCTYPE html><html><body></body></html>";
    const out = injectGeneratedHtmlCsp(html);
    expect(out).toMatch(/<html><head><meta http-equiv="Content-Security-Policy"/);
  });

  it("throws when neither <html> nor <head> is present", () => {
    expect(() => injectGeneratedHtmlCsp("<!DOCTYPE html><body></body>")).toThrow(/must contain/);
  });
});
