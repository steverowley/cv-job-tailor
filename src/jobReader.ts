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

const DEFAULT_WORKER_URL = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || "";

export class BrandReadError extends Error {
  constructor(
    message: string,
    readonly fallbackBrand: BrandSettings,
  ) {
    super(message);
    this.name = "BrandReadError";
  }
}

export async function readJobDescription(
  jobUrl: string,
  pastedText: string,
  workerUrl = DEFAULT_WORKER_URL,
): Promise<JobReadResult> {
  const trimmedUrl = jobUrl.trim();
  const trimmedText = pastedText.trim();

  if (trimmedUrl) {
    try {
      const html = await readPageHtml(trimmedUrl, workerUrl);
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

export async function readEmployerBrand(
  websiteUrl: string,
  pastedBrandSource: string,
  workerUrl = DEFAULT_WORKER_URL,
): Promise<BrandSettings> {
  const trimmedUrl = websiteUrl.trim();
  const trimmedBrandSource = pastedBrandSource.trim();

  if (trimmedBrandSource) {
    return parseBrandSource(trimmedBrandSource, trimmedUrl);
  }

  if (!trimmedUrl) {
    throw new Error("Add the employer website URL or paste brand details first.");
  }

  try {
    const html = await readPageHtml(trimmedUrl, workerUrl);
    return parseHtmlPage(html, trimmedUrl).brand;
  } catch (error) {
    const fallback = buildFallbackBrand(trimmedUrl);
    throw new BrandReadError(
      `The employer website could not be read from GitHub Pages. ${formatError(error)} You can still use the generated company name and adjust the colours manually.`,
      fallback,
    );
  }
}

async function readPageHtml(pageUrl: string, workerUrl: string): Promise<string> {
  const trimmedWorkerUrl = workerUrl.trim();
  if (trimmedWorkerUrl) {
    try {
      return await readViaWorker(pageUrl, trimmedWorkerUrl);
    } catch (workerError) {
      try {
        return await readDirectly(pageUrl);
      } catch (directError) {
        throw new Error(
          `Worker read failed: ${formatError(workerError)} Browser read failed: ${formatError(directError)}`,
        );
      }
    }
  }

  return readDirectly(pageUrl);
}

async function readViaWorker(pageUrl: string, workerUrl: string): Promise<string> {
  const response = await fetch(`${workerUrl.replace(/\/+$/, "")}/read`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ url: pageUrl }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`The Worker responded with ${response.status}. ${details}`);
  }

  const payload = (await response.json()) as { html?: string };
  if (!payload.html) {
    throw new Error("The Worker did not return page HTML.");
  }

  return payload.html;
}

async function readDirectly(pageUrl: string): Promise<string> {
  const response = await fetch(pageUrl);
  if (!response.ok) {
    throw new Error(`The page responded with ${response.status}.`);
  }

  return response.text();
}

export function parseBrandSource(source: string, websiteUrl: string): BrandSettings {
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(source);

  if (looksLikeHtml) {
    return parseHtmlPage(source, websiteUrl || "https://example.com").brand;
  }

  const companyName =
    source.match(/(?:company|employer|organisation|organization|brand)\s*:\s*(.+)/i)?.[1]?.split("\n")[0].trim() ||
    getHostName(websiteUrl) ||
    source.split("\n").find((line) => line.trim().length > 2)?.trim() ||
    DEFAULT_BRAND.companyName;
  const colors = Array.from(source.matchAll(/#[0-9a-f]{3,8}\b/gi)).map((match) => match[0]);

  return {
    companyName,
    logoUrl: source.match(/https?:\/\/\S+\.(?:png|jpg|jpeg|svg|webp|ico)/i)?.[0],
    primaryColor: normalizeColor(colors[0] || "", DEFAULT_BRAND.primaryColor),
    accentColor: normalizeColor(colors[1] || "", deriveAccentColor(colors[0] || DEFAULT_BRAND.primaryColor)),
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
  const themeColor = findBrandColor(document, DEFAULT_BRAND.primaryColor);

  return {
    text: text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    title,
    companyName,
    brand: {
      companyName,
      logoUrl,
      primaryColor: themeColor,
      accentColor: deriveAccentColor(themeColor),
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

function findBrandColor(document: Document, fallback: string): string {
  const metaColor = getMeta(document, "theme-color") || getMeta(document, "msapplication-TileColor");
  if (metaColor) {
    return normalizeColor(metaColor, fallback);
  }

  const inlineColor = Array.from(document.querySelectorAll<HTMLElement>("[style]"))
    .map((element) => element.style.backgroundColor || element.style.color)
    .map(rgbToHex)
    .find(Boolean);

  return inlineColor || fallback;
}

function rgbToHex(value: string): string | undefined {
  const match = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
  if (!match) {
    return normalizeColor(value, "");
  }

  const [, red, green, blue] = match;
  return `#${[red, green, blue]
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function deriveAccentColor(primary: string): string {
  const normalized = normalizeColor(primary, DEFAULT_BRAND.primaryColor).replace("#", "").slice(0, 6);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness > 150 ? "#1f3a34" : "#f0c75e";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
