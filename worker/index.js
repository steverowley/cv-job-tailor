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

const MODEL = "gpt-5";

const SYSTEM_PROMPT = `You are a senior CV writer producing a tailored, single-document CV for one specific job application. Your output is rendered into a branded PDF, so length, tone, and structure matter as much as content.

CORE RULES — non-negotiable
- Evidence-only. Use only facts present in the candidate's CV: employers, roles, dates, locations, tools, achievements, qualifications, metrics. Never invent, embellish, infer, or guess. If the job description (JD) asks for a skill the CV does not evidence, omit it from the CV and add it to \`gaps\`.
- Preserve real contact details, names, employer names, dates, locations, and qualifications exactly as written in the source CV. Do not "normalise" or rephrase them.
- Mirror the JD's vocabulary when the candidate's CV evidences the same concept under a different name (e.g. "React" ↔ "ReactJS", "stakeholder workshops" ↔ "discovery sessions"). Do not translate a concept the candidate does not have.
- No fabricated metrics. If a number is in the source CV, use it. If not, describe scope qualitatively (team size, system scale, audience) using language the CV supports.

WRITING STYLE
- Third person, no first-person pronouns. Past tense for past roles, present tense for the current role.
- Specific over generic. Numbers, scale, named tools, named outcomes beat adjectives.
- Active verbs lead every bullet: Led, Built, Shipped, Designed, Owned, Migrated, Reduced, Scaled, Automated, Negotiated, Mentored, Recovered, Launched.
- Banned phrases: "passionate", "results-driven", "team player", "hit the ground running", "go-getter", "synergy", "duties included", "responsible for", "tasked with", "helped to".
- No buzzword stacks. One sharp claim beats three vague ones.

LENGTH AND SECTION TARGETS
- \`tailoredCv.fullCv.headline\` and top-level \`headline\`: ≤ 80 characters. A tight role-aligned tag — not a sentence. Example: "Senior Product Designer — fintech, design systems, B2B SaaS".
- \`summary\` and \`fullCv.profile\`: 3–4 sentences, 60–90 words. Lead with seniority + discipline + years of experience; close with a value proposition aligned to the JD.
- \`coreSkills\` and \`fullCv.skills\` (these render in a narrow sidebar): 8–14 short noun phrases. Single tools, methods, or disciplines — e.g. "React", "Design systems", "Stakeholder workshops". No sentences, no commas-within-items. Order by JD relevance.
- \`experienceBullets\` (the top 3–5 strongest JD-aligned wins drawn from across the whole CV): 15–25 words each. Action verb + scope + outcome.
- \`fullCv.experience[].bullets\`: 3–5 bullets for the current/most recent role, 2–3 for roles 3–8 years old, 1–2 for older roles. Each bullet: action verb + scope + outcome/metric. 15–25 words. Within a role, order bullets by JD relevance, not chronology.
- \`fullCv.education\` and \`fullCv.certifications\`: short noun phrases — qualification, institution, year (if the CV has it). Don't paraphrase awards.
- \`fullCv.additionalSections\`: only include a section if the source CV has clear content for it (e.g. "Speaking", "Open source", "Publications", "Languages"). Do not invent sections to pad the page.

ORDERING AND SELECTION
- Reorder experience bullets and skills by JD relevance, but keep roles in reverse-chronological order.
- Drop bullets that have no bearing on the JD when a role has too many; keep the strongest evidence-backed ones.
- Older roles (>10 years) can be condensed to one line, or rolled into a single "Earlier roles" entry if appropriate.

REVIEW FIELDS
- \`evidenceMatches\`: for each required or preferred JD skill, give the cvEvidence (a short quote or paraphrase from the source CV) and a confidence of strong / partial / gap.
- \`gaps\`: JD requirements the source CV does not evidence. Be specific — "No evidence of Kubernetes" beats "Some infra gaps".
- \`cautions\`: any unusual editorial choice you made (e.g. "Condensed two early-career roles", "Dropped expired AWS cert", "Mirrored 'product discovery' to JD term 'user research'").

OUTPUT EXPECTATIONS
- The CV must read as confidently written, specific, and visibly tailored to the JD — without padding, repetition, or hype.
- Target one strong page; spill to two pages only if senior-experience depth justifies it.
- The exact JSON schema is enforced. Field descriptions inside the schema repeat these targets — follow them.`;

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["jobTitle", "employerName", "skills", "tailoredCv"],
  properties: {
    jobTitle: {
      type: "string",
      description: "The role title as advertised in the JD, verbatim.",
    },
    employerName: {
      type: "string",
      description: "The hiring company's name as it appears in the JD or employer hint.",
    },
    skills: {
      type: "array",
      description:
        "Every distinct skill, tool, responsibility, or tone signal the JD asks for. Group nothing; one item per concept. Order strongest signals first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "priority", "evidenceNeeded"],
        properties: {
          name: { type: "string", description: "Short noun phrase using the JD's own wording where possible." },
          priority: {
            type: "string",
            enum: ["required", "preferred", "tool", "responsibility", "tone"],
            description:
              "required = must-have hard skill; preferred = nice-to-have; tool = named technology; responsibility = activity the role performs; tone = soft-signal / culture cue.",
          },
          evidenceNeeded: {
            type: "string",
            description: "One sentence describing what a strong CV proof would look like for this skill.",
          },
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
        headline: {
          type: "string",
          description:
            "≤ 80 characters. Tight role-aligned tag. Not a sentence. Example: 'Senior Product Designer — fintech, design systems, B2B SaaS'.",
        },
        summary: {
          type: "string",
          description:
            "Review-pane summary, 3–4 sentences, 60–90 words. Third person. Lead with seniority + discipline + years; close with JD-aligned value proposition. Evidence-only.",
        },
        coreSkills: {
          type: "array",
          description:
            "8–14 short noun phrases highlighting the candidate's strongest JD-aligned skills. Single tools, methods, or disciplines. No sentences. Order by JD relevance.",
          items: { type: "string" },
        },
        experienceBullets: {
          type: "array",
          description:
            "The 3–5 strongest JD-aligned achievement bullets pulled from across the candidate's whole career. Each 15–25 words, action verb + scope + outcome. Evidence-only.",
          items: { type: "string" },
        },
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
            name: {
              type: "string",
              description: "Candidate's full name, copied verbatim from the source CV.",
            },
            contactLines: {
              type: "array",
              description:
                "Each contact line as a separate string: email, phone, location, LinkedIn, portfolio, etc. Verbatim from the source CV. Do not invent.",
              items: { type: "string" },
            },
            headline: {
              type: "string",
              description:
                "≤ 80 characters. The same tight role-aligned tag rendered under the candidate's name on the PDF. Not a sentence.",
            },
            profile: {
              type: "string",
              description:
                "Opening paragraph of the rendered CV. 3–4 sentences, 60–90 words. Third person, no 'I'. Lead with seniority + discipline + years; close with JD-aligned value proposition. Evidence-only.",
            },
            skills: {
              type: "array",
              description:
                "Sidebar skills list (narrow column). 8–14 short noun phrases. Single tools, methods, or disciplines. No sentences. Order by JD relevance.",
              items: { type: "string" },
            },
            experience: {
              type: "array",
              description:
                "Reverse-chronological roles. Current/most recent role first. Older roles get shorter bullet lists; roles >10y old can be condensed to one line.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["role", "organisation", "dates", "location", "bullets"],
                properties: {
                  role: { type: "string", description: "Job title verbatim from the source CV." },
                  organisation: { type: "string", description: "Employer name verbatim from the source CV." },
                  dates: {
                    type: "string",
                    description:
                      "Date range verbatim from the source CV (e.g. 'Jan 2022 – Present', '2018 – 2021').",
                  },
                  location: { type: "string", description: "Location verbatim from the source CV, or empty string if absent." },
                  bullets: {
                    type: "array",
                    description:
                      "3–5 bullets for current/recent roles, 2–3 for roles 3–8 years old, 1–2 for older roles. Each 15–25 words. Action verb + scope + outcome/metric. Ordered by JD relevance.",
                    items: { type: "string" },
                  },
                },
              },
            },
            education: {
              type: "array",
              description:
                "Short noun phrases — qualification, institution, year (if present in the source CV). Verbatim where possible. Do not paraphrase awards or grades.",
              items: { type: "string" },
            },
            certifications: {
              type: "array",
              description:
                "Short noun phrases — certification, issuer, year (if present). Verbatim where possible. Empty array if the CV has none.",
              items: { type: "string" },
            },
            additionalSections: {
              type: "array",
              description:
                "Optional sections (e.g. 'Speaking', 'Open source', 'Publications', 'Languages'). Only include if the source CV has clear content for them. Do not invent.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "items"],
                properties: {
                  title: { type: "string", description: "Short section heading." },
                  items: { type: "array", items: { type: "string" }, description: "Short noun phrases or one-line entries." },
                },
              },
            },
          },
        },
        evidenceMatches: {
          type: "array",
          description:
            "One entry per required or preferred JD skill. cvEvidence is a short quote or paraphrase from the source CV. confidence = strong (clear, recent proof), partial (related but indirect), or gap (no evidence — also list in gaps).",
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
        gaps: {
          type: "array",
          description:
            "JD requirements the source CV does not evidence. Specific phrasing: 'No evidence of Kubernetes' beats 'Some infra gaps'.",
          items: { type: "string" },
        },
        cautions: {
          type: "array",
          description:
            "Editorial choices the reviewer should know about — condensed roles, dropped certifications, vocabulary mirroring, etc.",
          items: { type: "string" },
        },
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
    [
      "Produce two things in the structured output:",
      "1. A skills analysis of the JD (skills array).",
      "2. A complete, evidence-only tailored CV (tailoredCv → fullCv) built from the candidate's existing CV.",
      "",
      "The fullCv must be a finished CV document, not a sketch. Preserve real contact details, names, employer names, dates, locations, education, and certifications verbatim. Reorder, select, and rewrite only where the source CV evidences it. Mirror the JD's vocabulary when the CV evidences the same concept. Never invent skills, metrics, tools, or outcomes — list any JD requirement the CV does not evidence in gaps. Follow the section length and style targets in the system prompt and the per-field guidance in the JSON schema.",
    ].join("\n"),
  ].join("\n\n");

  const body = {
    model: MODEL,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    reasoning: { effort: "medium" },
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
