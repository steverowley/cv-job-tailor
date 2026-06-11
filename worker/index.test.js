import { describe, expect, it } from "vitest";
import worker from "./index.js";

const ALLOWED_ORIGIN = "https://steverowley.github.io";

function makeRequest(path, { method = "GET", origin = ALLOWED_ORIGIN, headers = {}, body } = {}) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { ...(origin ? { origin } : {}), ...headers },
    body,
  });
}

describe("worker router", () => {
  it("answers OPTIONS preflight with 204 and CORS headers", async () => {
    const response = await worker.fetch(makeRequest("/analyse", { method: "OPTIONS" }), {});
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  });

  it("reports secret configuration on GET /status", async () => {
    const response = await worker.fetch(makeRequest("/status"), {
      OPENAI_API_KEY: "sk-test",
      ANALYSE_SHARED_SECRET: "hunter2",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      hasOpenAiKey: true,
      requiresSharedSecret: true,
      hasJinaKey: false,
    });
  });

  it("rejects browser calls from unknown origins", async () => {
    const response = await worker.fetch(
      makeRequest("/analyse", { method: "POST", origin: "https://evil.example" }),
      {},
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  });

  it("returns 404 with usage hint for unknown routes", async () => {
    const response = await worker.fetch(makeRequest("/nope", { method: "POST" }), {});
    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/POST \/analyse/);
  });

  it("requires the shared secret on POST /read when configured", async () => {
    const response = await worker.fetch(
      makeRequest("/read", { method: "POST", body: JSON.stringify({ url: "https://example.com" }) }),
      { ANALYSE_SHARED_SECRET: "hunter2" },
    );
    expect(response.status).toBe(401);
  });

  it("reports the missing OpenAI key on POST /analyse", async () => {
    const response = await worker.fetch(makeRequest("/analyse", { method: "POST" }), {});
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/OPENAI_API_KEY/);
  });

  it("reports the missing OpenAI key on POST /design-cv-html", async () => {
    const response = await worker.fetch(makeRequest("/design-cv-html", { method: "POST" }), {});
    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/OPENAI_API_KEY/);
  });

  it("converts uncaught handler errors into CORS-bearing JSON 500s", async () => {
    // A request with no JSON body makes /analyse's request.json() throw inside
    // its own try/catch, so force an error earlier: a malformed URL object is
    // not possible here, so use a request whose body stream errors instead.
    const failing = new Request("https://worker.test/read", {
      method: "POST",
      headers: { origin: ALLOWED_ORIGIN },
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error("boom"));
        },
      }),
      duplex: "half",
    });
    const response = await worker.fetch(failing, {});
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
