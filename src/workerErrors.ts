// Shared copy for HTTP 429 responses from the Worker, honouring Retry-After
// so the user knows when to try again rather than seeing a generic failure.

export function rateLimitMessage(response: Response): string {
  const retryAfter = (response.headers.get("retry-after") || "").trim();
  const seconds = Number(retryAfter);
  let wait = " Try again in a minute.";
  if (Number.isFinite(seconds) && seconds > 0) {
    wait = ` Try again in about ${formatWait(seconds)}.`;
  } else if (retryAfter) {
    // Retry-After can also be an HTTP date.
    wait = ` Try again after ${retryAfter}.`;
  }
  return `Too many requests right now — the Worker is rate-limited to protect the OpenAI budget.${wait}`;
}

function formatWait(seconds: number): string {
  if (seconds < 90) {
    return `${Math.ceil(seconds)} seconds`;
  }
  return `${Math.ceil(seconds / 60)} minutes`;
}
