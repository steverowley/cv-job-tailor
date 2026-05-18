# CV Job Tailor

A static GitHub Pages web app for tailoring a CV against a job description without a backend.

## What it does

- Accepts a job description URL or pasted job text.
- Reads a PDF or DOCX CV locally in the browser.
- Uses the user's own OpenAI API key to extract job skills, match CV evidence, and propose evidence-only CV wording.
- Shows unsupported job requirements as gaps instead of inventing experience.
- Exports a branded PDF using employer-inspired colours/logo when available.

## Privacy model

This app is designed for GitHub Pages, so there is no server-side storage. The OpenAI API key is kept in browser session storage, CV parsing runs locally, and generated PDFs are downloaded directly by the user.

Some job websites block browser reads with CORS. When that happens, paste the job description into the fallback text box.

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
