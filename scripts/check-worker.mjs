const workerUrl = normalizeWorkerUrl(process.argv[2] || process.env.VITE_CLOUDFLARE_WORKER_URL || "");

if (!workerUrl) {
  fail("No Worker URL was provided. Pass it as an argument or set VITE_CLOUDFLARE_WORKER_URL.");
}

const statusUrl = `${workerUrl}/status`;

console.log(`Checking Worker: ${statusUrl}`);

try {
  const response = await fetch(statusUrl, {
    headers: {
      origin: "https://steverowley.github.io",
    },
  });
  const text = await response.text();
  const payload = parseJson(text);

  console.log(`HTTP ${response.status}`);
  if (text) {
    console.log(text);
  }

  if (!response.ok) {
    fail(`The Worker responded, but /status returned HTTP ${response.status}.`);
  }

  if (!payload || typeof payload.hasAnthropicKey !== "boolean") {
    fail("The Worker responded, but it does not look like the current cv-job-tailor Worker.");
  }

  if (!payload.hasAnthropicKey) {
    fail("The Worker is reachable, but ANTHROPIC_API_KEY is not set as a Cloudflare Worker secret.");
  }

  console.log("PASS: Worker is reachable and ANTHROPIC_API_KEY is configured.");
} catch (error) {
  const cause = error?.cause;
  const detail =
    cause && typeof cause === "object"
      ? [cause.code, cause.hostname, cause.message].filter(Boolean).join(" / ")
      : "";
  fail([error instanceof Error ? error.message : "Worker check failed.", detail].filter(Boolean).join(" "));
}

function normalizeWorkerUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
