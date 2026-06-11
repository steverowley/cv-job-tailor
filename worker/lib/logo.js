// Server-side logo fetch, gated by the SSRF guards, returned as a data URL.
import { browserLikeHeaders } from "./http.js";
import { validateTargetUrl } from "./url-guards.js";

const MAX_IMAGE_BYTES = 2_000_000;

export async function fetchLogoAsDataUrl(logoUrl) {
  // Gate the upstream fetch on the same private-host allowlist as /read so
  // a caller can't ask the Worker to fetch http://127.0.0.1/... and embed
  // the response. redirect: "manual" closes the redirect-to-internal bypass —
  // if a logo CDN legitimately redirects, the caller should supply the
  // canonical URL.
  const validated = validateTargetUrl(logoUrl);
  const upstream = await fetch(validated, {
    headers: {
      ...browserLikeHeaders(validated),
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    redirect: "manual",
  });
  if (upstream.status >= 300 && upstream.status < 400) {
    throw new Error("Logo URL redirected; refusing to follow.");
  }
  if (!upstream.ok) {
    throw new Error(`Logo fetch failed with ${upstream.status}.`);
  }
  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unsupported logo content type: ${contentType || "unknown"}.`);
  }
  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Logo image is too large to embed.");
  }
  const base64 = bufferToBase64(buffer);
  return `data:${contentType};base64,${base64}`;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
