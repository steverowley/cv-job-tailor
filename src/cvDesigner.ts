import { BrandSettings, FullCv } from "./types";

export class CvDesignerError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "CvDesignerError";
  }
}

function normaliseWorkerUrl(workerUrl: string): string {
  const trimmed = workerUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new CvDesignerError("The Cloudflare Worker URL is not configured.");
  }
  return trimmed;
}

function authHeaders(sharedSecret?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sharedSecret?.trim()) {
    headers.Authorization = `Bearer ${sharedSecret.trim()}`;
  }
  return headers;
}

export async function designCvHtml(params: {
  workerUrl: string;
  sharedSecret?: string;
  structuredCv: FullCv;
  brand: BrandSettings;
  employerHomepageUrl?: string;
  jobTitle?: string;
  employerName?: string;
}): Promise<{ html: string; screenshotUrl: string }> {
  const { workerUrl, sharedSecret, structuredCv, brand, employerHomepageUrl, jobTitle, employerName } = params;
  const base = normaliseWorkerUrl(workerUrl);

  let response: Response;
  try {
    response = await fetch(`${base}/design-cv-html`, {
      method: "POST",
      headers: authHeaders(sharedSecret),
      body: JSON.stringify({
        structuredCv,
        brand,
        employerHomepageUrl: employerHomepageUrl?.trim() || "",
        logoUrl: brand.logoUrl || "",
        jobTitle: jobTitle || "",
        employerName: employerName || brand.companyName || "",
      }),
    });
  } catch (error) {
    throw new CvDesignerError(
      `The browser could not reach the Worker. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  const rawText = await response.text();
  let payload: { html?: string; screenshotUrl?: string; error?: string } = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new CvDesignerError("The Worker returned a non-JSON response.", response.status);
    }
  }

  if (!response.ok) {
    throw new CvDesignerError(payload.error || `Worker responded with ${response.status}.`, response.status);
  }

  if (!payload.html) {
    throw new CvDesignerError("The Worker did not return HTML.", response.status);
  }

  return { html: payload.html, screenshotUrl: payload.screenshotUrl || "" };
}

export async function renderCvPdf(params: {
  workerUrl: string;
  sharedSecret?: string;
  html: string;
  fileName?: string;
}): Promise<Blob> {
  const { workerUrl, sharedSecret, html, fileName } = params;
  const base = normaliseWorkerUrl(workerUrl);

  let response: Response;
  try {
    response = await fetch(`${base}/render-pdf`, {
      method: "POST",
      headers: authHeaders(sharedSecret),
      body: JSON.stringify({ html, fileName: fileName || "tailored-cv.pdf" }),
    });
  } catch (error) {
    throw new CvDesignerError(
      `The browser could not reach the Worker. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    let message = `Worker responded with ${response.status}.`;
    if (rawText) {
      try {
        const parsed = JSON.parse(rawText) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        message = rawText.slice(0, 500);
      }
    }
    throw new CvDesignerError(message, response.status);
  }

  return response.blob();
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
