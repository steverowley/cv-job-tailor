import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisError, analyseCvAgainstJob } from "./analysis";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analyseCvAgainstJob", () => {
  it("rejects an empty Worker URL", async () => {
    await expect(
      analyseCvAgainstJob({
        workerUrl: "   ",
        jobText: "job",
        cvText: "cv",
      }),
    ).rejects.toBeInstanceOf(AnalysisError);
  });

  it("sends jobText, cvText, and employerHint as JSON to /analyse", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ analysis: { jobTitle: "Engineer", employerName: "Acme", skills: [], tailoredCv: {} } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    await analyseCvAgainstJob({
      workerUrl: "https://worker.example.com/",
      sharedSecret: "shh",
      jobText: "JOB",
      cvText: "CV",
      employerHint: "Acme",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://worker.example.com/analyse");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer shh");
    expect((init as RequestInit).body).toBe(
      JSON.stringify({ jobText: "JOB", cvText: "CV", employerHint: "Acme" }),
    );
  });

  it("surfaces the Worker error message on non-200 responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Missing key" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      analyseCvAgainstJob({
        workerUrl: "https://worker.example.com",
        jobText: "JOB",
        cvText: "CV",
      }),
    ).rejects.toMatchObject({ name: "AnalysisError", message: "Missing key", status: 500 });
  });

  it("throws when the Worker returns a 200 without an analysis", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );

    await expect(
      analyseCvAgainstJob({
        workerUrl: "https://worker.example.com",
        jobText: "JOB",
        cvText: "CV",
      }),
    ).rejects.toThrow(/did not return an analysis/);
  });
});
