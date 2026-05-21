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

export function printCvHtml(html: string, fileName: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new CvDesignerError(
      "The browser blocked the print window. Allow pop-ups for this site and try again.",
    );
  }

  const titled = ensureDocumentTitle(html, fileName);
  printWindow.document.open();
  printWindow.document.write(titled);
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(triggerPrint, 50);
  } else {
    printWindow.addEventListener("load", () => setTimeout(triggerPrint, 50));
  }
}

function ensureDocumentTitle(html: string, fileName: string): string {
  const safeTitle = fileName.replace(/\.pdf$/i, "").replace(/[<>"'&]/g, " ");
  const titleTag = `<title>${safeTitle}</title>`;
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, titleTag);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${titleTag}`);
  }
  return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${titleTag}</head>`);
}
