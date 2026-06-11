// OpenAI Responses API helpers: the per-call timeout and response extraction.

// Cloudflare Workers paid tier allows 30s of CPU time per request but each
// subrequest has its own ~60s default and the wall-clock budget can stretch
// further. OpenAI Responses with gpt-5 + medium reasoning routinely takes
// 30–60s and occasionally hangs. Cap each upstream OpenAI call so a hung
// request returns a clear 504 instead of consuming the whole invocation.
export const OPENAI_TIMEOUT_MS = 110_000;

export function extractOpenAIStructuredAnalysis(payload) {
  if (!payload) {
    return null;
  }

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    try {
      return JSON.parse(payload.output_text);
    } catch {
      // fall through to per-block extraction
    }
  }

  if (!Array.isArray(payload.output)) {
    return null;
  }

  for (const item of payload.output) {
    const blocks = Array.isArray(item?.content) ? item.content : [];
    for (const block of blocks) {
      if (block?.type === "output_text" && typeof block.text === "string") {
        try {
          return JSON.parse(block.text);
        } catch {
          continue;
        }
      }
      if (block?.type === "text" && typeof block.text === "string") {
        try {
          return JSON.parse(block.text);
        } catch {
          continue;
        }
      }
    }
  }

  return null;
}

export function extractOpenAIError(rawText) {
  if (!rawText) return "";
  try {
    const parsed = JSON.parse(rawText);
    return parsed?.error?.message || "";
  } catch {
    return rawText.slice(0, 500);
  }
}
