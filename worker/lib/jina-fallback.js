// r.jina.ai reader-proxy fallback for career pages that block direct fetches.

export function shouldRetryViaReaderProxy(status) {
  return status === 403 || status === 410 || status === 429 || status === 451 || status >= 500;
}

export async function fetchViaReaderProxy(targetUrl, env) {
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
