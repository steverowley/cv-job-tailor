# CV Job Tailor — Project Plan

Combined plan covering the comprehensive review fixes and the OpenAI → Claude migration. The Claude migration is sequenced first because the current `MODEL = "gpt-5.4"` makes the app non-functional and the migration touches the same files as several of the review fixes.

## Phase 0 — Decisions (locked in)

- **Model:** `claude-opus-4-7` (the Anthropic recommended default — re-evaluate after measuring real-world cost).
- **Personal-key path:** removed. All analysis runs through the Cloudflare Worker.
- **PDF output:** switch from `html2canvas` raster to `@react-pdf/renderer` text-rendered output.

## Phase 1 — Claude migration

- [x] 1.1 Worker — replace OpenAI Responses API with Anthropic Messages API. Worker now owns the system prompt and JSON schema; clients send `{ jobText, cvText, employerHint }`.
- [x] 1.2 Worker — `/analyse` requires `Authorization: Bearer <ANALYSE_SHARED_SECRET>`. Build pipes `VITE_ANALYSE_SHARED_SECRET` into the bundle.
- [x] 1.3 Frontend — replace `src/openai.ts` with a thin client that POSTs to the Worker. No direct API calls from the browser.
- [x] 1.4 Frontend — remove the personal-key panel and `apiKey` state from `App.tsx`. `canAnalyse` now gates on `workerStatus === "configured"`.
- [x] 1.5 Docs/workflows/diagnostics — rename `OPENAI_API_KEY` → `ANTHROPIC_API_KEY` everywhere (README, GitHub Actions, `check-worker.mjs`, status payload).

## Phase 2 — High-impact review fixes

- [x] 2.1 Text-rendered PDF via `@react-pdf/renderer`. Drop `html2canvas` and `jspdf`.
- [x] 2.2 Logo CORS — proxy employer logos through the Worker so the PDF can render them.
- [x] 2.3 UI honesty — drop "the Worker is optional" framing. Worker is required.

## Phase 3 — Robustness & polish

- [x] 3.1 Lazy-load `pdfjs-dist` and `mammoth` so the landing page doesn't ship them.
- [x] 3.2 Raise the CV minimum length and require at least one alphabetic word.
- [x] 3.3 Fix fragile React keys (long bullet text → index-based).
- [x] 3.4 Add `LICENSE` (MIT).
- [x] 3.5 Replace `Avenir Next` as the leading font with a freely-available stack.
- [x] 3.6 Pin `wrangler.toml` compatibility date to a known-stable value.
- [x] 3.7 Unit tests on `parseHtmlPage`, `parseBrandSource`, `findFontHint`, plus a smoke test on the Worker request shape.

## Phase 4 — Deferred (not part of this delivery)

- Prompt caching (only worth it once usage grows).
- Turnstile / hCaptcha (if shared-secret abuse becomes real).
- Multi-tier model selector in the UI.
- Adaptive thinking on the Messages call.
- Streaming analysis with progress events.
