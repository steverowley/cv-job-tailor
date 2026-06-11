// Brand-signal extraction from linked stylesheets: colours and font families.
import { browserLikeHeaders } from "./http.js";
import { isAllowedStylesheetUrl } from "./url-guards.js";

const MAX_STYLESHEET_FILES = 6;
const MAX_STYLESHEET_BYTES = 600_000;
const MAX_REPORTED_COLORS = 400;
const MAX_REPORTED_FONTS = 20;

export async function collectExternalStyleSignals(html, baseUrl) {
  const empty = { colors: [], fonts: [] };
  if (!html || typeof html !== "string") return empty;

  const hrefs = collectStylesheetHrefs(html, baseUrl);
  if (hrefs.length === 0) return empty;

  const fetched = await Promise.all(
    hrefs.map(async (href) => {
      try {
        const r = await fetch(href, { headers: browserLikeHeaders(href), redirect: "follow" });
        if (!r.ok) return "";
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct && !ct.includes("css") && !ct.includes("text/plain")) return "";
        return await r.text();
      } catch {
        return "";
      }
    }),
  );

  let combined = "";
  for (const text of fetched) {
    if (!text) continue;
    const remaining = MAX_STYLESHEET_BYTES - combined.length;
    if (remaining <= 0) break;
    combined += text.slice(0, remaining);
    combined += "\n";
  }

  return {
    colors: extractCssColors(combined),
    fonts: extractCssFonts(combined),
  };
}

function collectStylesheetHrefs(html, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const hrefs = [];
  const seen = new Set();
  const linkRe = /<link\b[^>]*>/gi;
  let match;
  while ((match = linkRe.exec(html)) && hrefs.length < MAX_STYLESHEET_FILES) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']?[^"'>]*stylesheet[^"'>]*["']?/i.test(tag)) continue;
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    let resolved;
    try {
      resolved = new URL(hrefMatch[1], base).toString();
    } catch {
      continue;
    }
    if (seen.has(resolved)) continue;
    if (!isAllowedStylesheetUrl(resolved, base)) continue;
    seen.add(resolved);
    hrefs.push(resolved);
  }
  return hrefs;
}

export function extractCssColors(css) {
  if (!css) return [];
  const colors = [];
  const seen = new Set();
  const colorRe =
    /#[0-9a-f]{3,8}(?![0-9a-f])|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\(\s*\d+(?:deg)?\s*,\s*\d+%\s*,\s*\d+%(?:\s*,\s*[\d.]+)?\s*\)/gi;
  let match;
  while ((match = colorRe.exec(css)) && colors.length < MAX_REPORTED_COLORS) {
    const key = match[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(match[0]);
  }
  return colors;
}

export function extractCssFonts(css) {
  if (!css) return [];
  const fonts = [];
  const seen = new Set();
  const fontRe = /font-family\s*:\s*([^;}{]+)/gi;
  let match;
  while ((match = fontRe.exec(css)) && fonts.length < MAX_REPORTED_FONTS) {
    const first = match[1].split(",")[0].replace(/['"]/g, "").trim();
    if (!first) continue;
    if (/^(var\(|inherit|initial|system-ui|sans-serif|serif|monospace|cursive|fantasy)/i.test(first)) {
      continue;
    }
    const key = first.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fonts.push(first);
  }
  return fonts;
}
