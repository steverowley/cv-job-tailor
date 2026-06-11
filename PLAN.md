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
- `/read`, `/analyse`, and `/design-cv-html` require `Authorization: Bearer <ANALYSE_SHARED_SECRET>`
  when the shared secret is set. The shared secret is embedded in the static bundle
  and is therefore obscurity, not a secret — the real boundary is `ALLOWED_ORIGINS`
  plus any Cloudflare WAF rate-limiting.
- Worker proxies employer logos so the renderer can embed them as data URLs in the
  HTML document.
- Worker reads career pages server-side and falls back to `r.jina.ai` when the
  direct fetch is blocked (403/410/429/451/5xx).
- `pdfjs-dist` and `mammoth` are lazy-loaded so the landing page does not ship them.
- `wrangler.toml` compatibility date is pinned and refreshed periodically.
- Prompt caching (`prompt_cache_key`) on both OpenAI calls (#30).
- Worker split into `endpoints/` + `lib/` modules with colocated tests (#32).
- `src/App.tsx` split into hooks + panels; the pipeline orchestrator is a plain
  tested function (#33).
- `/analyse` streams coarse progress events (SSE) when the client asks for
  `text/event-stream`; plain JSON stays the default (#36).
- ESLint (typescript-eslint + react-hooks) runs in CI alongside typecheck,
  tests, and build.

## Open work

Tracked as GitHub issues — see those for full context and acceptance criteria.

- [#31](https://github.com/steverowley/cv-job-tailor/issues/31) — **Rate-limiting on `/analyse` and `/design-cv-html`.** The shared secret
  leaks via the static bundle, so the real protection is `ALLOWED_ORIGINS` and
  Cloudflare WAF. The recommended rules and OpenAI spend caps are documented in
  the README ("Protecting the OpenAI bill"); the dashboard configuration itself
  is the remaining step.
- [#34](https://github.com/steverowley/cv-job-tailor/issues/34) — **Turnstile /
  hCaptcha.** Only if shared-secret abuse appears.
