import { describe, expect, it } from "vitest";
import {
  buildFallbackBrand,
  deriveAccentColor,
  findFontHint,
  parseBrandSource,
  parseHtmlPage,
} from "./jobReader";

describe("parseBrandSource", () => {
  it("extracts a company name from a name: line", () => {
    const brand = parseBrandSource("Company: Acme Corp\nFounded 2010", "https://acme.example.com");
    expect(brand.companyName).toBe("Acme Corp");
  });

  it("falls back to the hostname when no name is present", () => {
    const brand = parseBrandSource("Some marketing copy", "https://contoso.example.com");
    expect(brand.companyName).toBe("contoso");
  });

  it("picks up primary and accent colours from hex codes", () => {
    const brand = parseBrandSource(
      "Brand colours: #112233 secondary #aabbcc",
      "https://acme.example.com",
    );
    expect(brand.primaryColor).toBe("#112233");
    expect(brand.accentColor).toBe("#aabbcc");
  });

  it("extracts a logo URL from an image link", () => {
    const brand = parseBrandSource(
      "Logo: https://cdn.example.com/brand/logo.png",
      "https://acme.example.com",
    );
    expect(brand.logoUrl).toBe("https://cdn.example.com/brand/logo.png");
  });
});

describe("parseHtmlPage", () => {
  it("extracts the title, body text, and meta brand colour", () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Senior Engineer — Acme</title>
          <meta name="theme-color" content="#0066cc" />
          <meta property="og:site_name" content="Acme Engineering" />
        </head>
        <body>
          <h1>Senior Engineer</h1>
          <p>We need someone with TypeScript, React, and a love of evidence-first work.</p>
        </body>
      </html>
    `;
    const parsed = parseHtmlPage(html, "https://acme.example.com/careers/se");
    expect(parsed.title).toBe("Senior Engineer — Acme");
    expect(parsed.companyName).toBe("Acme Engineering");
    expect(parsed.brand.primaryColor).toBe("#0066cc");
    expect(parsed.text).toMatch(/TypeScript/);
  });

  it("derives an accent that is not the hardcoded default when only one brand colour is present", () => {
    const html = `
      <html>
        <head>
          <meta name="theme-color" content="#0066cc" />
        </head>
        <body><p>Hello.</p></body>
      </html>
    `;
    const parsed = parseHtmlPage(html, "https://example.com");
    expect(parsed.brand.primaryColor).toBe("#0066cc");
    expect(parsed.brand.accentColor).not.toBe("#d3a84f");
    expect(parsed.brand.accentColor).not.toBe("#1f3a34");
    expect(parsed.brand.accentColor).not.toBe("#f0c75e");
    expect(parsed.brand.accentColor).not.toBe(parsed.brand.primaryColor);
    expect(parsed.brand.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("prefers a saturated brand colour over frequent neutrals", () => {
    const html = `
      <html>
        <head>
          <style>
            .a { color: #cccccc; }
            .b { color: #cccccc; background: #cccccc; border-color: #cccccc; }
            .c { color: #cccccc; }
            .brand { color: #0a7d4b; }
          </style>
        </head>
        <body><p>Hello.</p></body>
      </html>
    `;
    const parsed = parseHtmlPage(html, "https://example.com");
    expect(parsed.brand.primaryColor).toBe("#0a7d4b");
  });

  it("picks up Google Fonts family from a stylesheet link", () => {
    const html = `
      <html>
        <head>
          <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
        </head>
        <body><p>Hello.</p></body>
      </html>
    `;
    const parsed = parseHtmlPage(html, "https://example.com");
    expect(parsed.brand.fontFamily).toBe("Space Grotesk");
  });
});

describe("deriveAccentColor", () => {
  it("rotates the hue of a saturated primary to produce a related accent", () => {
    const accent = deriveAccentColor("#0066cc");
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(accent.toLowerCase()).not.toBe("#0066cc");
    expect(accent.toLowerCase()).not.toBe("#f0c75e");
    expect(accent.toLowerCase()).not.toBe("#1f3a34");
  });

  it("shifts lightness for a near-grey primary instead of falling back to a constant", () => {
    const accent = deriveAccentColor("#333333");
    expect(accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(accent.toLowerCase()).not.toBe("#333333");
    expect(accent.toLowerCase()).not.toBe("#f0c75e");
  });

  it("is deterministic for the same primary", () => {
    expect(deriveAccentColor("#22aa55")).toBe(deriveAccentColor("#22aa55"));
  });
});

describe("buildFallbackBrand", () => {
  it("uses the URL hostname as the company name", () => {
    const brand = buildFallbackBrand("https://example.co.uk/about");
    expect(brand.companyName).toBe("example");
  });

  it("returns a safe fallback for invalid URLs", () => {
    const brand = buildFallbackBrand("not a url");
    expect(brand.companyName).toBe("Target employer");
  });
});

describe("findFontHint", () => {
  it("pulls the first concrete font family", () => {
    expect(findFontHint("font-family: 'Soehne', Helvetica, sans-serif;")).toBe("Soehne");
  });

  it("ignores generic CSS values", () => {
    expect(findFontHint("font-family: var(--brand);")).toBeUndefined();
    expect(findFontHint("font-family: sans-serif;")).toBeUndefined();
  });

  it("returns undefined when there is no font hint", () => {
    expect(findFontHint("nothing useful here")).toBeUndefined();
  });
});
