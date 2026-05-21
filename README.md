# CV Job Tailor

A static GitHub Pages web app for tailoring a CV against a job description. The main app runs on GitHub Pages, with a required Cloudflare Worker that holds the OpenAI API key, reads employer pages that block GitHub Pages, and proxies employer logos for the PDF.

## What it does

- Accepts a job description URL or pasted job text.
- Reads a PDF or DOCX CV locally in the browser.
- Sends the CV and job text to a Cloudflare Worker that calls the OpenAI Responses API to extract job skills, match CV evidence, and propose evidence-only CV wording.
- Shows unsupported job requirements as gaps instead of inventing experience.
- Takes an employer website URL, extracts public brand signals when the Worker can fetch them, and exports a text-rendered branded PDF (ATS-friendly, not a raster image).
- Generates a CV layout that is on-brand for each employer, not a fixed template: the Worker captures a screenshot of the employer homepage and asks OpenAI Vision (gpt-4o) for a structured DesignSpec (archetype, typography, geometry, colour roles, hero treatment). The renderer then picks one of several layout archetypes (editorial, sidebar classic, feature band, monolith) parameterised by that spec.

## Privacy model

This app is designed for GitHub Pages, so there is no app database or saved CV history. The OpenAI API key never reaches the browser — it lives only as a Cloudflare Worker secret. The Worker also proxies employer logos and reads career pages so that GitHub Pages does not need direct cross-origin access.

If a job site blocks the Worker too, paste the job description into the fallback text box. If an employer site cannot be read, the app still derives a company name from the URL and lets you fine-tune the logo URL and colours before export.

## Cloudflare Worker setup

The Worker code is in `worker/index.js` and is configured by `wrangler.toml`. The Worker exposes:

- `GET /status` — reports whether `OPENAI_API_KEY`, `ANALYSE_SHARED_SECRET`, `JINA_API_KEY`, and Browser Rendering secrets are configured.
- `POST /read` — fetches a public HTML page server-side.
- `POST /analyse` — sends the job + CV text to the OpenAI Responses API (gpt-5) and returns the structured analysis. Requires `Authorization: Bearer <ANALYSE_SHARED_SECRET>` if the shared secret is set.
- `POST /design-cv-html` — takes the structured CV + brand signals + employer homepage URL, captures a Microlink screenshot, and asks gpt-5 with vision to produce a self-contained on-brand HTML CV. Same auth as `/analyse`.
- `POST /render-pdf` — takes `{ html }`, runs it through the Cloudflare Browser Rendering REST API, and streams an A4-portrait PDF back. Same auth as `/analyse`.
- `GET /proxy-image?url=...` — proxies an employer logo so the preview can render it without CORS issues.

It allows browser calls from `https://steverowley.github.io` plus local development origins.

### One-time setup

1. Create or log in to a Cloudflare account.
2. In Cloudflare, create an API token with permission to deploy Workers.
3. In GitHub, open this repo's settings, then add repository secrets:
   - `CLOUDFLARE_API_TOKEN`: your Cloudflare API token.
   - `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.
   - `OPENAI_API_KEY`: your OpenAI API key. Synced to the Worker as a Cloudflare secret on deploy.
   - `ANALYSE_SHARED_SECRET` (optional but recommended): a long random string. The Worker rejects authenticated endpoints without a matching `Authorization` header. Set the same value as `VITE_ANALYSE_SHARED_SECRET` so the frontend can send it.
   - `CF_ACCOUNT_ID`: your Cloudflare account ID (used by `/render-pdf` to call the Browser Rendering REST API — can be the same value as `CLOUDFLARE_ACCOUNT_ID`).
   - `CF_BROWSER_RENDERING_TOKEN`: a Cloudflare API token scoped to **Browser Rendering** (Workers Paid plan required). The Worker uses it to render the on-brand HTML CV to PDF.
4. In GitHub Actions, run the `Deploy Cloudflare Worker` workflow. It deploys the Worker, then syncs the Cloudflare secrets above.
5. Copy the deployed Worker URL. It will look similar to:

```text
https://cv-job-tailor-reader.your-account.workers.dev
```

6. Add that URL as a GitHub repository variable or secret:
   - `VITE_CLOUDFLARE_WORKER_URL`: your Worker URL.
   - `VITE_ANALYSE_SHARED_SECRET`: same value as the Cloudflare secret (if you set one).
7. Re-run the GitHub Pages workflow, or push a small change to trigger it.

You can also paste the Worker URL into the app's Worker field for immediate testing. The app keeps it in browser session storage.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The Vite base path is configured for GitHub Pages at `/cv-job-tailor/`.

## Tests

```bash
npm test
```

## Worker diagnostics

Check whether the deployed Worker is reachable and has the OpenAI key:

```bash
npm run check:worker -- https://cv-job-tailor-reader.your-account.workers.dev
```

Expected passing output includes `PASS: Worker is reachable and OPENAI_API_KEY is configured.`
