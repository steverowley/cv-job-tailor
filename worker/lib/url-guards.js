// SSRF guards: URL validation, private-host blocking, and content-type checks.

export function validateTargetUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing URL.");
  }

  const targetUrl = new URL(value);
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  if (isPrivateOrLocalHost(targetUrl.hostname)) {
    throw new Error("URLs pointing at internal or private hosts are not allowed.");
  }

  return targetUrl.toString();
}

export function isPrivateOrLocalHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (/^(?:0|10|127)\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const m172 = host.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (host === "::" || host === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  return false;
}

export function isReadableContent(contentType) {
  return (
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("text/plain") ||
    contentType.includes("application/xhtml+xml")
  );
}

export function isAllowedStylesheetUrl(resolvedUrl, base) {
  try {
    const target = new URL(resolvedUrl);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    if (isPrivateOrLocalHost(target.hostname)) return false;
    const targetHost = target.host.toLowerCase();
    const baseHost = base.host.toLowerCase();
    if (targetHost === baseHost) return true;
    if (/(?:^|\.)fonts\.googleapis\.com$/i.test(targetHost)) return true;
    return targetHost.endsWith(`.${baseHost}`) || baseHost.endsWith(`.${targetHost}`);
  } catch {
    return false;
  }
}
