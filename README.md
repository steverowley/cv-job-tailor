# CV Job Tailor

A static GitHub Pages web app for tailoring a CV against a job description. The main app runs on GitHub Pages, with a required Cloudflare Worker that holds the Anthropic API key, reads employer pages that block GitHub Pages, and proxies employer logos for the PDF.

## What it does

- Accepts a job description URL or pasted job text.
- Reads a PDF or DOCX CV locally in the browser.
- Sends the CV and job text to a Cloudflare Worker that calls the Anthropic Messages API (Claude) to extract job skills, match CV evidence, and propose evidence-only CV wording.
- Shows unsupported job requirements as gaps instead of inventing experience.
- Takes an employer website URL, extracts public brand signals when the Worker can fetch them, and exports a text-rendered branded PDF (ATS-friendly, not a raster image).

## Privacy model

This app is designed for GitHub Pages, so there is no app database or saved CV history. The Anthropic API key never reaches the browser — it lives only as a Cloudflare Worker secret. The Worker also proxies employer logos and reads career pages so that GitHub Pages does not need direct cross-origin access.

If a job site blocks the Worker too, paste the job description into the fallback text box. If an employer site cannot be read, the app still derives a company name from the URL and lets you fine-tune the logo URL and colours before export.

## Cloudflare Worker setup

The Worker code is in `worker/index.js` and is configured by `wrangler.toml`. The Worker exposes:

- `GET /status` — reports whether `ANTHROPIC_API_KEY` is configured.
- `POST /read` — fetches a public HTML page server-side.
- `POST /analyse` — sends the job + CV text to the Anthropic Messages API and returns the structured analysis. Requires `Authorization: Bearer <ANALYSE_SHARED_SECRET>` if the shared secret is set.
- `GET /proxy-image?url=...` — proxies an employer logo so the PDF exporter can embed it.

It allows browser calls from `https://steverowley.github.io` plus local development origins.

### One-time setup

1. Create or log in to a Cloudflare account.
2. In Cloudflare, create an API token with permission to deploy Workers.
3. In GitHub, open this repo's settings, then add repository secrets:
   - `CLOUDFLARE_API_TOKEN`: your Cloudflare API token.
   - `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.
   - `ANTHROPIC_API_KEY`: your Anthropic API key. Synced to the Worker as a Cloudflare secret on deploy.
   - `ANALYSE_SHARED_SECRET` (optional but recommended): a long random string. The Worker rejects `/analyse` calls without a matching `Authorization` header. Set the same value as `VITE_ANALYSE_SHARED_SECRET` so the frontend can send it.
4. In GitHub Actions, run the `Deploy Cloudflare Worker` workflow. It deploys the Worker, then syncs `ANTHROPIC_API_KEY` and `ANALYSE_SHARED_SECRET` as Cloudflare secrets.
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

Check whether the deployed Worker is reachable and has the Anthropic key:

```bash
npm run check:worker -- https://cv-job-tailor-reader.your-account.workers.dev
```

Expected passing output includes `PASS: Worker is reachable and ANTHROPIC_API_KEY is configured.`
