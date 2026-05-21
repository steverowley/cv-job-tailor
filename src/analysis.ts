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
}): Promise<AnalysisResult> {
  const { workerUrl, sharedSecret, jobText, cvText, employerHint } = params;

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

  return payload.analysis;
}
