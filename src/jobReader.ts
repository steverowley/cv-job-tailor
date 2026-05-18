import { BrandSettings } from "./types";

export interface JobReadResult {
  text: string;
  title?: string;
  companyName?: string;
  brand: BrandSettings;
  source: "url" | "pasted";
  warning?: string;
  diagnostics?: ReadDiagnostic[];
}

export interface ReadDiagnostic {
  stage: "worker" | "browser" | "parser";
  ok: boolean;
  message: string;
  status?: number;
  url?: string;
  detail?: string;
}

const DEFAULT_BRAND: BrandSettings = {
  companyName: "Target employer",
  primaryColor: "#1b4d3e",
  accentColor: "#d3a84f",
  backgroundColor: "#fffdf8",
  textColor: "#25221e",
  fontFamily: "Georgia",
  layoutStyle: "editorial",
  palette: ["#1b4d3e", "#d3a84f", "#fffdf8"],
};

const DEFAULT_WORKER_URL = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || "";

export class BrandReadError extends Error {
  constructor(
    message: string,
    readonly fallbackBrand: BrandSettings,
    readonly diagnostics: ReadDiagnostic[] = [],
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
      const read = await readPageHtml(trimmedUrl, workerUrl);
      const html = read.html;
      const parsed = parseHtmlPage(html, trimmedUrl);
      if (parsed.text.length < 300) {
        throw new ReadPageError("The page did not expose enough readable job text.", [
          ...read.diagnostics,
          {
            stage: "parser",
            ok: false,
            message: "The page was fetched, but very little useful text was found.",
            detail:
              "This often happens when the site renders the job with JavaScript after load, or hides the content behind consent, login, or anti-bot checks.",
          },
        ]);
      }

      return {
        text: parsed.text,
        title: parsed.title,
        companyName: parsed.companyName,
        brand: parsed.brand,
        source: "url",
        diagnostics: read.diagnostics,
      };
    } catch (error) {
      if (!trimmedText) {
        throw Object.assign(new Error(`The job page could not be read. ${formatError(error)}`), {
          diagnostics: getDiagnostics(error),
        });
      }

      return {
        text: trimmedText,
        brand: buildFallbackBrand(trimmedUrl),
        source: "pasted",
        warning:
          "The job page could not be read automatically, so the pasted job description was used.",
        diagnostics: getDiagnostics(error),
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
    const read = await readPageHtml(trimmedUrl, workerUrl);
    const html = read.html;
    return parseHtmlPage(html, trimmedUrl).brand;
  } catch (error) {
    const fallback = buildFallbackBrand(trimmedUrl);
    throw new BrandReadError(
      `The employer website could not be read. ${formatError(error)} You can still use the generated company name and adjust the colours manually.`,
      fallback,
      getDiagnostics(error),
    );
  }
}

class ReadPageError extends Error {
  constructor(
    message: string,
    readonly diagnostics: ReadDiagnostic[],
  ) {
    super(message);
    this.name = "ReadPageError";
  }
}

async function readPageHtml(pageUrl: string, workerUrl: string): Promise<{ html: string; diagnostics: ReadDiagnostic[] }> {
  const trimmedWorkerUrl = workerUrl.trim();
  const diagnostics: ReadDiagnostic[] = [];

  if (trimmedWorkerUrl) {
    try {
      const read = await readViaWorker(pageUrl, trimmedWorkerUrl);
      return {
        html: read.html,
        diagnostics: [
          {
            stage: "worker",
            ok: true,
            message: "Cloudflare Worker returned readable HTML.",
            url: read.finalUrl || pageUrl,
            detail: [read.contentType, read.truncated ? "Response was truncated for safety." : ""].filter(Boolean).join(" "),
          },
        ],
      };
    } catch (workerError) {
      diagnostics.push(toDiagnostic("worker", workerError, trimmedWorkerUrl));
      try {
        const html = await readDirectly(pageUrl);
        diagnostics.push({
          stage: "browser",
          ok: true,
          message: "Browser read worked after the Worker failed.",
          url: pageUrl,
        });
        return { html, diagnostics };
      } catch (directError) {
        diagnostics.push(toDiagnostic("browser", directError, pageUrl));
        throw new ReadPageError("Both the Worker and browser reads failed.", diagnostics);
      }
    }
  }

  try {
    const html = await readDirectly(pageUrl);
    return {
      html,
      diagnostics: [
        {
          stage: "browser",
          ok: true,
          message: "Browser read worked. The site allows GitHub Pages to fetch it directly.",
          url: pageUrl,
        },
      ],
    };
  } catch (directError) {
    diagnostics.push(toDiagnostic("browser", directError, pageUrl));
    throw new ReadPageError("Browser read failed and no Worker URL is configured.", diagnostics);
  }
}

async function readViaWorker(
  pageUrl: string,
  workerUrl: string,
): Promise<{ html: string; finalUrl?: string; contentType?: string; truncated?: boolean }> {
  const endpoint = `${workerUrl.replace(/\/+$/, "")}/read`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ url: pageUrl }),
  });

  if (!response.ok) {
    const details = await readErrorBody(response);
    throw Object.assign(new Error(explainWorkerStatus(response.status, details)), {
      status: response.status,
      url: endpoint,
      detail: details,
    });
  }

  const payload = (await response.json()) as {
    html?: string;
    finalUrl?: string;
    contentType?: string;
    truncated?: boolean;
  };
  if (!payload.html) {
    throw new Error("The Worker did not return page HTML.");
  }

  return {
    html: payload.html,
    finalUrl: payload.finalUrl,
    contentType: payload.contentType,
    truncated: payload.truncated,
  };
}

async function readDirectly(pageUrl: string): Promise<string> {
  const response = await fetch(pageUrl);
  if (!response.ok) {
    throw Object.assign(new Error(explainBrowserStatus(response.status)), {
      status: response.status,
      url: pageUrl,
    });
  }

  return response.text();
}

function getDiagnostics(error: unknown): ReadDiagnostic[] {
  return error instanceof ReadPageError ? error.diagnostics : [];
}

function toDiagnostic(stage: ReadDiagnostic["stage"], error: unknown, fallbackUrl: string): ReadDiagnostic {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
  const url = typeof (error as { url?: unknown })?.url === "string" ? (error as { url: string }).url : fallbackUrl;
  const detail = typeof (error as { detail?: unknown })?.detail === "string" ? (error as { detail: string }).detail : undefined;

  return {
    stage,
    ok: false,
    status,
    url,
    message: formatError(error),
    detail: detail || explainNetworkFailure(stage, error),
  };
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return "";
  }

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || text;
  } catch {
    return text;
  }
}

function explainWorkerStatus(status: number, details: string): string {
  if (status === 404) {
    return "The Worker URL was reached, but /read was not found. Check that the deployed Worker is this repo's Worker.";
  }

  if (status === 415) {
    return `The Worker reached the website, but it was not an HTML page. ${details}`;
  }

  if (status === 502) {
    return `The Worker reached the website, but the website rejected or failed the request. ${details}`;
  }

  return `The Worker responded with ${status}. ${details}`;
}

function explainBrowserStatus(status: number): string {
  return `The browser reached the page, but the website responded with ${status}.`;
}

function explainNetworkFailure(stage: ReadDiagnostic["stage"], error: unknown): string {
  const message = formatError(error);
  if (message.toLowerCase().includes("failed to fetch")) {
    return stage === "worker"
      ? "The app could not reach the Worker. Check the Worker URL, deployment status, and CORS settings."
      : "The browser blocked the website read, most commonly because the website does not allow cross-origin reads from GitHub Pages.";
  }

  return "";
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
    backgroundColor: normalizeColor(colors[2] || "", "#fffdf8"),
    textColor: pickReadableText(colors[2] || "#fffdf8"),
    fontFamily: findFontHint(source) || DEFAULT_BRAND.fontFamily,
    layoutStyle: chooseLayoutStyle(colors[0] || DEFAULT_BRAND.primaryColor, source),
    palette: colors.slice(0, 6),
  };
}

export function parseHtmlPage(html: string, pageUrl: string): Omit<JobReadResult, "source"> {
  const document = new DOMParser().parseFromString(html, "text/html");
  const title = document.querySelector("title")?.textContent?.trim();
  const companyName =
    getMeta(document, "og:site_name") ||
    getMeta(document, "application-name") ||
    getHostName(pageUrl);

  const styleText = Array.from(document.querySelectorAll("style"))
    .map((node) => node.textContent || "")
    .join("\n");
  const logoUrl = findLogoUrl(document, pageUrl);
  const palette = findBrandPalette(document, styleText);
  const themeColor = palette[0] || findBrandColor(document, DEFAULT_BRAND.primaryColor);
  const backgroundColor = palette.find((color) => colorBrightness(color) > 210) || "#fffdf8";
  const fontFamily = findFontHint(styleText) || findInlineFont(document) || DEFAULT_BRAND.fontFamily;

  document.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
  const text = document.body?.innerText || document.documentElement.textContent || "";

  return {
    text: text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    title,
    companyName,
    brand: {
      companyName,
      logoUrl,
      primaryColor: themeColor,
      accentColor: palette[1] || deriveAccentColor(themeColor),
      backgroundColor,
      textColor: pickReadableText(backgroundColor),
      fontFamily,
      layoutStyle: chooseLayoutStyle(themeColor, `${styleText}\n${text.slice(0, 3000)}`),
      palette: palette.length ? palette : [themeColor, deriveAccentColor(themeColor), backgroundColor],
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

function findBrandPalette(document: Document, styleText: string): string[] {
  const metaColors = [
    getMeta(document, "theme-color"),
    getMeta(document, "msapplication-TileColor"),
  ].filter(Boolean) as string[];
  const inlineColors = Array.from(document.querySelectorAll<HTMLElement>("[style]"))
    .flatMap((element) => [element.style.backgroundColor, element.style.color, element.style.borderColor])
    .map(rgbToHex)
    .filter(Boolean) as string[];
  const cssColors = Array.from(styleText.matchAll(/#[0-9a-f]{3,8}\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi))
    .map((match) => rgbToHex(match[0]) || normalizeColor(match[0], ""))
    .filter(Boolean) as string[];

  return rankColors([...metaColors, ...inlineColors, ...cssColors]);
}

function rankColors(colors: string[]): string[] {
  const counts = new Map<string, number>();
  colors
    .map((color) => normalizeColor(expandShortHex(color), ""))
    .filter((color) => /^#[0-9a-f]{6}$/i.test(color))
    .filter((color) => {
      const brightness = colorBrightness(color);
      return brightness > 18 && brightness < 245;
    })
    .forEach((color) => counts.set(color.toLowerCase(), (counts.get(color.toLowerCase()) || 0) + 1));

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)
    .slice(0, 6);
}

function expandShortHex(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return match ? `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}` : trimmed;
}

function findFontHint(source: string): string | undefined {
  const match = source.match(/font-family\s*:\s*([^;}{]+)/i);
  if (!match) {
    return undefined;
  }

  const firstFont = match[1]
    .split(",")[0]
    .replace(/["']/g, "")
    .trim();

  if (!firstFont || /var\(|inherit|initial|system-ui|sans-serif|serif|monospace/i.test(firstFont)) {
    return undefined;
  }

  return firstFont;
}

function findInlineFont(document: Document): string | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("[style]"))
    .map((element) => element.style.fontFamily)
    .map((font) => font?.split(",")[0]?.replace(/["']/g, "").trim())
    .find(Boolean);
}

function chooseLayoutStyle(primaryColor: string, source: string): BrandSettings["layoutStyle"] {
  const text = source.toLowerCase();
  if (/engineering|platform|developer|data|security|cloud|api|technology|software/.test(text)) {
    return "technical";
  }
  if (/university|research|journal|school|academy|institute|policy|public/.test(text)) {
    return "classic";
  }
  if (colorBrightness(primaryColor) < 72) {
    return "executive";
  }
  return "editorial";
}

function pickReadableText(backgroundColor: string): string {
  return colorBrightness(backgroundColor) > 150 ? "#24211d" : "#fffaf0";
}

function colorBrightness(color: string): number {
  const normalized = normalizeColor(expandShortHex(color), "#ffffff").replace("#", "").slice(0, 6);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000;
}

function rgbToHex(value: string): string | undefined {
  const match = value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i);
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
