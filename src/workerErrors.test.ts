import { describe, expect, it } from "vitest";
import { rateLimitMessage } from "./workerErrors";

function responseWithRetryAfter(value?: string): Response {
  return new Response("blocked", {
    status: 429,
    headers: value ? { "retry-after": value } : {},
  });
}

describe("rateLimitMessage", () => {
  it("uses Retry-After seconds when present", () => {
    expect(rateLimitMessage(responseWithRetryAfter("30"))).toMatch(/about 30 seconds/);
  });

  it("rounds long waits up to minutes", () => {
    expect(rateLimitMessage(responseWithRetryAfter("3600"))).toMatch(/about 60 minutes/);
  });

  it("passes through an HTTP-date Retry-After", () => {
    const message = rateLimitMessage(responseWithRetryAfter("Wed, 11 Jun 2026 14:00:00 GMT"));
    expect(message).toMatch(/after Wed, 11 Jun 2026/);
  });

  it("falls back to a generic wait when Retry-After is absent", () => {
    expect(rateLimitMessage(responseWithRetryAfter())).toMatch(/in a minute/);
  });
});
