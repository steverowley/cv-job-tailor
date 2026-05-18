import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Download,
  FileText,
  KeyRound,
  Link,
  Palette,
  Sparkles,
  Upload,
} from "lucide-react";
import { extractCvText } from "./documentParser";
import { BrandReadError, readEmployerBrand, readJobDescription } from "./jobReader";
import { analyseCvAgainstJob } from "./openai";
import { exportElementAsPdf } from "./pdfExport";
import { AnalysisResult, BrandSettings } from "./types";

type Status = "idle" | "reading" | "analysing" | "ready" | "exporting" | "error";

const DEFAULT_BRAND: BrandSettings = {
  companyName: "Target employer",
  primaryColor: "#1b4d3e",
  accentColor: "#d3a84f",
};

export function App() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem("openai-api-key") || "");
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [employerWebsiteUrl, setEmployerWebsiteUrl] = useState("");
  const [employerBrandSource, setEmployerBrandSource] = useState("");
  const [cvFileName, setCvFileName] = useState("");
  const [cvText, setCvText] = useState("");
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeOutput, setActiveOutput] = useState<"review" | "cv">("review");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [brandMessage, setBrandMessage] = useState("Add the employer website to make the PDF match their public brand signals.");
  const pdfRef = useRef<HTMLDivElement>(null);

  const canAnalyse = useMemo(
    () => apiKey.trim() && (jobUrl.trim() || jobText.trim()) && cvText.trim(),
    [apiKey, jobText, jobUrl, cvText],
  );

  function saveKey(value: string) {
    setApiKey(value);
    if (value.trim()) {
      sessionStorage.setItem("openai-api-key", value);
    } else {
      sessionStorage.removeItem("openai-api-key");
    }
  }

  async function handleCvUpload(file?: File) {
    if (!file) {
      return;
    }

    try {
      setStatus("reading");
      setMessage("Reading CV text locally in your browser...");
      const text = await extractCvText(file);
      if (text.length < 80) {
        throw new Error("The CV text looks too short. Try a different PDF/DOCX export.");
      }
      setCvText(text);
      setCvFileName(file.name);
      setMessage(`Loaded ${file.name}. Nothing has been uploaded to a server.`);
      setStatus("idle");
    } catch (error) {
      showError(error);
    }
  }

  async function runAnalysis() {
    try {
      setStatus("analysing");
      setMessage("Reading the job details and comparing them with the CV...");
      const job = await readJobDescription(jobUrl, jobText);
      if (!employerWebsiteUrl.trim()) {
        setBrand((current) => ({
          ...current,
          ...job.brand,
          companyName:
            current.companyName === DEFAULT_BRAND.companyName ? job.brand.companyName : current.companyName,
        }));
      }

      const result = await analyseCvAgainstJob({
        apiKey,
        jobText: job.text,
        cvText,
        employerHint: brand.companyName || job.brand.companyName,
      });

      setAnalysis(result);
      setActiveOutput("review");
      setMessage(job.warning || "Analysis complete. Review the evidence before exporting.");
      setStatus("ready");
    } catch (error) {
      showError(error);
    }
  }

  async function generateBrand() {
    try {
      setStatus("reading");
      setBrandMessage(
        employerBrandSource.trim()
          ? "Generating brand from the pasted employer website details..."
          : "Reading public brand signals from the employer website...",
      );
      const generatedBrand = await readEmployerBrand(employerWebsiteUrl, employerBrandSource);
      setBrand(generatedBrand);
      setBrandMessage("Brand generated. You can still fine-tune it before export.");
      setStatus("idle");
    } catch (error) {
      if (error instanceof BrandReadError) {
        setBrand((current) => ({ ...current, ...error.fallbackBrand }));
      }
      setBrandMessage(error instanceof Error ? error.message : "The employer website could not be read.");
      setStatus("error");
    }
  }

  async function exportPdf() {
    if (!pdfRef.current || !analysis) {
      return;
    }

    try {
      setStatus("exporting");
      setMessage("Preparing the branded PDF...");
      await exportElementAsPdf(
        pdfRef.current,
        `${slugify(analysis.employerName || brand.companyName)}-tailored-cv.pdf`,
      );
      setStatus("ready");
      setMessage("PDF downloaded.");
    } catch (error) {
      showError(error);
    }
  }

  function showError(error: unknown) {
    setStatus("error");
    setMessage(error instanceof Error ? error.message : "Something went wrong.");
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="section-label">GitHub Pages CV tailoring</p>
          <h1>Turn a job post and your existing CV into an evidence-only branded PDF.</h1>
          <p className="hero-copy">
            The app runs in the browser, uses your own OpenAI key, keeps CV parsing local, and asks you to
            approve the result before export.
          </p>
        </div>
        <div className="privacy-panel">
          <BadgeCheck aria-hidden="true" />
          <div>
            <strong>Static by design</strong>
            <span>No backend, no database, no saved CV history.</span>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="input-stack">
          <Panel icon={<KeyRound />} title="1. OpenAI key">
            <label>
              API key
              <input
                value={apiKey}
                onChange={(event) => saveKey(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder="sk-..."
              />
            </label>
            <p className="hint">Stored only in this browser session so GitHub Pages never contains a secret.</p>
          </Panel>

          <Panel icon={<Link />} title="2. Job description">
            <label>
              Job URL
              <input
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
                type="url"
                placeholder="https://company.com/careers/role"
              />
            </label>
            <label>
              Paste fallback
              <textarea
                value={jobText}
                onChange={(event) => setJobText(event.target.value)}
                placeholder="Paste the job description here if the website blocks browser access."
              />
            </label>
          </Panel>

          <Panel icon={<Upload />} title="3. Upload CV">
            <label className="upload-box">
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => handleCvUpload(event.target.files?.[0])}
              />
              <FileText aria-hidden="true" />
              <span>{cvFileName || "Choose a PDF or DOCX CV"}</span>
            </label>
            {cvText ? <p className="hint">{cvText.length.toLocaleString()} characters extracted locally.</p> : null}
          </Panel>

          <Panel icon={<Palette />} title="4. Employer brand">
            <label>
              Employer website
              <input
                value={employerWebsiteUrl}
                onChange={(event) => setEmployerWebsiteUrl(event.target.value)}
                type="url"
                placeholder="https://employer.com"
              />
            </label>
            <button
              className="brand-action"
              disabled={(!employerWebsiteUrl.trim() && !employerBrandSource.trim()) || status === "reading"}
              onClick={generateBrand}
            >
              <Palette aria-hidden="true" />
              Generate brand
            </button>
            <p className="hint">{brandMessage}</p>
            <label>
              Paste website text, HTML, or brand notes
              <textarea
                value={employerBrandSource}
                onChange={(event) => setEmployerBrandSource(event.target.value)}
                placeholder="Optional fallback: paste the employer homepage text, page source, logo URL, or colours such as #123456."
              />
            </label>
            <div className="brand-preview">
              <div className="brand-swatch" style={{ background: brand.primaryColor }} />
              <div>
                <strong>{brand.companyName}</strong>
                <span>{brand.logoUrl ? "Logo found" : "No logo detected yet"}</span>
              </div>
            </div>
            <div className="brand-row">
              <label>
                Employer name
                <input
                  value={brand.companyName}
                  onChange={(event) => setBrand({ ...brand, companyName: event.target.value })}
                />
              </label>
              <label>
                Logo URL
                <input
                  value={brand.logoUrl || ""}
                  onChange={(event) => setBrand({ ...brand, logoUrl: event.target.value })}
                  placeholder="Optional"
                />
              </label>
            </div>
            <p className="hint">These overrides are useful when the employer website blocks browser reads.</p>
            <div className="swatches">
              <label>
                Primary
                <input
                  type="color"
                  value={brand.primaryColor}
                  onChange={(event) => setBrand({ ...brand, primaryColor: event.target.value })}
                />
              </label>
              <label>
                Accent
                <input
                  type="color"
                  value={brand.accentColor}
                  onChange={(event) => setBrand({ ...brand, accentColor: event.target.value })}
                />
              </label>
            </div>
          </Panel>

          <button className="primary-action" disabled={!canAnalyse || status === "analysing"} onClick={runAnalysis}>
            <Sparkles aria-hidden="true" />
            Analyse and tailor CV
          </button>

          {message ? (
            <div className={`status ${status === "error" ? "status-error" : ""}`}>
              {status === "error" ? <AlertTriangle aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}
              <span>{message}</span>
            </div>
          ) : null}
        </div>

        <div className="review-stack">
          <div className="output-tabs" aria-label="Output view">
            <button
              className={activeOutput === "review" ? "active" : ""}
              onClick={() => setActiveOutput("review")}
              type="button"
            >
              Review
            </button>
            <button
              className={activeOutput === "cv" ? "active" : ""}
              onClick={() => setActiveOutput("cv")}
              type="button"
            >
              CV
            </button>
          </div>
          {activeOutput === "review" ? (
            <ReviewPanel analysis={analysis} />
          ) : (
            <CvPreview refElement={pdfRef} analysis={analysis} brand={brand} />
          )}
          <button className="secondary-action" disabled={!analysis || status === "exporting"} onClick={exportPdf}>
            <Download aria-hidden="true" />
            Download branded PDF
          </button>
        </div>
      </section>
    </main>
  );
}

function Panel(props: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        {props.icon}
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

function ReviewPanel({ analysis }: { analysis: AnalysisResult | null }) {
  if (!analysis) {
    return (
      <section className="panel empty-state">
        <h2>Review will appear here</h2>
        <p>Once analysed, you will see skills, evidence matches, proposed wording, and gaps before export.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <Sparkles aria-hidden="true" />
        <h2>Evidence review</h2>
      </div>
      <div className="skill-list">
        {analysis.skills.map((skill) => (
          <span key={`${skill.priority}-${skill.name}`} className={`skill skill-${skill.priority}`}>
            {skill.name}
          </span>
        ))}
      </div>
      <div className="evidence-list">
        {analysis.tailoredCv.evidenceMatches.map((match) => (
          <article key={`${match.skill}-${match.cvEvidence}`} className="evidence-item">
            <strong>{match.skill}</strong>
            <p>{match.cvEvidence}</p>
            <span>{match.confidence}</span>
          </article>
        ))}
      </div>
      {analysis.tailoredCv.gaps.length ? (
        <div className="gap-box">
          <strong>Unsupported gaps</strong>
          <ul>
            {analysis.tailoredCv.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function CvPreview({
  analysis,
  brand,
  refElement,
}: {
  analysis: AnalysisResult | null;
  brand: BrandSettings;
  refElement: React.RefObject<HTMLDivElement>;
}) {
  const cv = analysis?.tailoredCv;

  return (
    <section className="preview-shell">
      <div
        ref={refElement}
        className="cv-page"
        style={
          {
            "--brand-primary": brand.primaryColor,
            "--brand-accent": brand.accentColor,
          } as React.CSSProperties
        }
      >
        <header className="cv-header">
          <div>
            <span className="company-name">{analysis?.employerName || brand.companyName}</span>
            <h2>{cv?.headline || "Tailored CV preview"}</h2>
          </div>
          {brand.logoUrl ? <img src={brand.logoUrl} alt={`${brand.companyName} logo`} /> : null}
        </header>

        {cv ? (
          <>
            <section>
              <h3>Profile</h3>
              <p>{cv.summary}</p>
            </section>
            <section>
              <h3>Relevant skills</h3>
              <div className="cv-skills">
                {cv.coreSkills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </section>
            <section>
              <h3>Selected evidence</h3>
              <ul>
                {cv.experienceBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>
            {cv.cautions.length ? (
              <section className="cv-note">
                <h3>Review notes</h3>
                <ul>
                  {cv.cautions.map((caution) => (
                    <li key={caution}>{caution}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <p className="preview-placeholder">Your branded CV output will be rendered here after analysis.</p>
        )}
      </div>
    </section>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "tailored-cv";
}
