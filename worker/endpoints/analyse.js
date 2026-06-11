// POST /analyse — sends job + CV text to the OpenAI Responses API for the structured analysis.
import { requireSharedSecret } from "../lib/auth.js";
import { fetchWithTimeout, isAbortError, json } from "../lib/http.js";
import {
  OPENAI_TIMEOUT_MS,
  extractOpenAIError,
  extractOpenAIStructuredAnalysis,
} from "../lib/openai.js";
import { formatSseEvent, parseSseStream } from "../lib/sse.js";

const MAX_TEXT_LENGTH = 60_000;

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

export async function analyseWithOpenAI(request, env, corsHeaders) {
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

  // Clients that ask for an event stream get coarse progress events sourced
  // from OpenAI's own stream; everything else (the eval suite, older deploys
  // of the frontend) keeps the original JSON response.
  if ((request.headers.get("accept") || "").includes("text/event-stream")) {
    return streamAnalysis(request, env, corsHeaders, body);
  }

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

async function streamAnalysis(request, env, corsHeaders, body) {
  // Like fetchWithTimeout, the timeout only guards time-to-headers. The
  // controller additionally follows the client's own abort signal for the
  // whole stream, so a closed tab cancels the upstream OpenAI call instead
  // of paying for tokens nobody will read.
  const controller = new AbortController();
  const onClientAbort = () => controller.abort();
  if (request.signal) {
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", onClientAbort);
  }
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return json(
        { error: `OpenAI analysis did not respond within ${Math.round(OPENAI_TIMEOUT_MS / 1000)}s.` },
        504,
        corsHeaders,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!upstream.ok) {
    const rawText = await upstream.text();
    const message = extractOpenAIError(rawText) || `OpenAI analysis failed with HTTP ${upstream.status}.`;
    return json({ error: message }, 502, corsHeaders);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const map = createAnalysisStreamMapper();

  (async () => {
    try {
      for await (const frame of parseSseStream(upstream.body)) {
        let event;
        try {
          event = JSON.parse(frame.data);
        } catch {
          continue;
        }
        for (const outgoing of map(event)) {
          await writer.write(encoder.encode(formatSseEvent(outgoing)));
          if (outgoing.type === "complete" || outgoing.type === "error") {
            return;
          }
        }
      }
      await writer.write(
        encoder.encode(formatSseEvent({ type: "error", error: "OpenAI stream ended unexpectedly." })),
      );
    } catch (error) {
      try {
        await writer.write(
          encoder.encode(
            formatSseEvent({
              type: "error",
              error: error instanceof Error ? error.message : "The analysis stream failed.",
            }),
          ),
        );
      } catch {
        // The client is gone; nothing left to tell it.
      }
      controller.abort();
    } finally {
      if (request.signal) {
        request.signal.removeEventListener("abort", onClientAbort);
      }
      try {
        await writer.close();
      } catch {
        // Already closed or errored.
      }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

// Maps OpenAI Responses stream events to the coarse events the frontend
// understands: stage markers, byte-count progress, then a terminal
// complete/error. Stateful across calls; create one mapper per stream.
export function createAnalysisStreamMapper() {
  let sawReasoning = false;
  let sawDraft = false;
  let text = "";
  let lastReportedLength = 0;

  return function map(event) {
    const outgoing = [];
    const type = event?.type;
    if (type === "response.created") {
      outgoing.push({ type: "stage", stage: "accepted" });
    } else if (type === "response.output_item.added" && event.item?.type === "reasoning" && !sawReasoning) {
      sawReasoning = true;
      outgoing.push({ type: "stage", stage: "reasoning" });
    } else if (type === "response.output_text.delta") {
      if (!sawDraft) {
        sawDraft = true;
        outgoing.push({ type: "stage", stage: "drafting" });
      }
      text += typeof event.delta === "string" ? event.delta : "";
      if (text.length - lastReportedLength >= 2_000) {
        lastReportedLength = text.length;
        outgoing.push({ type: "progress", chars: text.length });
      }
    } else if (type === "response.completed") {
      let analysis = null;
      if (text.trim()) {
        try {
          analysis = JSON.parse(text);
        } catch {
          analysis = null;
        }
      }
      if (!analysis) {
        analysis = extractOpenAIStructuredAnalysis(event.response);
      }
      outgoing.push(
        analysis
          ? { type: "complete", analysis }
          : { type: "error", error: "OpenAI returned no structured analysis." },
      );
    } else if (type === "response.failed") {
      outgoing.push({
        type: "error",
        error: event.response?.error?.message || "OpenAI analysis failed.",
      });
    } else if (type === "error") {
      outgoing.push({ type: "error", error: event.message || "OpenAI stream error." });
    }
    return outgoing;
  };
}
