#!/usr/bin/env node
/**
 * Eval suite for the CV Job Tailor /analyse endpoint.
 *
 * Reads (cvText, jobText) fixture pairs from fixtures/ and runs each through
 * the deployed Worker's /analyse, then checks objective properties of the
 * response — schema sanity, banned phrases, length budgets, evidence-only
 * preservation of names/dates/employers, no clearly fabricated skills.
 *
 * Usage:
 *   npm run eval                                # uses $VITE_CLOUDFLARE_WORKER_URL
 *   npm run eval -- https://worker.example/    # explicit URL
 *
 * Needs $VITE_ANALYSE_SHARED_SECRET if the Worker enforces shared-secret auth.
 *
 * Cost: each fixture is one /analyse call (~$0.30-0.50 on gpt-5 with medium
 * reasoning, depending on output length). Three fixtures ≈ $1-1.50 per run.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAssertions, truncate } from "./evalAssertions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures");

const workerUrl = normalizeWorkerUrl(
  process.argv[2] || process.env.VITE_CLOUDFLARE_WORKER_URL || "",
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

console.log(`Eval target: ${workerUrl}/analyse`);
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

async function runFixture({ cvText, jobText }) {
  const headers = { "Content-Type": "application/json" };
  if (sharedSecret) headers.Authorization = `Bearer ${sharedSecret}`;

  let response;
  try {
    response = await fetch(`${workerUrl}/analyse`, {
      method: "POST",
      headers,
      body: JSON.stringify({ cvText, jobText, employerHint: "" }),
    });
  } catch (error) {
    return { ok: false, failures: [`network error: ${error.message}`] };
  }

  const rawText = await response.text();
  let payload;
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    return {
      ok: false,
      failures: [`worker returned non-JSON: ${rawText.slice(0, 200)}`],
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      failures: [`HTTP ${response.status}: ${payload.error || rawText.slice(0, 200)}`],
    };
  }

  const analysis = payload.analysis;
  if (!analysis) {
    return { ok: false, failures: ["no analysis in response payload"] };
  }

  const failures = runAssertions(cvText, analysis);
  return { ok: failures.length === 0, failures, preview: formatPreview(analysis) };
}

function formatPreview(analysis) {
  const headline = analysis.tailoredCv?.headline || "(no headline)";
  const skills = (analysis.tailoredCv?.coreSkills || []).slice(0, 4).join(" · ");
  return `→ ${truncate(headline, 70)} | ${truncate(skills, 60)}`;
}
