// GET /status — reports which Worker secrets are configured, without values.
import { json } from "../lib/http.js";

export function handleStatus(env, corsHeaders) {
  return json(
    {
      hasOpenAiKey: Boolean(env.OPENAI_API_KEY),
      requiresSharedSecret: Boolean(env.ANALYSE_SHARED_SECRET),
      hasJinaKey: Boolean(env.JINA_API_KEY),
    },
    200,
    corsHeaders,
  );
}
