import { describe, expect, it } from "vitest";
import { sanitizeBrandHint } from "./design-cv-html.js";

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
