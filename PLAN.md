# CV Job Tailor — Project Plan

Status note (2026-05): the original plan tracked a Claude migration that was
later reverted in #2 ("Swap analysis back to OpenAI and polish the UI further").
Analysis and HTML design both run on OpenAI's Responses API with `gpt-5`. This
file has been rewritten to reflect what actually shipped; the historical
Claude-migration plan lives in git history.

## Decisions in force

- **Analysis model:** `gpt-5` via OpenAI's Responses API, with `reasoning.effort = "medium"`.
- **CV design model:** `gpt-5` (same Responses API) with vision input. The Worker
  feeds the model up to two reference images: the candidate's existing CV (first
  page, JPEG) as a layout reference, and a Microlink screenshot of the employer
  homepage as a brand reference.
- **Personal API key path:** removed. All model calls run through the Cloudflare
  Worker. The browser never sees the OpenAI key.
- **PDF output:** the model returns a self-contained HTML document. The browser
  renders it via the native print dialog (`window.print()`). No `@react-pdf/renderer`,
  no `html2canvas`. Text-rendered, ATS-friendly.

## Shipped phases (1–3)

- Cloudflare Worker holds `OPENAI_API_KEY`, `ANALYSE_SHARED_SECRET`, and `JINA_API_KEY`
  as secrets. The static site uses a thin client and never holds the key.
- `/analyse` and `/design-cv-html` require `Authorization: Bearer <ANALYSE_SHARED_SECRET>`
  when the shared secret is set. The shared secret is embedded in the static bundle
  and is therefore obscurity, not a secret — the real boundary is `ALLOWED_ORIGINS`
  plus any Cloudflare WAF rate-limiting.
- Worker proxies employer logos so the renderer can embed them as data URLs in the
  HTML document.
- Worker reads career pages server-side and falls back to `r.jina.ai` when the
  direct fetch is blocked (403/410/429/451/5xx).
- `pdfjs-dist` and `mammoth` are lazy-loaded so the landing page does not ship them.
- `wrangler.toml` compatibility date is pinned and refreshed periodically.

## Open work

- **Rate-limiting on `/analyse` and `/design-cv-html`.** The shared secret leaks
  via the static bundle, so the real protection is `ALLOWED_ORIGINS` and Cloudflare
  WAF. Add per-IP rate-limit rules in Cloudflare once usage warrants it.
- **Prompt caching.** Both endpoints would benefit once token spend is meaningful —
  the system prompts are ~3 KB and stable across requests.
- **Worker module split.** `worker/index.js` is approaching 1400 lines in one file
  (routing, OpenAI calls, sanitiser, URL validators, CSS scraper). Split into
  per-endpoint modules + a shared lib once the next substantial change lands.
- **`src/App.tsx` split.** ~900 lines, 22+ pieces of state in one component. Pull
  the orchestrator (`runAnalysis`) and form panels into their own modules.
- **Turnstile / hCaptcha.** Only if shared-secret abuse appears.
- **Streaming analysis** with progress events.
