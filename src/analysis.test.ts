import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisError, analyseCvAgainstJob, consumeAnalysisEventStream } from "./analysis";

afterEach(() => {
  vi.restoreAllMocks();
});

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
}

const VALID_ANALYSIS = {
  jobTitle: "Engineer",
  employerName: "Acme",
  skills: [],
  tailoredCv: { fullCv: { experience: [] } },
};

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
          JSON.stringify({
            analysis: {
              jobTitle: "Engineer",
              employerName: "Acme",
              skills: [],
              tailoredCv: { fullCv: { experience: [] } },
            },
          }),
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

  it("throws when the Worker returns an analysis without tailoredCv.fullCv", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ analysis: { jobTitle: "x", skills: [], tailoredCv: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      analyseCvAgainstJob({
        workerUrl: "https://worker.example.com",
        jobText: "JOB",
        cvText: "CV",
      }),
    ).rejects.toThrow(/tailoredCv\.fullCv/);
  });

  it("turns a 429 with an HTML body into a friendly rate-limit error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>Blocked</html>", {
        status: 429,
        headers: { "content-type": "text/html", "retry-after": "30" },
      }),
    );

    await expect(
      analyseCvAgainstJob({
        workerUrl: "https://worker.example.com",
        jobText: "JOB",
        cvText: "CV",
      }),
    ).rejects.toMatchObject({
      name: "AnalysisError",
      status: 429,
      message: expect.stringMatching(/Too many requests.*about 30 seconds/),
    });
  });

  it("asks for an event stream when onProgress is provided and consumes it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        sseBody([
          'data: {"type":"stage","stage":"accepted"}\n\n',
          'data: {"type":"stage","stage":"drafting"}\n\n',
          'data: {"type":"progress","chars":4096}\n\n',
          `data: ${JSON.stringify({ type: "complete", analysis: VALID_ANALYSIS })}\n\n`,
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );

    const labels: string[] = [];
    const result = await analyseCvAgainstJob({
      workerUrl: "https://worker.example.com",
      jobText: "JOB",
      cvText: "CV",
      onProgress: (label) => labels.push(label),
    });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Accept).toBe("text/event-stream");
    expect(result.jobTitle).toBe("Engineer");
    expect(labels.length).toBe(3);
    expect(labels[2]).toMatch(/4 KB written/);
  });

  it("falls back to plain JSON when the Worker ignores the stream request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ analysis: VALID_ANALYSIS }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await analyseCvAgainstJob({
      workerUrl: "https://worker.example.com",
      jobText: "JOB",
      cvText: "CV",
      onProgress: () => {},
    });
    expect(result.employerName).toBe("Acme");
  });
});

describe("consumeAnalysisEventStream", () => {
  it("throws an AnalysisError carrying the streamed error message", async () => {
    await expect(
      consumeAnalysisEventStream(sseBody(['data: {"type":"error","error":"quota exhausted"}\n\n'])),
    ).rejects.toMatchObject({ name: "AnalysisError", message: "quota exhausted" });
  });

  it("throws when the stream ends without a terminal event", async () => {
    await expect(
      consumeAnalysisEventStream(sseBody(['data: {"type":"stage","stage":"accepted"}\n\n'])),
    ).rejects.toThrow(/ended before a result/);
  });

  it("ignores malformed frames and keeps reading", async () => {
    const result = await consumeAnalysisEventStream(
      sseBody([
        "data: not-json\n\n",
        `data: ${JSON.stringify({ type: "complete", analysis: VALID_ANALYSIS })}\n\n`,
      ]),
    );
    expect(result.jobTitle).toBe("Engineer");
  });
});
