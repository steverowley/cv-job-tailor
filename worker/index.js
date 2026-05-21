// Worker secrets (set via `wrangler secret put` or the deploy workflow):
//   OPENAI_API_KEY         — required for POST /analyse
//   ANALYSE_SHARED_SECRET  — optional; if set, /analyse requires Bearer auth
//   JINA_API_KEY           — optional; lifts r.jina.ai shared-IP rate limit

const ALLOWED_ORIGINS = new Set([
  "https://steverowley.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const MAX_HTML_LENGTH = 500_000;
const MAX_TEXT_LENGTH = 60_000;
const MAX_IMAGE_BYTES = 2_000_000;
const MAX_STYLESHEET_FILES = 6;
const MAX_STYLESHEET_BYTES = 600_000;
const MAX_REPORTED_COLORS = 400;
const MAX_REPORTED_FONTS = 20;

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You tailor CVs for job applications. You must be evidence-only: never invent experience, employers, qualifications, dates, tools, outcomes, or responsibilities. If a requirement is not clearly supported by the CV, mark it as a gap.";

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["jobTitle", "employerName", "skills", "tailoredCv"],
  properties: {
    jobTitle: { type: "string" },
    employerName: { type: "string" },
    skills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "priority", "evidenceNeeded"],
        properties: {
          name: { type: "string" },
          priority: {
            type: "string",
            enum: ["required", "preferred", "tool", "responsibility", "tone"],
          },
          evidenceNeeded: { type: "string" },
        },
      },
    },
    tailoredCv: {
      type: "object",
      additionalProperties: false,
      required: [
        "headline",
        "summary",
        "coreSkills",
        "experienceBullets",
        "fullCv",
        "evidenceMatches",
        "gaps",
        "cautions",
      ],
      properties: {
        headline: { type: "string" },
        summary: { type: "string" },
        coreSkills: { type: "array", items: { type: "string" } },
        experienceBullets: { type: "array", items: { type: "string" } },
        fullCv: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "contactLines",
            "headline",
            "profile",
            "skills",
            "experience",
            "education",
            "certifications",
            "additionalSections",
          ],
          properties: {
            name: { type: "string" },
            contactLines: { type: "array", items: { type: "string" } },
            headline: { type: "string" },
            profile: { type: "string" },
            skills: { type: "array", items: { type: "string" } },
            experience: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["role", "organisation", "dates", "location", "bullets"],
                properties: {
                  role: { type: "string" },
                  organisation: { type: "string" },
                  dates: { type: "string" },
                  location: { type: "string" },
                  bullets: { type: "array", items: { type: "string" } },
                },
              },
            },
            education: { type: "array", items: { type: "string" } },
            certifications: { type: "array", items: { type: "string" } },
            additionalSections: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "items"],
                properties: {
                  title: { type: "string" },
                  items: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        evidenceMatches: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["skill", "cvEvidence", "confidence"],
            properties: {
              skill: { type: "string" },
              cvEvidence: { type: "string" },
              confidence: { type: "string", enum: ["strong", "partial", "gap"] },
            },
          },
        },
        gaps: { type: "array", items: { type: "string" } },
        cautions: { type: "array", items: { type: "string" } },
      },
    },
  },
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/status" && request.method === "GET") {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json({ error: "Origin not allowed." }, 403, corsHeaders);
      }
      return json(
        {
          hasOpenAiKey: Boolean(env.OPENAI_API_KEY),
          requiresSharedSecret: Boolean(env.ANALYSE_SHARED_SECRET),
          hasJinaKey: Boolean(env.JINA_API_KEY),
        },
        200,
        corsHeaders,
      );
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "This Worker only accepts requests from the CV Job Tailor app." }, 403, corsHeaders);
    }

    if (url.pathname === "/analyse" && request.method === "POST") {
      return analyseWithOpenAI(request, env, corsHeaders);
    }

    if (url.pathname === "/proxy-image" && request.method === "GET") {
      return proxyImage(url, corsHeaders);
    }

    if (url.pathname === "/read" && request.method === "POST") {
      return readPage(request, env, corsHeaders);
    }

    return json(
      { error: "Use GET /status, POST /read, POST /analyse, or GET /proxy-image." },
      404,
      corsHeaders,
    );
  },
};

async function readPage(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const targetUrl = validateTargetUrl(body?.url);
    let response = await fetch(targetUrl, {
      headers: browserLikeHeaders(targetUrl),
      redirect: "follow",
    });
    let usedReaderProxy = false;
    let proxyAttempted = false;
    let proxyStatus = null;
    let proxyError = "";
    const directStatus = response.status;

    if (!response.ok && shouldRetryViaReaderProxy(response.status)) {
      proxyAttempted = true;
      try {
        const proxied = await fetchViaReaderProxy(targetUrl, env);
        proxyStatus = proxied.status;
        if (proxied.ok) {
          response = proxied;
          usedReaderProxy = true;
        } else {
          proxyError = (await proxied.text().catch(() => "")).slice(0, 500);
        }
      } catch (err) {
        proxyError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!response.ok) {
      const hint =
        proxyAttempted && proxyStatus === 429 && !env.JINA_API_KEY
          ? " Set a JINA_API_KEY worker secret to lift the shared-IP rate limit."
          : "";
      const detail = proxyAttempted
        ? `Direct fetch returned ${directStatus}; reader proxy ${
            proxyStatus ? `returned ${proxyStatus}` : "could not be reached"
          }${proxyError ? ` — ${proxyError}` : ""}.${hint}`
        : explainUpstreamStatus(directStatus);
      return json(
        {
          error: detail,
          directStatus,
          proxyAttempted,
          proxyStatus,
        },
        502,
        corsHeaders,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!usedReaderProxy && !isReadableContent(contentType)) {
      return json({ error: `Unsupported content type: ${contentType || "unknown"}.` }, 415, corsHeaders);
    }

    const rawHtml = await response.text();
    const html = rawHtml.slice(0, MAX_HTML_LENGTH);
    const externalStyles = usedReaderProxy
      ? { colors: [], fonts: [] }
      : await collectExternalStyleSignals(rawHtml, response.url || targetUrl);
    return json(
      {
        html,
        finalUrl: response.url,
        contentType,
        truncated: html.length >= MAX_HTML_LENGTH,
        externalStyles,
        viaReaderProxy: usedReaderProxy,
        directStatus,
        proxyAttempted,
        proxyStatus,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The website could not be read." }, 400, corsHeaders);
  }
}

async function analyseWithOpenAI(request, env, corsHeaders) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "The Worker is missing its OPENAI_API_KEY secret." }, 500, corsHeaders);
  }

  if (env.ANALYSE_SHARED_SECRET) {
    const auth = request.headers.get("authorization") || "";
    const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (!timingSafeEqual(provided, env.ANALYSE_SHARED_SECRET)) {
      return json({ error: "Missing or invalid shared secret." }, 401, corsHeaders);
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400, corsHeaders);
  }

  const jobText = typeof payload?.jobText === "string" ? payload.jobText.slice(0, MAX_TEXT_LENGTH) : "";
  const cvText = typeof payload?.cvText === "string" ? payload.cvText.slice(0, MAX_TEXT_LENGTH) : "";
  const employerHint = typeof payload?.employerHint === "string" ? payload.employerHint.slice(0, 200) : "";

  if (!jobText.trim() || !cvText.trim()) {
    return json({ error: "Both jobText and cvText are required." }, 400, corsHeaders);
  }

  const userMessage = [
    `Employer hint: ${employerHint || "Unknown"}`,
    "JOB DESCRIPTION:",
    jobText,
    "CV TEXT:",
    cvText,
    "Return both a review and a full, usable, evidence-only CV. The fullCv field must be a complete CV document built from the existing CV content, tailored toward the job. Preserve real contact details, roles, organisations, dates, education, and certifications when present. Reorder, select, and rewrite only where supported by the CV. Do not include unsupported job requirements in the CV; put them in gaps instead.",
  ].join("\n\n");

  const body = {
    model: MODEL,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "cv_tailoring_analysis",
        strict: true,
        schema: ANALYSIS_SCHEMA,
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const message = extractOpenAIError(rawText) || `OpenAI analysis failed with HTTP ${response.status}.`;
    return json({ error: message }, 502, corsHeaders);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return json({ error: "OpenAI returned non-JSON." }, 502, corsHeaders);
  }

  const analysis = extractOpenAIStructuredAnalysis(parsed);
  if (!analysis) {
    return json({ error: "OpenAI returned no structured analysis." }, 502, corsHeaders);
  }

  return json({ analysis }, 200, corsHeaders);
}

async function proxyImage(url, corsHeaders) {
  const target = url.searchParams.get("url") || "";
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json({ error: "Invalid image URL." }, 400, corsHeaders);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return json({ error: "Only http and https URLs are supported." }, 400, corsHeaders);
  }

  const upstream = await fetch(parsed.toString(), {
    headers: {
      ...browserLikeHeaders(parsed.toString()),
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "sec-fetch-dest": "image",
      "sec-fetch-mode": "no-cors",
    },
    redirect: "follow",
  });

  if (!upstream.ok) {
    return json({ error: `Image fetch failed with ${upstream.status}.` }, 502, corsHeaders);
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return json({ error: `Unsupported image content type: ${contentType || "unknown"}.` }, 415, corsHeaders);
  }

  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return json({ error: "Image is too large to proxy." }, 413, corsHeaders);
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    },
  });
}

function extractOpenAIStructuredAnalysis(payload) {
  if (!payload) {
    return null;
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    try {
      return JSON.parse(payload.output_text);
    } catch {
      // fall through to per-block extraction
    }
  }

  if (!Array.isArray(payload.output)) {
    return null;
  }

  for (const item of payload.output) {
    const blocks = Array.isArray(item?.content) ? item.content : [];
    for (const block of blocks) {
      if (block?.type === "output_text" && typeof block.text === "string") {
        try {
          return JSON.parse(block.text);
        } catch {
          continue;
        }
      }
      if (block?.type === "text" && typeof block.text === "string") {
        try {
          return JSON.parse(block.text);
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}

function extractOpenAIError(rawText) {
  if (!rawText) return "";
  try {
    const parsed = JSON.parse(rawText);
    return parsed?.error?.message || "";
  } catch {
    return rawText.slice(0, 500);
  }
}

function buildCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://steverowley.github.io";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function validateTargetUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing URL.");
  }

  const targetUrl = new URL(value);
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  return targetUrl.toString();
}

function isReadableContent(contentType) {
  return (
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("text/plain") ||
    contentType.includes("application/xhtml+xml")
  );
}

function browserLikeHeaders(targetUrl) {
  const origin = (() => {
    try {
      return new URL(targetUrl).origin;
    } catch {
      return "";
    }
  })();
  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "en-GB,en;q=0.9,en-US;q=0.8",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Chromium";v="130", "Not(A:Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    ...(origin ? { referer: origin + "/" } : {}),
  };
}

function shouldRetryViaReaderProxy(status) {
  return status === 403 || status === 410 || status === 429 || status === 451 || status >= 500;
}

async function fetchViaReaderProxy(targetUrl, env) {
  const endpoint = `https://r.jina.ai/${targetUrl}`;
  const headers = {
    accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "x-return-format": "html",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  };
  if (env?.JINA_API_KEY) {
    headers.authorization = `Bearer ${env.JINA_API_KEY}`;
  }
  return fetch(endpoint, { headers, redirect: "follow" });
}

function explainUpstreamStatus(status) {
  if (status === 403) {
    return "The website responded with 403 — it likely blocks automated requests. Paste the job description into the fallback box.";
  }
  if (status === 404) {
    return "The website responded with 404 — the job page may have been removed. Check the URL or paste the description.";
  }
  if (status === 410) {
    return "The website responded with 410 — the job posting has been taken down, or the site is rejecting non-browser requests. Paste the description into the fallback box.";
  }
  if (status === 429) {
    return "The website responded with 429 — too many requests. Try again in a minute or paste the description.";
  }
  if (status === 451) {
    return "The website responded with 451 — the content is unavailable for legal reasons.";
  }
  if (status >= 500) {
    return `The website returned a server error (${status}). Try again later or paste the description.`;
  }
  return `The website responded with ${status}.`;
}

async function collectExternalStyleSignals(html, baseUrl) {
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

function isAllowedStylesheetUrl(resolvedUrl, base) {
  try {
    const target = new URL(resolvedUrl);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    if (target.host === base.host) return true;
    if (/(?:^|\.)fonts\.googleapis\.com$/i.test(target.host)) return true;
    return registrableDomain(target.host) === registrableDomain(base.host);
  } catch {
    return false;
  }
}

function registrableDomain(host) {
  if (!host) return "";
  const parts = host.toLowerCase().split(".");
  if (parts.length < 2) return host.toLowerCase();
  return parts.slice(-2).join(".");
}

function extractCssColors(css) {
  if (!css) return [];
  const colors = [];
  const seen = new Set();
  const colorRe =
    /#[0-9a-f]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|hsla?\(\s*\d+(?:deg)?\s*,\s*\d+%\s*,\s*\d+%(?:\s*,\s*[\d.]+)?\s*\)/gi;
  let match;
  while ((match = colorRe.exec(css)) && colors.length < MAX_REPORTED_COLORS) {
    const key = match[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(match[0]);
  }
  return colors;
}

function extractCssFonts(css) {
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

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function json(payload, status, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
    },
  });
}
