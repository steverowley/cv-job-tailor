# CV Job Tailor

A static GitHub Pages web app for tailoring a CV against a job description. The main app runs on GitHub Pages, with an optional Cloudflare Worker reader for employer/job pages that block browser access.

## What it does

- Accepts a job description URL or pasted job text.
- Reads a PDF or DOCX CV locally in the browser.
- Uses either the user's own OpenAI API key or an OpenAI key stored as a Cloudflare Worker secret to extract job skills, match CV evidence, and propose evidence-only CV wording.
- Shows unsupported job requirements as gaps instead of inventing experience.
- Takes an employer website URL, extracts public brand signals when browser access allows it, and exports a branded PDF.
- Can use a small Cloudflare Worker to read public job/employer pages when CORS blocks GitHub Pages.

## Privacy model

This app is designed for GitHub Pages, so there is no app database or saved CV history. If a user enters a personal OpenAI API key, it is kept in browser session storage. If you configure the Cloudflare Worker with `OPENAI_API_KEY`, the browser sends the job/CV text to the Worker and the Worker calls OpenAI without exposing the key to GitHub Pages. Generated PDFs are downloaded directly by the user.

Some job websites block browser reads with CORS. The optional Cloudflare Worker can fetch public HTML server-side and return it to the browser. If a site blocks the Worker too, paste the job description into the fallback text box.

Employer websites can also block reads. If that happens, the app still derives a company name from the URL and lets you fine-tune the logo URL and colours before export.

## Cloudflare Worker setup

The Worker code is in `worker/index.js` and is configured by `wrangler.toml`.

1. Create or log in to a Cloudflare account.
2. In Cloudflare, create an API token with permission to deploy Workers.
3. In GitHub, open this repo's settings, then add repository secrets:
   - `CLOUDFLARE_API_TOKEN`: your Cloudflare API token.
   - `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID.
   - `OPENAI_API_KEY`: optional, used by the Worker so users do not need to paste their own key.
4. In GitHub Actions, run the `Deploy Cloudflare Worker` workflow. If `OPENAI_API_KEY` is present, the workflow syncs it to the Worker as a Cloudflare secret before deploy.
5. Copy the deployed Worker URL. It will look similar to:

```text
https://cv-job-tailor-reader.your-account.workers.dev
```

6. Add that URL as a GitHub repository variable or secret:
   - `VITE_CLOUDFLARE_WORKER_URL`: your Worker URL.
7. Re-run the GitHub Pages workflow, or push a small change to trigger it.

You can also paste the Worker URL into the app's "Cloudflare Worker URL" field for immediate testing. The app keeps it in browser session storage.

The Worker exposes `GET /status` for checking whether the OpenAI secret is configured, `POST /read` for website reading, and `POST /analyse` for OpenAI analysis when `OPENAI_API_KEY` is configured. It allows browser calls from `https://steverowley.github.io` plus local development origins.

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
