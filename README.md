# CV Job Tailor

A static GitHub Pages web app for tailoring a CV against a job description. The main app runs on GitHub Pages, with a required Cloudflare Worker that holds the OpenAI API key, reads employer pages that block GitHub Pages, and proxies employer logos for the PDF.

## What it does

- Accepts a job description URL or pasted job text.
- Reads a PDF or DOCX CV locally in the browser.
- Sends the CV and job text to a Cloudflare Worker that calls the OpenAI Responses API to extract job skills, match CV evidence, and propose evidence-only CV wording.
- Shows unsupported job requirements as gaps instead of inventing experience.
- Takes an employer website URL, extracts public brand signals when the Worker can fetch them, and exports a text-rendered branded PDF (ATS-friendly, not a raster image).
- Generates a CV layout that is on-brand for each employer, not a fixed template: the Worker captures a screenshot of the employer homepage with Microlink and asks gpt-5 (with vision) to produce a self-contained, A4-portrait HTML CV that mirrors the employer's typography, colour usage, and visual voice. The browser renders that HTML through the native print dialog (Save as PDF).

## Privacy model

This app is designed for GitHub Pages, so there is no app database or saved CV history. The OpenAI API key never reaches the browser — it lives only as a Cloudflare Worker secret. The Worker also proxies employer logos and reads career pages so that GitHub Pages does not need direct cross-origin access.

If a job site blocks the Worker too, paste the job description into the fallback text box. If an employer site cannot be read, the app still derives a company name from the URL and lets you fine-tune the logo URL and colours before export.

## Cloudflare Worker setup

The Worker code is in `worker/index.js` and is configured by `wrangler.toml`. The Worker exposes:

- `GET /status` — reports whether `OPENAI_API_KEY`, `ANALYSE_SHARED_SECRET`, and `JINA_API_KEY` are configured.
- `POST /read` — fetches a public HTML page server-side.
- `POST /analyse` — sends the job + CV text to the OpenAI Responses API (gpt-5) and returns the structured analysis. Requires `Authorization: Bearer <ANALYSE_SHARED_SECRET>` if the shared secret is set.
- `POST /design-cv-html` — takes the structured CV + brand signals + employer homepage URL, captures a Microlink screenshot, and asks gpt-5 with vision to produce a self-contained on-brand HTML CV. Same auth as `/analyse`. The Worker fetches the employer logo server-side and embeds it as a data URL in the generated HTML. The browser then renders the HTML through the native print dialog, where the user picks **Save as PDF**.

It allows browser calls from `https://steverowley.github.io` plus local development origins.

### One-time setup

1. Create or log in to a Cloudflare account.
2. In Cloudflare, create an API token with permission to deploy Workers.
3. In GitHub, open this repo's settings, then add repository secrets:
   - `CLOUDFLARE_API_TOKEN`: your Cloudflare API token.
   - `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.
   - `OPENAI_API_KEY`: your OpenAI API key. Synced to the Worker as a Cloudflare secret on deploy.
   - `ANALYSE_SHARED_SECRET` (optional but recommended): a long random string. The Worker rejects authenticated endpoints without a matching `Authorization` header. Set the same value as `VITE_ANALYSE_SHARED_SECRET` so the frontend can send it.
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

## Eval suite

The eval suite runs three synthetic (CV, JD) fixtures through the deployed Worker's `/analyse` and (by default) chains each result through `/design-cv-html`. It checks objective properties of both stages — schema sanity, banned phrases, length budgets, evidence-only preservation of names/dates/employers, no fabricated skills, and on the HTML side: valid structure, A4 portrait `@page`, the worker-injected CSP meta, the candidate name and every employer rendered as visible text, and ≤ 200 KB document size.

```bash
# Uses $VITE_CLOUDFLARE_WORKER_URL by default; runs /analyse + /design-cv-html
VITE_CLOUDFLARE_WORKER_URL=https://your.worker.dev \
VITE_ANALYSE_SHARED_SECRET=... \
  npm run eval

# Pass the URL directly
npm run eval -- https://your.worker.dev

# Skip the design step (cheaper, ~halves the cost) — useful when iterating on
# the analysis prompt
npm run eval -- --analyse-only
```

Cost (gpt-5, medium reasoning): `/analyse` ≈ $0.30–0.50 per fixture; `/design-cv-html` ≈ $0.40–0.60 per fixture. A full run on three fixtures is ≈ **$2–3**; `--analyse-only` is ≈ $1–1.50.

Fixtures live in `fixtures/<name>-cv.txt` and `fixtures/<name>-jd.txt`. To add a new pair, drop two files with the same `<name>` stem and re-run.

## Worker diagnostics

Check whether the deployed Worker is reachable and has the OpenAI key:

```bash
npm run check:worker -- https://cv-job-tailor-reader.your-account.workers.dev
```

Expected passing output includes `PASS: Worker is reachable and OPENAI_API_KEY is configured.`
