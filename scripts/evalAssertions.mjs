/**
 * Pure assertion helpers for the eval suite. Extracted from scripts/eval.mjs
 * so they can be unit-tested without hitting the deployed Worker.
 */

export const BANNED_PHRASES = [
  "passionate",
  "results-driven",
  "team player",
  "hit the ground running",
  "go-getter",
  "synergy",
  "duties included",
  "responsible for",
  "tasked with",
  "helped to",
];

export const HEADLINE_MAX_CHARS = 80;
export const SUMMARY_WORD_RANGE = [50, 100];
export const CORE_SKILLS_RANGE = [8, 14];
export const BULLET_WORD_RANGE = [12, 30];
export const EXPERIENCE_BULLETS_RANGE = [3, 5];

const STOP_TOKENS = new Set(["skills", "skill", "design", "and", "with", "the", "for"]);

export function runAssertions(cvText, analysis) {
  const failures = [];
  failures.push(...assertSchema(analysis));
  // Schema must be sound before deeper checks — bail early to avoid
  // cascade failures from accessing missing nested fields.
  if (failures.length > 0) return failures;
  failures.push(...assertBannedPhrases(analysis));
  failures.push(...assertLengthBudgets(analysis));
  failures.push(...assertPreservation(cvText, analysis));
  failures.push(...assertNoFabricatedSkills(cvText, analysis));
  return failures;
}

export function assertSchema(analysis) {
  const failures = [];
  if (typeof analysis !== "object" || analysis === null) {
    return ["analysis is not an object"];
  }
  if (typeof analysis.jobTitle !== "string" || !analysis.jobTitle.trim()) {
    failures.push("jobTitle missing or empty");
  }
  if (!Array.isArray(analysis.skills) || analysis.skills.length === 0) {
    failures.push("skills missing or empty");
  }
  const tailored = analysis.tailoredCv;
  if (!tailored || typeof tailored !== "object") {
    failures.push("tailoredCv missing");
    return failures;
  }
  if (!Array.isArray(tailored.coreSkills)) failures.push("tailoredCv.coreSkills not array");
  if (!Array.isArray(tailored.experienceBullets)) {
    failures.push("tailoredCv.experienceBullets not array");
  }
  const full = tailored.fullCv;
  if (!full || typeof full !== "object") {
    failures.push("tailoredCv.fullCv missing");
    return failures;
  }
  if (typeof full.name !== "string" || !full.name.trim()) failures.push("fullCv.name missing");
  if (!Array.isArray(full.experience)) failures.push("fullCv.experience not array");
  if (!Array.isArray(full.skills)) failures.push("fullCv.skills not array");
  return failures;
}

export function assertBannedPhrases(analysis) {
  const failures = [];
  const text = collectStringValues(analysis).join(" ").toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (text.includes(phrase.toLowerCase())) {
      failures.push(`banned phrase used: "${phrase}"`);
    }
  }
  return failures;
}

export function assertLengthBudgets(analysis) {
  const failures = [];
  const tailored = analysis.tailoredCv;
  const full = tailored.fullCv;

  if (typeof tailored.headline === "string" && tailored.headline.length > HEADLINE_MAX_CHARS) {
    failures.push(
      `tailoredCv.headline is ${tailored.headline.length} chars (> ${HEADLINE_MAX_CHARS}): "${tailored.headline}"`,
    );
  }
  if (typeof full.headline === "string" && full.headline.length > HEADLINE_MAX_CHARS) {
    failures.push(
      `fullCv.headline is ${full.headline.length} chars (> ${HEADLINE_MAX_CHARS}): "${full.headline}"`,
    );
  }

  for (const [path, value] of [
    ["tailoredCv.summary", tailored.summary],
    ["fullCv.profile", full.profile],
  ]) {
    if (typeof value !== "string") continue;
    const words = wordCount(value);
    if (words < SUMMARY_WORD_RANGE[0] || words > SUMMARY_WORD_RANGE[1]) {
      failures.push(
        `${path} is ${words} words (expected ${SUMMARY_WORD_RANGE[0]}-${SUMMARY_WORD_RANGE[1]})`,
      );
    }
  }

  for (const [path, list] of [
    ["tailoredCv.coreSkills", tailored.coreSkills],
    ["fullCv.skills", full.skills],
  ]) {
    if (!Array.isArray(list)) continue;
    if (list.length < CORE_SKILLS_RANGE[0] || list.length > CORE_SKILLS_RANGE[1]) {
      failures.push(
        `${path} has ${list.length} items (expected ${CORE_SKILLS_RANGE[0]}-${CORE_SKILLS_RANGE[1]})`,
      );
    }
  }

  if (Array.isArray(tailored.experienceBullets)) {
    if (
      tailored.experienceBullets.length < EXPERIENCE_BULLETS_RANGE[0] ||
      tailored.experienceBullets.length > EXPERIENCE_BULLETS_RANGE[1]
    ) {
      failures.push(
        `tailoredCv.experienceBullets has ${tailored.experienceBullets.length} items (expected ${EXPERIENCE_BULLETS_RANGE[0]}-${EXPERIENCE_BULLETS_RANGE[1]})`,
      );
    }
    tailored.experienceBullets.forEach((bullet, index) => {
      const words = wordCount(bullet);
      if (words < BULLET_WORD_RANGE[0] || words > BULLET_WORD_RANGE[1]) {
        failures.push(
          `tailoredCv.experienceBullets[${index}] is ${words} words (expected ${BULLET_WORD_RANGE[0]}-${BULLET_WORD_RANGE[1]}): "${truncate(bullet, 80)}"`,
        );
      }
    });
  }

  if (Array.isArray(full.experience)) {
    full.experience.forEach((role, roleIndex) => {
      if (!Array.isArray(role?.bullets)) return;
      role.bullets.forEach((bullet, bulletIndex) => {
        const words = wordCount(bullet);
        if (words < BULLET_WORD_RANGE[0] || words > BULLET_WORD_RANGE[1]) {
          failures.push(
            `fullCv.experience[${roleIndex}].bullets[${bulletIndex}] is ${words} words (expected ${BULLET_WORD_RANGE[0]}-${BULLET_WORD_RANGE[1]}): "${truncate(bullet, 80)}"`,
          );
        }
      });
    });
  }

  return failures;
}

export function assertPreservation(cvText, analysis) {
  const failures = [];
  const cvNormalised = normaliseForMatch(cvText);
  const full = analysis.tailoredCv.fullCv;

  if (typeof full.name === "string" && full.name.trim()) {
    if (!cvNormalised.includes(normaliseForMatch(full.name))) {
      failures.push(`fullCv.name "${full.name}" not present verbatim in CV`);
    }
  }

  if (Array.isArray(full.experience)) {
    full.experience.forEach((role, index) => {
      const org = typeof role?.organisation === "string" ? role.organisation : "";
      const dates = typeof role?.dates === "string" ? role.dates : "";
      if (org && !cvNormalised.includes(normaliseForMatch(org))) {
        failures.push(`fullCv.experience[${index}].organisation "${org}" not in CV`);
      }
      if (dates && !cvNormalised.includes(normaliseForMatch(dates))) {
        // Date strings are often reformatted (e.g. "Mar 2022" vs "March 2022").
        // Only flag when no date token from the analysis appears in the CV.
        const dateTokens = dates.match(/\d{4}|[A-Za-z]{3,}/g) || [];
        const everyTokenInCv =
          dateTokens.length > 0 &&
          dateTokens.every((tok) => cvNormalised.includes(normaliseForMatch(tok)));
        if (!everyTokenInCv) {
          failures.push(
            `fullCv.experience[${index}].dates "${dates}" not anchored in CV (no overlapping date tokens)`,
          );
        }
      }
    });
  }

  return failures;
}

export function assertNoFabricatedSkills(cvText, analysis) {
  const failures = [];
  const cvNormalised = normaliseForMatch(cvText);
  const skills = Array.isArray(analysis.tailoredCv?.coreSkills)
    ? analysis.tailoredCv.coreSkills
    : [];

  for (const skill of skills) {
    if (typeof skill !== "string" || !skill.trim()) continue;
    const skillNormalised = normaliseForMatch(skill);
    if (cvNormalised.includes(skillNormalised)) continue;

    // Allow if any significant token (>=5 chars) appears in the CV — catches
    // legitimate vocabulary mirroring (e.g. "Stakeholder workshops" → CV says
    // "stakeholder discovery sessions").
    const tokens = (skillNormalised.match(/[a-z0-9]{5,}/g) || []).filter(
      (t) => !STOP_TOKENS.has(t),
    );
    if (tokens.length === 0) continue;
    const anchored = tokens.some((t) => cvNormalised.includes(t));
    if (!anchored) {
      failures.push(`coreSkill "${skill}" has no token anchored in the CV (possible fabrication)`);
    }
  }
  return failures;
}

export function collectStringValues(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStringValues(v, out);
  }
  return out;
}

export function normaliseForMatch(value) {
  return String(value)
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\s ]+/g, " ")
    .trim();
}

export function wordCount(value) {
  if (typeof value !== "string") return 0;
  const stripped = value.trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

export function truncate(value, max) {
  const str = String(value);
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}
