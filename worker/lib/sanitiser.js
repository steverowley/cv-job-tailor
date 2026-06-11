// Sanitiser for model-generated HTML: forbidden-token checks plus CSP injection.

const MAX_GENERATED_HTML_BYTES = 200_000;

const GENERATED_HTML_CSP = [
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function sanitizeGeneratedHtml(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("html must be a non-empty string.");
  }
  if (value.length > MAX_GENERATED_HTML_BYTES) {
    throw new Error(`html is larger than ${MAX_GENERATED_HTML_BYTES} bytes.`);
  }
  const trimmed = value.trim();
  if (!/^<!doctype html/i.test(trimmed)) {
    throw new Error("html must start with <!DOCTYPE html>.");
  }
  const decoded = decodeHtmlAndCssEscapes(trimmed).toLowerCase();
  const forbiddenSubstrings = [
    "<script",
    "</script",
    "<iframe",
    "<object",
    "<embed",
    "<form",
    "<base",
    "http-equiv",
    "javascript:",
    "vbscript:",
    "data:text/html",
    "expression(",
  ];
  for (const needle of forbiddenSubstrings) {
    if (decoded.includes(needle)) {
      throw new Error(`html contains forbidden token "${needle}".`);
    }
  }
  // HTML5 accepts both whitespace and "/" between attributes, so an `\s`-only
  // check misses payloads such as `<svg/onload=alert(1)>`.
  if (/[\s/]on[a-z][a-z0-9-]{1,30}\s*=\s*["'`]/i.test(trimmed)) {
    throw new Error("html contains an event-handler attribute (on*=).");
  }
  return injectGeneratedHtmlCsp(trimmed);
}

export function decodeHtmlAndCssEscapes(input) {
  let out = input.replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => {
    const code = parseInt(hex, 16);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
  out = out.replace(/\\(.)/g, (_, ch) => ch);
  out = out.replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
    const code = parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
  out = out.replace(/&#(\d+);?/g, (_, dec) => {
    const code = parseInt(dec, 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
  return out;
}

export function injectGeneratedHtmlCsp(html) {
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${GENERATED_HTML_CSP}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${cspTag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${cspTag}</head>`);
  }
  throw new Error("html must contain <html> and <head> tags.");
}
