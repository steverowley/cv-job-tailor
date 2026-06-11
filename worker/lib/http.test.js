import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, isAbortError } from "./http.js";

describe("fetchWithTimeout", () => {
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it("returns the response when fetch resolves before the timeout fires", async () => {
    fetchSpy.mockResolvedValue(new Response("ok"));
    const response = await fetchWithTimeout("https://example.test/", {}, 1000);
    expect(await response.text()).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledOnce();
    // The fetch must have been given a signal.
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("propagates the AbortError that fires when the timeout elapses", async () => {
    fetchSpy.mockImplementation((_, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
    );
    vi.useFakeTimers();
    const promise = fetchWithTimeout("https://example.test/", {}, 1000);
    vi.advanceTimersByTime(1500);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("merges caller-supplied init fields into the fetch call", async () => {
    fetchSpy.mockResolvedValue(new Response("ok"));
    await fetchWithTimeout(
      "https://example.test/",
      { method: "POST", headers: { "X-Test": "1" } },
      1000,
    );
    const init = fetchSpy.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "X-Test": "1" });
  });
});

describe("isAbortError", () => {
  it("recognises errors with name AbortError", () => {
    const err = new Error("x");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  it("recognises errors with code ABORT_ERR", () => {
    expect(isAbortError({ code: "ABORT_ERR" })).toBe(true);
  });

  it("returns false for unrelated errors and falsy values", () => {
    expect(isAbortError(new Error("nope"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
