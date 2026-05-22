import { describe, expect, it } from "vitest";
import {
  isAllowedStylesheetUrl,
  isPrivateOrLocalHost,
  validateTargetUrl,
} from "./index.js";

describe("isPrivateOrLocalHost", () => {
  it.each([
    "localhost",
    "example.localhost",
    "foo.local",
    "service.internal",
    "127.0.0.1",
    "127.0.0.5",
    "10.0.0.1",
    "10.255.255.255",
    "192.168.1.1",
    "172.16.0.1",
    "172.20.0.1",
    "172.31.255.255",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
  ])("classifies %s as private/local", (host) => {
    expect(isPrivateOrLocalHost(host)).toBe(true);
  });

  it.each([
    "example.com",
    "8.8.8.8",
    "172.32.0.1",
    "172.15.255.255",
    "11.0.0.1",
    "169.255.0.1",
    "2606:4700:4700::1111",
  ])("classifies %s as public", (host) => {
    expect(isPrivateOrLocalHost(host)).toBe(false);
  });

  it("strips IPv6 brackets before evaluating", () => {
    expect(isPrivateOrLocalHost("[::1]")).toBe(true);
  });
});

describe("validateTargetUrl", () => {
  it("returns the normalised URL for a public https target", () => {
    expect(validateTargetUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  it("rejects empty and non-string input", () => {
    expect(() => validateTargetUrl("")).toThrow(/Missing URL/);
    expect(() => validateTargetUrl("   ")).toThrow(/Missing URL/);
    // @ts-expect-error — intentional non-string
    expect(() => validateTargetUrl(undefined)).toThrow(/Missing URL/);
  });

  it.each(["ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/plain,hi"])(
    "rejects non-http(s) protocols (%s)",
    (url) => {
      // URL("javascript:...") parses but the protocol check should fail before fetch.
      // URL("data:...") similarly parses but is rejected.
      expect(() => validateTargetUrl(url)).toThrow(/http and https/);
    },
  );

  it.each([
    "http://127.0.0.1/admin",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:8080/",
    "http://foo.internal/",
    "http://[::1]/",
    "http://[fc00::1]/",
  ])("rejects private/internal hosts (%s)", (url) => {
    expect(() => validateTargetUrl(url)).toThrow(/internal or private hosts/);
  });
});

describe("isAllowedStylesheetUrl", () => {
  const base = new URL("https://example.com/jobs/123");

  it("allows the same host", () => {
    expect(isAllowedStylesheetUrl("https://example.com/style.css", base)).toBe(true);
  });

  it("allows a subdomain of the base host", () => {
    expect(isAllowedStylesheetUrl("https://cdn.example.com/style.css", base)).toBe(true);
  });

  it("allows fonts.googleapis.com regardless of base", () => {
    expect(isAllowedStylesheetUrl("https://fonts.googleapis.com/css2?family=Inter", base)).toBe(
      true,
    );
  });

  it("rejects unrelated third-party hosts", () => {
    expect(isAllowedStylesheetUrl("https://attacker.example/style.css", base)).toBe(false);
  });

  it("rejects private hosts even when same-origin nominally matches", () => {
    expect(isAllowedStylesheetUrl("http://127.0.0.1/style.css", base)).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(isAllowedStylesheetUrl("file:///etc/passwd", base)).toBe(false);
  });
});
