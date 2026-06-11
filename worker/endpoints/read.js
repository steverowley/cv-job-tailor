// POST /read — fetches a public HTML page server-side, with reader-proxy fallback.
import { requireSharedSecret } from "../lib/auth.js";
import { collectExternalStyleSignals } from "../lib/css-signals.js";
import { browserLikeHeaders, json } from "../lib/http.js";
import {
  explainUpstreamStatus,
  fetchViaReaderProxy,
  shouldRetryViaReaderProxy,
} from "../lib/jina-fallback.js";
import { isReadableContent, validateTargetUrl } from "../lib/url-guards.js";

const MAX_HTML_LENGTH = 500_000;

export async function readPage(request, env, corsHeaders) {
  // Same auth as /analyse: without it, anyone who sets a forged Origin header
  // can use the Worker as a free page-fetch proxy (and burn Jina credits).
  if (!requireSharedSecret(request, env)) {
    return json({ error: "Missing or invalid shared secret." }, 401, corsHeaders);
  }

  try {
    const body = await request.json();
    const targetUrl = validateTargetUrl(body?.url);
    let response = await fetch(targetUrl, {
      headers: browserLikeHeaders(targetUrl),
      redirect: "follow",
    });
    let usedReaderProxy = false;
    let proxyAttempted = false;
    let proxyStatus = null;
    let proxyError = "";
    const directStatus = response.status;

    if (!response.ok && shouldRetryViaReaderProxy(response.status)) {
      proxyAttempted = true;
      try {
        const proxied = await fetchViaReaderProxy(targetUrl, env);
        proxyStatus = proxied.status;
        if (proxied.ok) {
          response = proxied;
          usedReaderProxy = true;
        } else {
          proxyError = (await proxied.text().catch(() => "")).slice(0, 500);
        }
      } catch (err) {
        proxyError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!response.ok) {
      const hint =
        proxyAttempted && proxyStatus === 429 && !env.JINA_API_KEY
          ? " Set a JINA_API_KEY worker secret to lift the shared-IP rate limit."
          : "";
      const detail = proxyAttempted
        ? `Direct fetch returned ${directStatus}; reader proxy ${
            proxyStatus ? `returned ${proxyStatus}` : "could not be reached"
          }${proxyError ? ` — ${proxyError}` : ""}.${hint}`
        : explainUpstreamStatus(directStatus);
      return json(
        {
          error: detail,
          directStatus,
          proxyAttempted,
          proxyStatus,
        },
        502,
        corsHeaders,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!usedReaderProxy && !isReadableContent(contentType)) {
      return json({ error: `Unsupported content type: ${contentType || "unknown"}.` }, 415, corsHeaders);
    }

    const rawHtml = await response.text();
    const html = rawHtml.slice(0, MAX_HTML_LENGTH);
    const externalStyles = usedReaderProxy
      ? { colors: [], fonts: [] }
      : await collectExternalStyleSignals(rawHtml, response.url || targetUrl);
    return json(
      {
        html,
        finalUrl: response.url,
        contentType,
        truncated: html.length >= MAX_HTML_LENGTH,
        externalStyles,
        viaReaderProxy: usedReaderProxy,
        directStatus,
        proxyAttempted,
        proxyStatus,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The website could not be read." }, 400, corsHeaders);
  }
}
