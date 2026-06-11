// Shared-secret Bearer auth for the endpoints that spend money or fetch upstream.

// True when the request may proceed: either no shared secret is configured,
// or the caller presented the matching Bearer token.
export function requireSharedSecret(request, env) {
  if (!env.ANALYSE_SHARED_SECRET) return true;
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  return timingSafeEqual(provided, env.ANALYSE_SHARED_SECRET);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length, 1);
  let result = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    result |= ac ^ bc;
  }
  return result === 0;
}
