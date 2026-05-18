# CV Job Tailor

A static GitHub Pages web app for tailoring a CV against a job description without a backend.

## What it does

- Accepts a job description URL or pasted job text.
- Reads a PDF or DOCX CV locally in the browser.
- Uses the user's own OpenAI API key to extract job skills, match CV evidence, and propose evidence-only CV wording.
- Shows unsupported job requirements as gaps instead of inventing experience.
- Takes an employer website URL, extracts public brand signals when browser access allows it, and exports a branded PDF.

## Privacy model

This app is designed for GitHub Pages, so there is no server-side storage. The OpenAI API key is kept in browser session storage, CV parsing runs locally, and generated PDFs are downloaded directly by the user.

Some job websites block browser reads with CORS. When that happens, paste the job description into the fallback text box.

Employer websites can also block browser reads. If that happens, the app still derives a company name from the URL and lets you fine-tune the logo URL and colours before export.

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
