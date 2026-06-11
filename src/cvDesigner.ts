import { BrandSettings, FullCv } from "./types";
import { rateLimitMessage } from "./workerErrors";

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

export interface DesignInputs {
  hadCvLayout: boolean;
  hadEmployerScreenshot: boolean;
  hadLogo: boolean;
}

export async function designCvHtml(params: {
  workerUrl: string;
  sharedSecret?: string;
  structuredCv: FullCv;
  brand: BrandSettings;
  employerHomepageUrl?: string;
  jobTitle?: string;
  employerName?: string;
  cvLayoutDataUrl?: string;
}): Promise<{ html: string; screenshotUrl: string; inputs: DesignInputs }> {
  const {
    workerUrl,
    sharedSecret,
    structuredCv,
    brand,
    employerHomepageUrl,
    jobTitle,
    employerName,
    cvLayoutDataUrl,
  } = params;
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
        cvLayoutDataUrl: cvLayoutDataUrl || "",
      }),
    });
  } catch (error) {
    throw new CvDesignerError(
      `The browser could not reach the Worker. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }

  // Before the body parse: rate-limit blocks often carry an HTML body that
  // would otherwise surface as the misleading "non-JSON response" error.
  if (response.status === 429) {
    throw new CvDesignerError(rateLimitMessage(response), 429);
  }

  const rawText = await response.text();
  let payload: {
    html?: string;
    screenshotUrl?: string;
    error?: string;
    inputs?: Partial<DesignInputs>;
  } = {};
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

  return {
    html: payload.html,
    screenshotUrl: payload.screenshotUrl || "",
    inputs: {
      hadCvLayout: Boolean(payload.inputs?.hadCvLayout),
      hadEmployerScreenshot: Boolean(payload.inputs?.hadEmployerScreenshot),
      hadLogo: Boolean(payload.inputs?.hadLogo),
    },
  };
}

export function printCvHtml(html: string, fileName: string): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new CvDesignerError(
      "The browser blocked the print window. Allow pop-ups for this site and try again.",
    );
  }

  try {
    printWindow.opener = null;
  } catch {
    // Some browsers disallow reassigning opener; the popup remains linked but the
    // sandboxed iframe preview is the canonical render path.
  }

  const titled = ensureDocumentTitle(html, fileName);
  printWindow.document.open();
  printWindow.document.write(titled);
  printWindow.document.close();

  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // Print can throw if the user closed the popup mid-flow; swallow it.
    }
  };

  let printed = false;
  const printOnce = () => {
    if (printed) return;
    printed = true;
    triggerPrint();
  };

  const waitForReady = async () => {
    if (printWindow.document.readyState !== "complete") {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          if (printWindow.document.readyState === "complete") {
            printWindow.removeEventListener("load", onReady);
            printWindow.document.removeEventListener("readystatechange", onReady);
            resolve();
          }
        };
        printWindow.addEventListener("load", onReady);
        printWindow.document.addEventListener("readystatechange", onReady);
        onReady();
      });
    }
    const fonts = (printWindow.document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) {
      try {
        await fonts.ready;
      } catch {
        // Font loading failures shouldn't block printing.
      }
    }
  };

  waitForReady().then(printOnce, printOnce);
  setTimeout(printOnce, 5000);
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
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${titleTag}</head>`);
  }
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (match) => `<head>${titleTag}</head>${match}`);
  }
  if (/<!doctype html[^>]*>/i.test(html)) {
    return html.replace(/<!doctype html[^>]*>/i, (match) => `${match}<head>${titleTag}</head>`);
  }
  return `<head>${titleTag}</head>${html}`;
}
