// POST /design-cv-html — asks gpt-5 (vision) for an on-brand HTML CV, then sanitises it.
import { requireSharedSecret } from "../lib/auth.js";
import { fetchWithTimeout, isAbortError, json } from "../lib/http.js";
import { fetchLogoAsDataUrl } from "../lib/logo.js";
import { fetchMicrolinkScreenshot } from "../lib/microlink.js";
import {
  OPENAI_TIMEOUT_MS,
  extractOpenAIError,
  extractOpenAIStructuredAnalysis,
} from "../lib/openai.js";
import { sanitizeGeneratedHtml } from "../lib/sanitiser.js";
import { validateTargetUrl } from "../lib/url-guards.js";

const MAX_STRUCTURED_CV_BYTES = 60_000;
const MAX_CV_LAYOUT_DATA_URL_BYTES = 6_000_000;

const HTML_DESIGN_MODEL = "gpt-5";

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

export async function designCvHtml(request, env, corsHeaders) {
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
