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
        "evidenceMatches",
        "gaps",
        "cautions",
      ],
      properties: {
        headline: { type: "string" },
        summary: { type: "string" },
        coreSkills: { type: "array", items: { type: "string" } },
        experienceBullets: { type: "array", items: { type: "string" } },
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
  apiKey: string;
  jobText: string;
  cvText: string;
  employerHint?: string;
}): Promise<AnalysisResult> {
  const { apiKey, jobText, cvText, employerHint } = params;

  if (!apiKey.trim()) {
    throw new Error("Add your OpenAI API key before analysing the CV.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
            "Return a concise, evidence-only CV tailoring analysis. The final CV should use only facts present in the CV text.",
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
    }),
  });

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
