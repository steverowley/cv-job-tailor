import { AnalysisResult } from "./types";

const MODEL = "gpt-5.4";

const schema = {
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
} as const;

export async function analyseCvAgainstJob(params: {
  apiKey?: string;
  workerUrl?: string;
  jobText: string;
  cvText: string;
  employerHint?: string;
}): Promise<AnalysisResult> {
  const { apiKey = "", workerUrl = "", jobText, cvText, employerHint } = params;

  const body = buildAnalysisBody(jobText, cvText, employerHint);

  if (!apiKey.trim() && workerUrl.trim()) {
    const response = await fetch(`${workerUrl.replace(/\/+$/, "")}/analyse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return parseAnalysisResponse(response);
  }

  if (!apiKey.trim()) {
    throw new Error("Add your OpenAI API key or configure the Cloudflare Worker secret before analysing the CV.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseAnalysisResponse(response);
}

function buildAnalysisBody(jobText: string, cvText: string, employerHint?: string) {
  return {
    model: MODEL,
    input: [
      {
        role: "system",
        content:
          "You tailor CVs for job applications. You must be evidence-only: never invent experience, employers, qualifications, dates, tools, outcomes, or responsibilities. If a requirement is not clearly supported by the CV, mark it as a gap.",
      },
      {
        role: "user",
        content: [
          `Employer hint: ${employerHint || "Unknown"}`,
          "JOB DESCRIPTION:",
          jobText.slice(0, 18000),
          "CV TEXT:",
          cvText.slice(0, 18000),
          "Return both a review and a full, usable, evidence-only CV. The fullCv field must be a complete CV document built from the existing CV content, tailored toward the job. Preserve real contact details, roles, organisations, dates, education, and certifications when present. Reorder, select, and rewrite only where supported by the CV. Do not include unsupported job requirements in the CV; put them in gaps instead.",
        ].join("\n\n"),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "cv_tailoring_analysis",
        strict: true,
        schema,
      },
    },
  };
}

async function parseAnalysisResponse(response: Response): Promise<AnalysisResult> {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI analysis failed.");
  }

  const outputText = payload.output_text || extractOutputText(payload);
  if (!outputText) {
    throw new Error("OpenAI returned no structured analysis.");
  }

  return JSON.parse(outputText) as AnalysisResult;
}

function extractOutputText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("output" in payload)) {
    return undefined;
  }

  const output = (payload as { output?: Array<{ content?: Array<{ text?: string }> }> }).output;
  return output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text)
    .find(Boolean);
}
