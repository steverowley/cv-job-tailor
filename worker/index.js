const ALLOWED_ORIGINS = new Set([
  "https://steverowley.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const MAX_HTML_LENGTH = 500_000;
const MAX_TEXT_LENGTH = 60_000;
const MAX_IMAGE_BYTES = 2_000_000;

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 8000;
const ANTHROPIC_VERSION = "2023-06-01";

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
          hasAnthropicKey: Boolean(env.ANTHROPIC_API_KEY),
          requiresSharedSecret: Boolean(env.ANALYSE_SHARED_SECRET),
        },
        200,
        corsHeaders,
      );
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "This Worker only accepts requests from the CV Job Tailor app." }, 403, corsHeaders);
    }

    if (url.pathname === "/analyse" && request.method === "POST") {
      return analyseWithClaude(request, env, corsHeaders);
    }

    if (url.pathname === "/proxy-image" && request.method === "GET") {
      return proxyImage(url, corsHeaders);
    }

    if (url.pathname === "/read" && request.method === "POST") {
      return readPage(request, corsHeaders);
    }

    return json(
      { error: "Use GET /status, POST /read, POST /analyse, or GET /proxy-image." },
      404,
      corsHeaders,
    );
  },
};

async function readPage(request, corsHeaders) {
  try {
    const body = await request.json();
    const targetUrl = validateTargetUrl(body?.url);
    const response = await fetch(targetUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": "CVJobTailor/1.0 (+https://steverowley.github.io/cv-job-tailor/)",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return json({ error: `The website responded with ${response.status}.` }, 502, corsHeaders);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!isReadableContent(contentType)) {
      return json({ error: `Unsupported content type: ${contentType || "unknown"}.` }, 415, corsHeaders);
    }

    const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
    return json(
      {
        html,
        finalUrl: response.url,
        contentType,
        truncated: html.length >= MAX_HTML_LENGTH,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The website could not be read." }, 400, corsHeaders);
  }
}

async function analyseWithClaude(request, env, corsHeaders) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "The Worker is missing its ANTHROPIC_API_KEY secret." }, 500, corsHeaders);
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

  const body = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        name: "cv_tailoring_analysis",
        schema: ANALYSIS_SCHEMA,
      },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Employer hint: ${employerHint || "Unknown"}`,
              "JOB DESCRIPTION:",
              jobText,
              "CV TEXT:",
              cvText,
              "Return both a review and a full, usable, evidence-only CV. The fullCv field must be a complete CV document built from the existing CV content, tailored toward the job. Preserve real contact details, roles, organisations, dates, education, and certifications when present. Reorder, select, and rewrite only where supported by the CV. Do not include unsupported job requirements in the CV; put them in gaps instead.",
            ].join("\n\n"),
          },
        ],
      },
    ],
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const message = extractAnthropicError(rawText) || `Claude analysis failed with HTTP ${response.status}.`;
    return json({ error: message }, 502, corsHeaders);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return json({ error: "Claude returned non-JSON." }, 502, corsHeaders);
  }

  const analysis = extractStructuredAnalysis(parsed);
  if (!analysis) {
    return json({ error: "Claude returned no structured analysis." }, 502, corsHeaders);
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
      "user-agent": "CVJobTailor/1.0 (+https://steverowley.github.io/cv-job-tailor/)",
      accept: "image/*",
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

function extractStructuredAnalysis(payload) {
  if (!payload || !Array.isArray(payload.content)) {
    return null;
  }

  for (const block of payload.content) {
    if (block?.type === "text" && typeof block.text === "string") {
      try {
        return JSON.parse(block.text);
      } catch {
        continue;
      }
    }
    if (block?.type === "json" && block.json) {
      return block.json;
    }
  }

  return null;
}

function extractAnthropicError(rawText) {
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
