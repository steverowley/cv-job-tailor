// Microlink screenshot capture of the employer homepage for the design prompt.
import { validateTargetUrl } from "./url-guards.js";

const MICROLINK_ENDPOINT = "https://api.microlink.io/";

export async function fetchMicrolinkScreenshot(targetUrl) {
  const apiUrl = new URL(MICROLINK_ENDPOINT);
  apiUrl.searchParams.set("url", targetUrl);
  apiUrl.searchParams.set("screenshot", "true");
  apiUrl.searchParams.set("meta", "false");
  apiUrl.searchParams.set("viewport.width", "1440");
  apiUrl.searchParams.set("viewport.height", "900");
  apiUrl.searchParams.set("screenshot.fullPage", "false");

  const response = await fetch(apiUrl.toString(), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Microlink responded with HTTP ${response.status}.`);
  }
  const payload = await response.json().catch(() => null);
  const url = payload?.data?.screenshot?.url;
  if (typeof url !== "string" || !url) {
    throw new Error("Microlink did not return a screenshot URL.");
  }
  // The screenshot URL is forwarded to OpenAI as input_image.image_url, so
  // re-validate it before trusting it — Microlink should always return an
  // https URL on a public host, but a compromised or misconfigured upstream
  // could otherwise have the Worker hand a private-host URL to OpenAI.
  const validated = validateTargetUrl(url);
  return { url: validated };
}
