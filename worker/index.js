const ALLOWED_ORIGINS = new Set([
  "https://steverowley.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const MAX_HTML_LENGTH = 500_000;

export default {
  async fetch(request) {
    const origin = request.headers.get("origin") || "";
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/read" || request.method !== "POST") {
      return json({ error: "Use POST /read with a JSON body containing { url }." }, 404, corsHeaders);
    }

    try {
      const body = await request.json();
      const targetUrl = validateTargetUrl(body?.url);
      const response = await fetch(targetUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "user-agent": "CVJobTailor/1.0 (+https://steverowley.github.io/cv-job-tailor/)",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        return json({ error: `The website responded with ${response.status}.` }, 502, corsHeaders);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!isReadableContent(contentType)) {
        return json({ error: `Unsupported content type: ${contentType || "unknown"}.` }, 415, corsHeaders);
      }

      const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
      return json(
        {
          html,
          finalUrl: response.url,
          contentType,
          truncated: html.length >= MAX_HTML_LENGTH,
        },
        200,
        corsHeaders,
      );
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "The website could not be read." }, 400, corsHeaders);
    }
  },
};

function buildCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://steverowley.github.io";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function validateTargetUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing URL.");
  }

  const targetUrl = new URL(value);
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  return targetUrl.toString();
}

function isReadableContent(contentType) {
  return (
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("text/plain") ||
    contentType.includes("application/xhtml+xml")
  );
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
