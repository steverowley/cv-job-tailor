#!/usr/bin/env node
/**
 * Eval suite for the CV Job Tailor pipeline (/analyse + /design-cv-html).
 *
 * Reads (cvText, jobText) fixture pairs from fixtures/, posts each to the
 * deployed Worker's /analyse, then chains the result into /design-cv-html
 * and runs assertions on both stages — schema sanity, banned phrases,
 * length budgets, evidence-only preservation, HTML structure and size.
 *
 * Usage:
 *   npm run eval                                # both stages, $VITE_CLOUDFLARE_WORKER_URL
 *   npm run eval -- https://worker.example/    # both stages, explicit URL
 *   npm run eval -- --analyse-only             # skip /design-cv-html (cheaper)
 *
 * Needs $VITE_ANALYSE_SHARED_SECRET if the Worker enforces shared-secret auth.
 *
 * Cost (gpt-5, medium reasoning):
 *   /analyse per fixture ≈ $0.30-0.50
 *   /design-cv-html per fixture ≈ $0.40-0.60
 *   Full run on 3 fixtures ≈ $2-3. Use --analyse-only when iterating on
 *   the analysis prompt to halve the cost.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAssertions, runHtmlAssertions, truncate } from "./evalAssertions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures");

const args = process.argv.slice(2);
const analyseOnly = args.includes("--analyse-only");
const positional = args.filter((arg) => !arg.startsWith("--"));

const workerUrl = normalizeWorkerUrl(
  positional[0] || process.env.VITE_CLOUDFLARE_WORKER_URL || "",
);
const sharedSecret = (process.env.VITE_ANALYSE_SHARED_SECRET || "").trim();

if (!workerUrl) {
  console.error(
    "FAIL: No Worker URL provided. Pass it as the first argument or set VITE_CLOUDFLARE_WORKER_URL.",
  );
  process.exit(2);
}

const fixtures = loadFixtures(FIXTURES_DIR);
if (fixtures.length === 0) {
  console.error(`FAIL: No fixtures found in ${FIXTURES_DIR}.`);
  process.exit(2);
}

console.log(`Eval target: ${workerUrl}`);
console.log(`Stages: /analyse${analyseOnly ? "" : " + /design-cv-html"}`);
console.log(`Fixtures: ${fixtures.length}\n`);

let passedCount = 0;
let failedCount = 0;

for (const fixture of fixtures) {
  const result = await runFixture(fixture);
  if (result.ok) {
    passedCount += 1;
    console.log(`PASS  ${fixture.name}`);
  } else {
    failedCount += 1;
    console.log(`FAIL  ${fixture.name}`);
    for (const failure of result.failures) {
      console.log(`        - ${failure}`);
    }
  }
  if (result.preview) {
    console.log(`        ${result.preview}`);
  }
}

console.log(`\n${passedCount}/${fixtures.length} passed (${failedCount} failed).`);
process.exit(failedCount === 0 ? 0 : 1);

// ---------------------------------------------------------------------------

function normalizeWorkerUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function loadFixtures(dir) {
  const entries = readdirSync(dir).filter((name) => name.endsWith("-cv.txt"));
  return entries
    .map((name) => name.replace(/-cv\.txt$/, ""))
    .sort()
    .map((stem) => ({
      name: stem,
      cvText: readFileSync(join(dir, `${stem}-cv.txt`), "utf8"),
      jobText: readFileSync(join(dir, `${stem}-jd.txt`), "utf8"),
    }));
}

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (sharedSecret) headers.Authorization = `Bearer ${sharedSecret}`;
  return headers;
}

async function postJson(path, body) {
  let response;
  try {
    response = await fetch(`${workerUrl}${path}`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, error: `network error: ${error.message}` };
  }

  const rawText = await response.text();
  let payload;
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    return {
      ok: false,
      error: `non-JSON response from ${path}: ${rawText.slice(0, 200)}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `${path} returned HTTP ${response.status}: ${payload.error || rawText.slice(0, 200)}`,
    };
  }

  return { ok: true, payload };
}

async function runFixture({ cvText, jobText }) {
  const analyseResult = await postJson("/analyse", { cvText, jobText, employerHint: "" });
  if (!analyseResult.ok) {
    return { ok: false, failures: [analyseResult.error] };
  }
  const analysis = analyseResult.payload.analysis;
  if (!analysis) {
    return { ok: false, failures: ["no analysis in /analyse response payload"] };
  }

  const failures = runAssertions(cvText, analysis);

  if (!analyseOnly) {
    const design = await postJson("/design-cv-html", buildDesignPayload(analysis));
    if (!design.ok) {
      failures.push(design.error);
    } else if (typeof design.payload.html !== "string") {
      failures.push("no html in /design-cv-html response payload");
    } else {
      failures.push(...runHtmlAssertions(cvText, analysis, design.payload.html));
    }
  }

  return { ok: failures.length === 0, failures, preview: formatPreview(analysis) };
}

function buildDesignPayload(analysis) {
  // Deliberately minimal: no employer homepage URL (skips Microlink), no logo
  // URL (skips the upstream image fetch), no CV layout image. This exercises
  // the "no reference images" fallback path in HTML_DESIGN_SYSTEM_PROMPT,
  // which is what most real runs hit when the employer website is unknown.
  return {
    structuredCv: analysis.tailoredCv.fullCv,
    brand: {
      companyName: analysis.employerName || "Target employer",
      primaryColor: "#1b4d3e",
      accentColor: "#d3a84f",
      backgroundColor: "#fffdf8",
      textColor: "#25221e",
      fontFamily: "Georgia",
      palette: ["#1b4d3e", "#d3a84f", "#fffdf8"],
    },
    jobTitle: analysis.jobTitle || "",
    employerName: analysis.employerName || "",
    employerHomepageUrl: "",
    logoUrl: "",
    cvLayoutDataUrl: "",
  };
}

function formatPreview(analysis) {
  const headline = analysis.tailoredCv?.headline || "(no headline)";
  const skills = (analysis.tailoredCv?.coreSkills || []).slice(0, 4).join(" · ");
  return `→ ${truncate(headline, 70)} | ${truncate(skills, 60)}`;
}
