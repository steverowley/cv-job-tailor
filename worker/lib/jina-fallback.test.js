import { describe, expect, it } from "vitest";
import { explainUpstreamStatus, shouldRetryViaReaderProxy } from "./jina-fallback.js";

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
