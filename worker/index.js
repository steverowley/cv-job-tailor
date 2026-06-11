// Router + CORS for the CV Job Tailor Worker. Endpoint handlers live in
// endpoints/, shared helpers in lib/. Routes (see README for details):
//   GET  /status          — secret configuration report
//   POST /read            — server-side page fetch with reader-proxy fallback
//   POST /analyse         — OpenAI structured CV analysis
//   POST /design-cv-html  — OpenAI vision call producing a sanitised HTML CV
//
// Worker secrets (set via `wrangler secret put` or the deploy workflow):
//   OPENAI_API_KEY                 — required for POST /analyse and POST /design-cv-html
//   ANALYSE_SHARED_SECRET          — optional; if set, POST endpoints require Bearer auth.
//                                    Note: the static site embeds this value in its JS bundle (VITE_ANALYSE_SHARED_SECRET),
//                                    so it is OBSCURITY, not a secret. Rotate it if abuse appears, and rely on
//                                    ALLOWED_ORIGINS + per-IP rate limiting (e.g. Cloudflare WAF) as the real boundary.
//   JINA_API_KEY                   — optional; lifts r.jina.ai shared-IP rate limit

import { analyseWithOpenAI } from "./endpoints/analyse.js";
import { designCvHtml } from "./endpoints/design-cv-html.js";
import { readPage } from "./endpoints/read.js";
import { handleStatus } from "./endpoints/status.js";
import { json } from "./lib/http.js";

const ALLOWED_ORIGINS = new Set([
  "https://steverowley.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request.headers.get("origin") || "");
    try {
      return await route(request, env, corsHeaders);
    } catch (error) {
      // Without this, an uncaught exception surfaces as Cloudflare's raw
      // error page with no CORS headers, which the app can only report as
      // "could not reach the Worker".
      return json(
        { error: `Unexpected Worker error: ${error instanceof Error ? error.message : "unknown"}` },
        500,
        corsHeaders,
      );
    }
  },
};

async function route(request, env, corsHeaders) {
  const origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);

  if (url.pathname === "/status" && request.method === "GET") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "Origin not allowed." }, 403, corsHeaders);
    }
    return handleStatus(env, corsHeaders);
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "This Worker only accepts requests from the CV Job Tailor app." }, 403, corsHeaders);
  }

  if (url.pathname === "/analyse" && request.method === "POST") {
    return analyseWithOpenAI(request, env, corsHeaders);
  }

  if (url.pathname === "/design-cv-html" && request.method === "POST") {
    return designCvHtml(request, env, corsHeaders);
  }

  if (url.pathname === "/read" && request.method === "POST") {
    return readPage(request, env, corsHeaders);
  }

  return json(
    { error: "Use GET /status, POST /read, POST /analyse, or POST /design-cv-html." },
    404,
    corsHeaders,
  );
}

function buildCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://steverowley.github.io";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}
