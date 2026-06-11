import { describe, expect, it } from "vitest";
import { extractCssColors, extractCssFonts } from "./css-signals.js";

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
