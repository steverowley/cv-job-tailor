import { BrandSettings } from "./types";

export interface JobReadResult {
  text: string;
  title?: string;
  companyName?: string;
  brand: BrandSettings;
  source: "url" | "pasted";
  warning?: string;
}

const DEFAULT_BRAND: BrandSettings = {
  companyName: "Target employer",
  primaryColor: "#1b4d3e",
  accentColor: "#d3a84f",
};

export async function readJobDescription(
  jobUrl: string,
  pastedText: string,
): Promise<JobReadResult> {
  const trimmedUrl = jobUrl.trim();
  const trimmedText = pastedText.trim();

  if (trimmedUrl) {
    try {
      const response = await fetch(trimmedUrl);
      if (!response.ok) {
        throw new Error(`The page responded with ${response.status}.`);
      }

      const html = await response.text();
      const parsed = parseHtmlPage(html, trimmedUrl);
      if (parsed.text.length < 300) {
        throw new Error("The page did not expose enough readable job text.");
      }

      return {
        text: parsed.text,
        title: parsed.title,
        companyName: parsed.companyName,
        brand: parsed.brand,
        source: "url",
      };
    } catch (error) {
      if (!trimmedText) {
        throw new Error(
          `The job page could not be read from GitHub Pages. Paste the job description instead. ${formatError(error)}`,
        );
      }

      return {
        text: trimmedText,
        brand: buildFallbackBrand(trimmedUrl),
        source: "pasted",
        warning:
          "The job page could not be read automatically, so the pasted job description was used.",
      };
    }
  }

  if (!trimmedText) {
    throw new Error("Add a job URL or paste the job description.");
  }

  return {
    text: trimmedText,
    brand: DEFAULT_BRAND,
    source: "pasted",
  };
}

export function parseHtmlPage(html: string, pageUrl: string): Omit<JobReadResult, "source"> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const title = document.querySelector("title")?.textContent?.trim();
  const companyName =
    getMeta(document, "og:site_name") ||
    getMeta(document, "application-name") ||
    getHostName(pageUrl);

  document.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
  const text = document.body?.innerText || document.documentElement.textContent || "";
  const logoUrl = findLogoUrl(document, pageUrl);
  const themeColor = getMeta(document, "theme-color") || "#1b4d3e";

  return {
    text: text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    title,
    companyName,
    brand: {
      companyName,
      logoUrl,
      primaryColor: normalizeColor(themeColor, DEFAULT_BRAND.primaryColor),
      accentColor: DEFAULT_BRAND.accentColor,
    },
  };
}

export function buildFallbackBrand(url: string): BrandSettings {
  const companyName = getHostName(url);
  return {
    ...DEFAULT_BRAND,
    companyName,
  };
}

function getMeta(document: Document, property: string): string | undefined {
  return (
    document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") ||
    document.querySelector(`meta[name="${property}"]`)?.getAttribute("content") ||
    undefined
  );
}

function findLogoUrl(document: Document, pageUrl: string): string | undefined {
  const selector =
    'link[rel~="icon"], link[rel="apple-touch-icon"], meta[property="og:image"], meta[name="twitter:image"]';
  const value =
    document.querySelector(selector)?.getAttribute("href") ||
    document.querySelector(selector)?.getAttribute("content");

  if (!value) {
    return undefined;
  }

  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return undefined;
  }
}

function getHostName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname.split(".")[0].replace(/[-_]+/g, " ");
  } catch {
    return "Target employer";
  }
}

function normalizeColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  return /^#[0-9a-f]{3,8}$/i.test(trimmed) ? trimmed : fallback;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
