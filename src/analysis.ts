import { AnalysisResult } from "./types";

export class AnalysisError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AnalysisError";
  }
}

export async function analyseCvAgainstJob(params: {
  workerUrl: string;
  sharedSecret?: string;
  jobText: string;
  cvText: string;
  employerHint?: string;
  onProgress?: (label: string) => void;
}): Promise<AnalysisResult> {
  const { workerUrl, sharedSecret, jobText, cvText, employerHint, onProgress } = params;

  const trimmedWorkerUrl = workerUrl.trim().replace(/\/+$/, "");
  if (!trimmedWorkerUrl) {
    throw new AnalysisError("The Cloudflare Worker URL is not configured.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sharedSecret?.trim()) {
    headers.Authorization = `Bearer ${sharedSecret.trim()}`;
  }
  if (onProgress) {
    // Ask the Worker to stream progress events. Workers that predate
    // streaming ignore this and answer with plain JSON, which still works.
    headers.Accept = "text/event-stream";
  }

  let response: Response;
  try {
    response = await fetch(`${trimmedWorkerUrl}/analyse`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jobText, cvText, employerHint }),
    });
  } catch (error) {
    throw new AnalysisError(
      `The browser could not reach the Worker. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (response.ok && contentType.includes("text/event-stream") && response.body) {
    const analysis = await consumeAnalysisEventStream(response.body, onProgress);
    assertValidAnalysis(analysis, response.status);
    return analysis;
  }

  const rawText = await response.text();
  let payload: { analysis?: AnalysisResult; error?: string } = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new AnalysisError("The Worker returned a non-JSON response.", response.status);
    }
  }

  if (!response.ok) {
    throw new AnalysisError(payload.error || `Worker responded with ${response.status}.`, response.status);
  }

  if (!payload.analysis) {
    throw new AnalysisError("The Worker did not return an analysis payload.", response.status);
  }

  assertValidAnalysis(payload.analysis, response.status);
  return payload.analysis;
}

const STAGE_LABELS: Record<string, string> = {
  accepted: "OpenAI accepted the request. Reading the job and CV...",
  reasoning: "Matching the job's requirements against your CV evidence...",
  drafting: "Drafting the tailored CV wording...",
};

// Reads the Worker's progress stream: stage and progress events update the
// label; the terminal event carries the analysis or the error. Exported for
// tests.
export async function consumeAnalysisEventStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (label: string) => void,
): Promise<AnalysisResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseAnalysisStreamFrame(frame);
        if (!event) continue;
        if (event.type === "stage" && typeof event.stage === "string") {
          const label = STAGE_LABELS[event.stage];
          if (label) onProgress?.(label);
        } else if (event.type === "progress" && typeof event.chars === "number") {
          onProgress?.(`Drafting the tailored CV (${Math.max(1, Math.round(event.chars / 1024))} KB written)...`);
        } else if (event.type === "complete") {
          return event.analysis as AnalysisResult;
        } else if (event.type === "error") {
          throw new AnalysisError(
            typeof event.error === "string" ? event.error : "The analysis stream reported an error.",
          );
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new AnalysisError("The analysis stream ended before a result arrived.");
}

function parseAnalysisStreamFrame(frame: string): {
  type?: string;
  stage?: string;
  chars?: number;
  analysis?: unknown;
  error?: string;
} | null {
  const dataLines = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
}

function assertValidAnalysis(value: AnalysisResult, status: number): void {
  if (!value || typeof value !== "object") {
    throw new AnalysisError("The Worker returned an analysis payload that is not an object.", status);
  }
  const tailored = (value as { tailoredCv?: unknown }).tailoredCv as
    | { fullCv?: unknown }
    | undefined;
  if (!tailored || typeof tailored !== "object") {
    throw new AnalysisError("The Worker analysis is missing tailoredCv.", status);
  }
  const fullCv = tailored.fullCv as { experience?: unknown } | undefined;
  if (!fullCv || typeof fullCv !== "object") {
    throw new AnalysisError("The Worker analysis is missing tailoredCv.fullCv.", status);
  }
  if (!Array.isArray(fullCv.experience)) {
    throw new AnalysisError("The Worker analysis is missing tailoredCv.fullCv.experience.", status);
  }
}
