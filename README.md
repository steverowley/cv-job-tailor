# CV Job Tailor

A static GitHub Pages web app for tailoring a CV against a job description. The main app runs on GitHub Pages, with an optional Cloudflare Worker reader for employer/job pages that block browser access.

## What it does

- Accepts a job description URL or pasted job text.
- Reads a PDF or DOCX CV locally in the browser.
- Uses the user's own OpenAI API key to extract job skills, match CV evidence, and propose evidence-only CV wording.
- Shows unsupported job requirements as gaps instead of inventing experience.
- Takes an employer website URL, extracts public brand signals when browser access allows it, and exports a branded PDF.
- Can use a small Cloudflare Worker to read public job/employer pages when CORS blocks GitHub Pages.

## Privacy model

This app is designed for GitHub Pages, so there is no app database or saved CV history. The OpenAI API key is kept in browser session storage, CV parsing runs locally, and generated PDFs are downloaded directly by the user.

Some job websites block browser reads with CORS. The optional Cloudflare Worker can fetch public HTML server-side and return it to the browser. If a site blocks the Worker too, paste the job description into the fallback text box.

Employer websites can also block reads. If that happens, the app still derives a company name from the URL and lets you fine-tune the logo URL and colours before export.

## Cloudflare Worker setup

The Worker code is in `worker/index.js` and is configured by `wrangler.toml`.

1. Create or log in to a Cloudflare account.
2. In Cloudflare, copy your Account ID from the account overview page.
3. In Cloudflare, create an API token with permission to deploy Workers.
4. In GitHub, open this repo's settings, then add repository secrets:
   - `CLOUDFLARE_API_TOKEN`: your Cloudflare API token.
   - `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare Account ID.
5. In GitHub Actions, run the `Deploy Cloudflare Worker` workflow.
6. Copy the deployed Worker URL. It will look similar to:

```text
https://cv-job-tailor-reader.your-account.workers.dev
```

7. Add that URL as a GitHub repository variable:
   - `VITE_CLOUDFLARE_WORKER_URL`: your Worker URL.
8. Re-run the GitHub Pages workflow, or push a small change to trigger it.

The Worker exposes only `POST /read`, accepts `{ "url": "https://example.com" }`, returns public HTML, and allows browser calls from `https://steverowley.github.io` plus local development origins.

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
