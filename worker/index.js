// Worker secrets (set via `wrangler secret put` or the deploy workflow):
//   OPENAI_API_KEY                 — required for POST /analyse and POST /design-cv-html
//   ANALYSE_SHARED_SECRET          — optional; if set, /analyse and /design-cv-html require Bearer auth.
//                                    Note: the static site embeds this value in its JS bundle (VITE_ANALYSE_SHARED_SECRET),
//                                    so it is OBSCURITY, not a secret. Rotate it if abuse appears, and rely on
//                                    ALLOWED_ORIGINS + per-IP rate limiting (e.g. Cloudflare WAF) as the real boundary.
//   JINA_API_KEY                   — optional; lifts r.jina.ai shared-IP rate limit

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
const MAX_GENERATED_HTML_BYTES = 200_000;
const MAX_STRUCTURED_CV_BYTES = 60_000;
const MAX_CV_LAYOUT_DATA_URL_BYTES = 6_000_000;

const MODEL = "gpt-5";
const HTML_DESIGN_MODEL = "gpt-5";
const MICROLINK_ENDPOINT = "https://api.microlink.io/";

// Cloudflare Workers paid tier allows 30s of CPU time per request but each
// subrequest has its own ~60s default and the wall-clock budget can stretch
// further. OpenAI Responses with gpt-5 + medium reasoning routinely takes
// 30–60s and occasionally hangs. Cap each upstream OpenAI call so a hung
// request returns a clear 504 instead of consuming the whole invocation.
const OPENAI_TIMEOUT_MS = 110_000;

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

const HTML_DESIGN_SYSTEM_PROMPT = `You are a senior brand designer producing a print-ready CV as a single HTML document. The document will be rendered to PDF by headless Chromium, then downloaded by the candidate. You will receive:
- A structured CV (already verified, evidence-only — every fact in there has been checked).
- The employer's brand signals (name, primary/accent/background/text colours, font hints, logo as a data URL, palette).
- A screenshot of the employer's homepage so you can read their visual identity directly.

Your job: produce one self-contained HTML document that presents the CV as if the employer's own in-house design team had laid it out — typography, layout, colour usage, geometry, and rhythm should feel of-a-piece with their homepage.

You may receive up to two reference images, labelled in the user message:
- Image A — the candidate's existing CV. This is the LAYOUT REFERENCE. Reproduce its structural skeleton: section order, single-column vs sidebar, where the name and contact details sit, how experience is presented. Keep the user's structural instincts recognisable in the output.
- Image B — the employer's homepage. This is the BRAND REFERENCE. Use it for typography, colour usage, geometry, density, and mood — the visual voice.

When both images are present, combine them: Image A drives where things go, Image B drives how things look. When only one is present, follow the guidance in the user message. When neither is present, choose a layout that suits the brand signals and the structured CV content. The spacing, typography, and contrast rules below override either reference when they conflict — readability and breathing room always win.

HARD CONSTRAINTS — the renderer will reject HTML that violates these.

PDF / PAGE FORMAT
- A4 PORTRAIT only. The PDF download must be vertical. Page size is exactly 210mm × 297mm.
- In the <style> block, declare \`@page { size: A4 portrait; margin: 0; }\`.
- Wrap each printable page in a \`<section class="page">\` element. Required CSS on .page: \`width: 210mm; min-height: 297mm; padding: 18mm; box-sizing: border-box; overflow: hidden; page-break-after: always;\` (the last .page can use \`page-break-after: auto;\`). Use \`min-height\` — NEVER a fixed \`height: 297mm\` — so content flows naturally and never overflows the page boundary.
- When the content does not fit in one .page, START A NEW \`<section class="page">\` and continue the content there. Do not cram a hero band, sidebar, or branded surface into a single .page if it pushes the body content past 297mm — split the content across two .page elements instead.
- No element may overlap another element's text. Branded surfaces (hero bands, sidebars, side rails, coloured panels) must be NORMAL-FLOW containers that have text INSIDE them — never a \`position: absolute\` layer on top of the body content. \`position: absolute\` is permitted only for tiny decorative accents (a page number, a single decorative dot) that occupy whitespace, not for any element containing text.
- Use CSS flex or grid INSIDE the .page padding for sidebars and multi-column layouts. The container's height should be driven by its content, not fixed.
- Each .page MUST have inner padding of at least 18mm on all four sides — nothing touches the page edge. Leave at least 12mm of clear space at the bottom of every page so the last line never collides with the boundary. Usable content area is therefore ~174mm × 261mm.
- The content area inside each .page must stay within the page — no element may extend beyond \`210mm\` wide or push content past \`297mm\` tall. No horizontal scrolling. No landscape orientation. No rotated content.
- Use \`print-color-adjust: exact; -webkit-print-color-adjust: exact;\` on the body so brand backgrounds render.
- Prefer two breathing pages over one cramped page. Use one page only if the content fits comfortably with the spacing rules below.
- HARD CAP: never produce more than two .page elements. If the content overflows after the spacing rules, condense — in this order: (a) collapse roles older than 5 years into single-line entries (role, organisation, dates only); (b) keep only the 5 most relevant certifications; (c) keep only the 5 most relevant achievements; (d) drop entire optional sections (Achievements, Languages, etc.) if non-essential; (e) shorten bullets. Never spill to a third page.

DOCUMENT STRUCTURE
- Output exactly one HTML document beginning with \`<!DOCTYPE html>\`.
- Exactly one \`<style>\` block inside \`<head>\`. All CSS lives there. No external stylesheets except a single \`@import url(...)\` to fonts.googleapis.com if you need a brand font.
- No JavaScript anywhere: no \`<script>\` tags, no \`on*=\` event handler attributes, no \`javascript:\` URLs.
- No \`<iframe>\`, \`<object>\`, \`<embed>\`, \`<form>\`, \`<input>\`, or \`<button>\`.
- No external images. The only image you may embed is the supplied logo data URL — use it inline as \`<img src="data:image/...">\`.
- Document under 180 KB total. Keep CSS lean.

BRAND FIDELITY — express the brand BOLDLY. A generic Word template tinted with a brand-coloured bullet point is unacceptable output. If the result could be mistaken for a default Microsoft Word CV with a colour swap, you have failed the brief.

- Use the supplied brand colours exactly — do not invent new ones. You may darken/lighten them for surfaces, dividers, and muted text.
- Read the homepage screenshot like a designer: typography (serif/sans/display, weight, case, tracking), density, geometry (sharp vs rounded, the role of accent bars and rules), where colour is used, mood (editorial, brutalist-tech, premium-quiet, corporate-classic, playful, etc.).
- Choose layout, typography, and colour usage so the CV would look at home on that employer's homepage. You are free to invent any layout — single column, sidebar, hero band, magazine grid, monolith — as long as it serves the brand and fits A4 portrait.
- EXPRESS BRAND IN AT LEAST THREE OF THESE WAYS. Tinted bullets and a coloured name alone do not count.
  1. A coloured field, band, or hero strip — at least 12mm tall — using the primary or accent colour.
  2. A brand-aligned heading typeface from Google Fonts that echoes the homepage's typographic voice (display serif for editorial, geometric sans for tech, etc.).
  3. A structural motif that says "this brand": sidebar in the brand colour, vertical side rail, oversized section ordinals, coloured page edge, full-bleed footer, large brand wordmark.
  4. Coloured surfaces behind key elements (profile summary, contact strip, role headers).
  5. Brand-coloured numerals/dates/letter-spacing treatments that mirror the homepage's design language.
- If you use a Google Font, pick one that matches the employer's typographic feel (serif vs sans, neutral vs display, weight). Always declare it via \`@import\` and use it for headings or body, not just decoration.

LOGO RULES — strict
- If a logo data URL is supplied in the user message, embed it as \`<img src="<exact data URL>">\`. Never reference it by any other URL.
- If a logo is NOT supplied, do NOT draw a placeholder rectangle, square, or coloured block where a logo would go. Do not include any image element with an empty or guessed src. Lay the page out so the absence of a logo is not visible — use the employer wordmark in branded type instead. A black or coloured square in place of a logo is the single most common failure mode of this task; you must avoid it.

LAYOUT, SPACING, AND TYPOGRAPHY — non-negotiable design rules for a print-ready document. The output usually looks cramped at first attempt; these rules exist to prevent that.

Page padding
- .page inner padding minimum 18mm (top/right/bottom/left). Larger (22-26mm) for editorial / premium-quiet brands. Never less.
- Reserve ≥ 12mm clear at the bottom of every page.

Typography sizes (use pt or px equivalents; 1pt ≈ 1.333px)
- Name (h1): 26-34pt. Generous weight (bold / display). Tight tracking. 12-18pt margin below.
- Headline / tag under the name: 11-13pt. Light, oblique, or muted colour. 10-14pt below.
- Contact line: 9.5-10.5pt. Muted colour. 14-22pt below the header block.
- Section labels (e.g. PROFILE, EXPERIENCE, SKILLS): 9.5-10.5pt. Either uppercase with 0.12-0.18em letter-spacing OR title-case with a thin rule. Choose one treatment; never both crammed together. 8-12pt clear space below the label before content starts.
- Role title: 11-12pt, semibold or bold. Organisation + location + dates: 10pt regular, on the line beneath the role (or right-aligned on the same baseline if the brand favours that).
- Body text and bullets: 10.5-11pt. Line-height 1.45-1.55. Never below 10pt.

Vertical rhythm (consistent rhythm beats clever density)
- Between sections: 22-30pt of clear space. Do not run sections together with only a divider.
- Between a section label and its first content row: 8-12pt.
- Between role entries within Experience: 14-20pt.
- Between bullets within a role: 4-6pt. Bullets are not paragraphs — keep them tight enough to read as a list, loose enough to scan.
- Bullet glyph (•, –, ·, ▸ etc.): 10-14px horizontal gap to the text. Never let the glyph and the first word touch.

Line length and column structure
- Cap body line length at ~70-85 characters. If a paragraph runs wider in a single column, narrow the column or break to two columns.
- If using a sidebar: gutter between columns ≥ 22mm. Sidebar 32-38% of the content area. Don't pack the sidebar to its edges either — its own inner padding ≥ 6mm.
- Avoid hairline rules (< 1px / < 0.5pt). Use 1pt or thicker, in a muted brand tone. Always leave ≥ 8pt of clear space on either side of a rule.

Contrast and readability
- Body text contrast ≥ 7:1 against the page background. Muted text (dates, locations, captions) ≥ 4.5:1.
- If a brand colour is too light to meet 4.5:1 against the page background, darken it for type and use the original only for accents, rules, or backgrounds.
- Never use coloured text on a same-coloured background. Test the brand colour against your chosen page background before using it for type.

Negative space
- Treat whitespace as a design element, not waste. A confident CV breathes. Don't fill every gap with badges, rules, or coloured blocks.
- Empty space at the bottom of a page is fine — it signals confidence, not unfinished work.

CONTENT FIDELITY (evidence-only)
- Copy CV content verbatim from the structured input. Do not invent skills, dates, employers, metrics, or qualifications.
- Include every section present in the structured CV that has content: name, contact lines, headline, profile, skills, experience (reverse-chronological), education, certifications, additionalSections.
- Lead the document with the candidate's name and headline; place the logo and employer wordmark prominently if you have them.
- Within each experience role, preserve the bullets verbatim and in the order given.

OUTPUT FORMAT
- Return JSON of exact shape { "html": "<!DOCTYPE html>..." }. The html field contains the full document as one string. Nothing else.`;

const HTML_DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["html"],
  properties: {
    html: {
      type: "string",
      description:
        "A complete, self-contained HTML document beginning with <!DOCTYPE html>. Single <style> block, no JavaScript, A4 portrait @page rules, brand colours and supplied logo embedded. Under 180 KB. Each .page element sized exactly 210mm × 297mm. Maximum two pages.",
    },
  },
};

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

    if (url.pathname === "/design-cv-html" && request.method === "POST") {
      return designCvHtml(request, env, corsHeaders);
    }

    if (url.pathname === "/read" && request.method === "POST") {
      return readPage(request, env, corsHeaders);
    }

    return json(
      { error: "Use GET /status, POST /read, POST /analyse, or POST /design-cv-html." },
      404,
      corsHeaders,
    );
  },
};

async function readPage(request, env, corsHeaders) {
  // Same auth as /analyse: without it, anyone who sets a forged Origin header
  // can use the Worker as a free page-fetch proxy (and burn Jina credits).
  if (!requireSharedSecret(request, env)) {
    return json({ error: "Missing or invalid shared secret." }, 401, corsHeaders);
  }

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

  if (!requireSharedSecret(request, env)) {
    return json({ error: "Missing or invalid shared secret." }, 401, corsHeaders);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400, corsHeaders);
  }

  const rawJobText = typeof payload?.jobText === "string" ? payload.jobText : "";
  const rawCvText = typeof payload?.cvText === "string" ? payload.cvText : "";
  if (rawJobText.length > MAX_TEXT_LENGTH || rawCvText.length > MAX_TEXT_LENGTH) {
    return json(
      {
        error: `jobText and cvText must each be ${MAX_TEXT_LENGTH} characters or fewer. Trim the inputs and try again.`,
      },
      413,
      corsHeaders,
    );
  }
  const jobText = rawJobText;
  const cvText = rawCvText;
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
    // The /analyse SYSTEM_PROMPT is large (~800 tokens) and stable across
    // requests. OpenAI auto-caches identical prefixes ≥ 1024 tokens, and
    // prompt_cache_key routes identical-key requests to the same machine,
    // which materially improves hit rate. Cached input tokens are billed
    // at ~50% off — meaningful at scale.
    prompt_cache_key: "cv-job-tailor-analyse",
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

  let response;
  try {
    response = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      OPENAI_TIMEOUT_MS,
    );
  } catch (error) {
    if (isAbortError(error)) {
      return json(
        { error: `OpenAI analysis did not respond within ${Math.round(OPENAI_TIMEOUT_MS / 1000)}s.` },
        504,
        corsHeaders,
      );
    }
    throw error;
  }

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

async function designCvHtml(request, env, corsHeaders) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "The Worker is missing its OPENAI_API_KEY secret." }, 500, corsHeaders);
  }

  if (!requireSharedSecret(request, env)) {
    return json({ error: "Missing or invalid shared secret." }, 401, corsHeaders);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400, corsHeaders);
  }

  const structuredCv = payload?.structuredCv;
  if (!structuredCv || typeof structuredCv !== "object") {
    return json({ error: "structuredCv is required." }, 400, corsHeaders);
  }
  const structuredCvJson = JSON.stringify(structuredCv);
  if (structuredCvJson.length > MAX_STRUCTURED_CV_BYTES) {
    return json({ error: "structuredCv is too large." }, 413, corsHeaders);
  }

  const brand = sanitizeBrandHint(payload?.brand);
  const jobTitle = typeof payload?.jobTitle === "string" ? payload.jobTitle.slice(0, 200) : "";
  const employerName = typeof payload?.employerName === "string" ? payload.employerName.slice(0, 200) : "";
  const websiteUrl = typeof payload?.employerHomepageUrl === "string" ? payload.employerHomepageUrl.trim() : "";

  let screenshotUrl = "";
  if (websiteUrl) {
    let validatedUrl;
    try {
      validatedUrl = validateTargetUrl(websiteUrl);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid employerHomepageUrl." }, 400, corsHeaders);
    }
    try {
      const screenshot = await fetchMicrolinkScreenshot(validatedUrl);
      screenshotUrl = screenshot.url;
    } catch (error) {
      // Soft-fail: design without the screenshot if Microlink is down.
      screenshotUrl = "";
    }
  }

  let logoDataUrl = "";
  if (typeof payload?.logoUrl === "string" && payload.logoUrl.trim()) {
    try {
      logoDataUrl = await fetchLogoAsDataUrl(payload.logoUrl.trim());
    } catch {
      logoDataUrl = "";
    }
  }

  let cvLayoutDataUrl = "";
  if (typeof payload?.cvLayoutDataUrl === "string" && payload.cvLayoutDataUrl.startsWith("data:image/")) {
    if (payload.cvLayoutDataUrl.length > MAX_CV_LAYOUT_DATA_URL_BYTES) {
      return json({ error: "cvLayoutDataUrl is too large." }, 413, corsHeaders);
    }
    cvLayoutDataUrl = payload.cvLayoutDataUrl;
  }

  const userContent = [
    {
      type: "input_text",
      text: buildHtmlDesignPromptText({
        structuredCvJson,
        brand,
        jobTitle,
        employerName,
        websiteUrl,
        logoDataUrl,
        hasCvLayoutImage: Boolean(cvLayoutDataUrl),
        hasEmployerImage: Boolean(screenshotUrl),
      }),
    },
  ];
  if (cvLayoutDataUrl) {
    userContent.push({
      type: "input_text",
      text: "REFERENCE IMAGE A — the candidate's existing CV. Use this as the LAYOUT reference: section order, hierarchy, single-column vs sidebar, where contact details sit, how the candidate presents experience. Reproduce this structural skeleton in HTML, then restyle it in the employer's brand voice.",
    });
    userContent.push({ type: "input_image", image_url: cvLayoutDataUrl });
  }
  if (screenshotUrl) {
    userContent.push({
      type: "input_text",
      text: "REFERENCE IMAGE B — the employer's homepage. Use this as the BRAND reference: typography (serif/sans/display, weight, case, tracking), colour usage, geometry, density, mood. Apply this visual voice to the candidate's CV layout.",
    });
    userContent.push({ type: "input_image", image_url: screenshotUrl });
  }

  const body = {
    model: HTML_DESIGN_MODEL,
    input: [
      { role: "system", content: HTML_DESIGN_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    // HTML_DESIGN_SYSTEM_PROMPT is ~1500 tokens and never changes per
    // request. See the /analyse handler for the rationale on
    // prompt_cache_key. The design path benefits more — larger system
    // prompt, more reasoning tokens — so the cached-input discount is
    // worth the most here.
    prompt_cache_key: "cv-job-tailor-design",
    reasoning: { effort: "medium" },
    text: {
      format: {
        type: "json_schema",
        name: "cv_html_design",
        strict: true,
        schema: HTML_DESIGN_SCHEMA,
      },
    },
  };

  let response;
  try {
    response = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      OPENAI_TIMEOUT_MS,
    );
  } catch (error) {
    if (isAbortError(error)) {
      return json(
        { error: `OpenAI design did not respond within ${Math.round(OPENAI_TIMEOUT_MS / 1000)}s.` },
        504,
        corsHeaders,
      );
    }
    throw error;
  }

  const rawText = await response.text();
  if (!response.ok) {
    const message = extractOpenAIError(rawText) || `OpenAI design failed with HTTP ${response.status}.`;
    return json({ error: message }, 502, corsHeaders);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return json({ error: "OpenAI returned non-JSON." }, 502, corsHeaders);
  }

  const designed = extractOpenAIStructuredAnalysis(parsed);
  if (!designed || typeof designed.html !== "string") {
    return json({ error: "OpenAI returned no HTML document." }, 502, corsHeaders);
  }

  let safeHtml;
  try {
    safeHtml = sanitizeGeneratedHtml(designed.html);
  } catch (error) {
    return json(
      { error: `The generated HTML failed safety checks: ${error instanceof Error ? error.message : "unknown"}` },
      502,
      corsHeaders,
    );
  }

  return json(
    {
      html: safeHtml,
      screenshotUrl,
      inputs: {
        hadCvLayout: Boolean(cvLayoutDataUrl),
        hadEmployerScreenshot: Boolean(screenshotUrl),
        hadLogo: Boolean(logoDataUrl),
      },
    },
    200,
    corsHeaders,
  );
}

function buildHtmlDesignPromptText({
  structuredCvJson,
  brand,
  jobTitle,
  employerName,
  websiteUrl,
  logoDataUrl,
  hasCvLayoutImage,
  hasEmployerImage,
}) {
  const lines = [
    `Employer name: ${employerName || brand.companyName || "Unknown"}`,
    `Employer website: ${websiteUrl || "Unknown"}`,
    `Job title: ${jobTitle || "Unknown"}`,
    "",
    "Brand signals:",
    `- Primary colour: ${brand.primaryColor || "Unknown"}`,
    `- Accent colour: ${brand.accentColor || "Unknown"}`,
    `- Background colour: ${brand.backgroundColor || "Unknown"}`,
    `- Text colour: ${brand.textColor || "Unknown"}`,
    `- Body font hint: ${brand.fontFamily || "Unknown"}`,
    `- Palette: ${(brand.palette || []).join(", ") || "Unknown"}`,
    `- Logo: ${logoDataUrl ? "supplied (embed inline as <img src=\"<logo>\">)" : "not available"}`,
    "",
    "Reference images supplied with this message:",
    `- Image A (candidate's existing CV — layout reference): ${hasCvLayoutImage ? "present" : "not available"}`,
    `- Image B (employer's homepage — brand reference): ${hasEmployerImage ? "present" : "not available"}`,
    "",
    "Structured CV (JSON — copy content verbatim, do not invent):",
    structuredCvJson,
  ];
  if (logoDataUrl) {
    lines.push("", "Logo data URL (use this exact string as the <img src>):", logoDataUrl);
  }
  lines.push("", "How to combine the references:");
  if (hasCvLayoutImage && hasEmployerImage) {
    lines.push(
      "- Image A controls STRUCTURE: section order, single-column vs sidebar, where contact details and the headline sit, how Experience is laid out, how Skills/Education are grouped. Reproduce the candidate's structural choices.",
      "- Image B controls VISUAL VOICE: typography (serif/sans/display, weight, case, tracking), colour usage, geometry (sharp vs rounded, the role of accent bars and rules), density, mood. Apply this voice to the structure from Image A.",
      "- If the two references disagree on rhythm (e.g. dense vs airy), favour the LAYOUT, SPACING, AND TYPOGRAPHY rules in the system prompt — readability wins.",
    );
  } else if (hasCvLayoutImage) {
    lines.push(
      "- Image A controls STRUCTURE: section order, single-column vs sidebar, where contact details and the headline sit, how Experience is laid out. Reproduce the candidate's structural choices.",
      "- No employer screenshot is available. Use the brand colour and font signals above to set visual voice, and follow the LAYOUT, SPACING, AND TYPOGRAPHY rules in the system prompt for everything else.",
    );
  } else if (hasEmployerImage) {
    lines.push(
      "- No candidate CV layout image is available. Choose a layout that suits the employer's brand voice from Image B and the structured CV content.",
      "- Image B controls VISUAL VOICE: typography, colour usage, geometry, density, mood. Apply it across the layout you choose.",
    );
  } else {
    lines.push(
      "- No reference images are available. Choose a layout that suits the brand colour and font signals above and the structured CV content. Follow the LAYOUT, SPACING, AND TYPOGRAPHY rules strictly.",
    );
  }
  lines.push(
    "",
    "Produce one self-contained HTML document per the constraints in the system prompt. Remember: A4 portrait, vertical layout, each .page exactly 210mm × 297mm, no JavaScript, brand colours used exactly.",
  );
  return lines.join("\n");
}

async function fetchLogoAsDataUrl(logoUrl) {
  // Gate the upstream fetch on the same private-host allowlist as /read so
  // a caller can't ask the Worker to fetch http://127.0.0.1/... and embed
  // the response. redirect: "manual" closes the redirect-to-internal bypass —
  // if a logo CDN legitimately redirects, the caller should supply the
  // canonical URL.
  const validated = validateTargetUrl(logoUrl);
  const upstream = await fetch(validated, {
    headers: {
      ...browserLikeHeaders(validated),
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    redirect: "manual",
  });
  if (upstream.status >= 300 && upstream.status < 400) {
    throw new Error("Logo URL redirected; refusing to follow.");
  }
  if (!upstream.ok) {
    throw new Error(`Logo fetch failed with ${upstream.status}.`);
  }
  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unsupported logo content type: ${contentType || "unknown"}.`);
  }
  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Logo image is too large to embed.");
  }
  const base64 = bufferToBase64(buffer);
  return `data:${contentType};base64,${base64}`;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

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

export function sanitizeBrandHint(value) {
  if (!value || typeof value !== "object") return {};
  const safe = {};
  for (const key of [
    "companyName",
    "primaryColor",
    "accentColor",
    "backgroundColor",
    "textColor",
    "fontFamily",
  ]) {
    if (typeof value[key] === "string") safe[key] = value[key].slice(0, 200);
  }
  if (Array.isArray(value.palette)) {
    safe.palette = value.palette
      .filter((entry) => typeof entry === "string")
      .slice(0, 8)
      .map((entry) => entry.slice(0, 32));
  }
  return safe;
}

async function fetchMicrolinkScreenshot(targetUrl) {
  const apiUrl = new URL(MICROLINK_ENDPOINT);
  apiUrl.searchParams.set("url", targetUrl);
  apiUrl.searchParams.set("screenshot", "true");
  apiUrl.searchParams.set("meta", "false");
  apiUrl.searchParams.set("viewport.width", "1440");
  apiUrl.searchParams.set("viewport.height", "900");
  apiUrl.searchParams.set("screenshot.fullPage", "false");

  const response = await fetch(apiUrl.toString(), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Microlink responded with HTTP ${response.status}.`);
  }
  const payload = await response.json().catch(() => null);
  const url = payload?.data?.screenshot?.url;
  if (typeof url !== "string" || !url) {
    throw new Error("Microlink did not return a screenshot URL.");
  }
  // The screenshot URL is forwarded to OpenAI as input_image.image_url, so
  // re-validate it before trusting it — Microlink should always return an
  // https URL on a public host, but a compromised or misconfigured upstream
  // could otherwise have the Worker hand a private-host URL to OpenAI.
  const validated = validateTargetUrl(url);
  return { url: validated };
}

export function extractOpenAIStructuredAnalysis(payload) {
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

export function extractOpenAIError(rawText) {
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

export function validateTargetUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing URL.");
  }

  const targetUrl = new URL(value);
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  if (isPrivateOrLocalHost(targetUrl.hostname)) {
    throw new Error("URLs pointing at internal or private hosts are not allowed.");
  }

  return targetUrl.toString();
}

export function isPrivateOrLocalHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (/^(?:0|10|127)\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const m172 = host.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (host === "::" || host === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  return false;
}

export function isReadableContent(contentType) {
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

export function shouldRetryViaReaderProxy(status) {
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

export function explainUpstreamStatus(status) {
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

export function isAllowedStylesheetUrl(resolvedUrl, base) {
  try {
    const target = new URL(resolvedUrl);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    if (isPrivateOrLocalHost(target.hostname)) return false;
    const targetHost = target.host.toLowerCase();
    const baseHost = base.host.toLowerCase();
    if (targetHost === baseHost) return true;
    if (/(?:^|\.)fonts\.googleapis\.com$/i.test(targetHost)) return true;
    return targetHost.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${targetHost}`);
  } catch {
    return false;
  }
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

export async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function isAbortError(error) {
  return Boolean(error) && (error.name === "AbortError" || error.code === "ABORT_ERR");
}

// True when the request may proceed: either no shared secret is configured,
// or the caller presented the matching Bearer token.
export function requireSharedSecret(request, env) {
  if (!env.ANALYSE_SHARED_SECRET) return true;
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  return timingSafeEqual(provided, env.ANALYSE_SHARED_SECRET);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length, 1);
  let result = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    result |= ac ^ bc;
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
