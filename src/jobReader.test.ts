import { describe, expect, it } from "vitest";
import {
  buildFallbackBrand,
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

  it("derives a layout style from technical keywords", () => {
    const html = `
      <html>
        <head><title>API Engineer</title></head>
        <body><p>Build scalable platform engineering across our cloud APIs.</p></body>
      </html>
    `;
    const parsed = parseHtmlPage(html, "https://example.com");
    expect(parsed.brand.layoutStyle).toBe("technical");
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
