import { describe, expect, it } from "vitest";
import { requireSharedSecret, timingSafeEqual } from "./auth.js";

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

describe("requireSharedSecret", () => {
  const requestWithAuth = (value) =>
    new Request("https://worker.test/read", {
      method: "POST",
      headers: value ? { authorization: value } : {},
    });

  it("allows every request when no shared secret is configured", () => {
    expect(requireSharedSecret(requestWithAuth(""), {})).toBe(true);
    expect(requireSharedSecret(requestWithAuth("Bearer anything"), {})).toBe(true);
  });

  it("requires a matching Bearer token when the secret is configured", () => {
    const env = { ANALYSE_SHARED_SECRET: "hunter2" };
    expect(requireSharedSecret(requestWithAuth("Bearer hunter2"), env)).toBe(true);
    expect(requireSharedSecret(requestWithAuth("Bearer wrong"), env)).toBe(false);
    expect(requireSharedSecret(requestWithAuth(""), env)).toBe(false);
  });

  it("rejects non-Bearer authorization schemes", () => {
    const env = { ANALYSE_SHARED_SECRET: "hunter2" };
    expect(requireSharedSecret(requestWithAuth("Basic hunter2"), env)).toBe(false);
  });
});
