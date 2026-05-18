const ALLOWED_ORIGINS = new Set([
  "https://steverowley.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const MAX_HTML_LENGTH = 500_000;
const MAX_ANALYSIS_BODY_LENGTH = 120_000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/status" && request.method === "GET" && (!origin || ALLOWED_ORIGINS.has(origin))) {
      return json({ hasOpenAiKey: Boolean(env.OPENAI_API_KEY) }, 200, corsHeaders);
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "This Worker only accepts requests from the CV Job Tailor app." }, 403, corsHeaders);
    }

    if (url.pathname === "/analyse" && request.method === "POST") {
      return analyseWithOpenAI(request, env, corsHeaders);
    }

    if (url.pathname !== "/read" || request.method !== "POST") {
      return json({ error: "Use GET /status, POST /read with { url }, or POST /analyse with an OpenAI Responses API body." }, 404, corsHeaders);
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

async function analyseWithOpenAI(request, env, corsHeaders) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "The Worker is missing its OPENAI_API_KEY secret." }, 500, corsHeaders);
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_ANALYSIS_BODY_LENGTH) {
      return json({ error: "The CV and job description are too large for the Worker analysis route." }, 413, corsHeaders);
    }

    const body = JSON.parse(rawBody);
    validateOpenAIBody(body);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "OpenAI analysis failed." }, 400, corsHeaders);
  }
}

function buildCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://steverowley.github.io";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function validateOpenAIBody(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Missing analysis request body.");
  }

  if (typeof body.model !== "string" || !body.model.trim()) {
    throw new Error("Missing OpenAI model.");
  }

  if (!Array.isArray(body.input)) {
    throw new Error("Missing OpenAI input.");
  }
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
