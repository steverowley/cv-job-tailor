import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Download,
  FileText,
  Link,
  Maximize2,
  Minimize2,
  Palette,
  Server,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { extractCvText, looksLikeUsableCv } from "./documentParser";
import { BrandReadError, ReadDiagnostic, readEmployerBrand, readJobDescription } from "./jobReader";
import { analyseCvAgainstJob } from "./analysis";
import { CvDesignerError, designCvHtml, printCvHtml } from "./cvDesigner";
import { CvHtmlPreview } from "./CvHtmlPreview";
import { AnalysisResult, BrandSettings } from "./types";

type Status = "idle" | "reading" | "designing" | "analysing" | "ready" | "exporting" | "error";
type WorkerStatus = "idle" | "checking" | "configured" | "missing-key" | "unreachable";

const DEFAULT_BRAND: BrandSettings = {
  companyName: "Target employer",
  primaryColor: "#1b4d3e",
  accentColor: "#d3a84f",
  fontFamily: "Georgia",
};

const DEFAULT_WORKER_URL = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || "";
const ANALYSE_SHARED_SECRET = import.meta.env.VITE_ANALYSE_SHARED_SECRET || "";

export function App() {
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [employerWebsiteUrl, setEmployerWebsiteUrl] = useState("");
  const [employerBrandSource, setEmployerBrandSource] = useState("");
  const [workerUrl, setWorkerUrl] = useState(
    () => sessionStorage.getItem("cv-job-tailor-worker-url") || DEFAULT_WORKER_URL,
  );
  const [isEditingWorkerUrl, setIsEditingWorkerUrl] = useState(() => !DEFAULT_WORKER_URL);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("idle");
  const [workerStatusDetail, setWorkerStatusDetail] = useState("");
  const [cvFileName, setCvFileName] = useState("");
  const [cvText, setCvText] = useState("");
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [brandGenerated, setBrandGenerated] = useState(false);
  const [designedHtml, setDesignedHtml] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeOutput, setActiveOutput] = useState<"review" | "cv">("review");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [readDiagnostics, setReadDiagnostics] = useState<ReadDiagnostic[]>([]);
  const [brandMessage, setBrandMessage] = useState(
    "Add the employer website to make the PDF match their public brand signals.",
  );
  const [showJobFallback, setShowJobFallback] = useState(false);
  const [showBrandFallback, setShowBrandFallback] = useState(false);
  const [showReadyOverlay, setShowReadyOverlay] = useState(false);
  const [isOutputFullscreen, setIsOutputFullscreen] = useState(false);

  const canAnalyse = useMemo(
    () => workerStatus === "configured" && (jobUrl.trim() || jobText.trim()) && cvText.trim(),
    [workerStatus, jobText, jobUrl, cvText],
  );
  const hasConfiguredWorkerUrl = Boolean(DEFAULT_WORKER_URL && workerUrl.trim() === DEFAULT_WORKER_URL);
  const workingLabel = getWorkingLabel(status, workerStatus);

  useEffect(() => {
    if (!workerUrl.trim()) {
      setWorkerStatus("idle");
      setWorkerStatusDetail("");
      return;
    }

    const controller = new AbortController();
    async function checkWorker() {
      try {
        setWorkerStatus("checking");
        setWorkerStatusDetail("");
        const endpoint = `${normalizeWorkerUrl(workerUrl)}/status`;
        const response = await fetch(endpoint, {
          signal: controller.signal,
        });
        const rawText = await response.text();
        const payload = rawText
          ? (JSON.parse(rawText) as { error?: string; hasOpenAiKey?: boolean })
          : {};
        if (!response.ok) {
          setWorkerStatusDetail(
            `Status check reached ${endpoint}, but the Worker returned ${response.status}. ${payload.error || rawText}`,
          );
          setWorkerStatus("unreachable");
          return;
        }
        setWorkerStatusDetail(`Checked ${endpoint}.`);
        setWorkerStatus(payload.hasOpenAiKey ? "configured" : "missing-key");
      } catch (error) {
        if (!controller.signal.aborted) {
          setWorkerStatus("unreachable");
          setWorkerStatusDetail(error instanceof Error ? error.message : "The Worker status check failed.");
        }
      }
    }

    checkWorker();
    return () => controller.abort();
  }, [workerUrl]);

  useEffect(() => {
    if (!isOutputFullscreen && !showReadyOverlay) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (showReadyOverlay) {
        setShowReadyOverlay(false);
      } else if (isOutputFullscreen) {
        setIsOutputFullscreen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOutputFullscreen, showReadyOverlay]);

  useEffect(() => {
    if (!isOutputFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOutputFullscreen]);

  function saveWorkerUrl(value: string) {
    setWorkerUrl(value);
    if (value.trim()) {
      sessionStorage.setItem("cv-job-tailor-worker-url", value.trim());
    } else {
      sessionStorage.removeItem("cv-job-tailor-worker-url");
    }
  }

  function resetWorkerUrl() {
    sessionStorage.removeItem("cv-job-tailor-worker-url");
    setWorkerUrl(DEFAULT_WORKER_URL);
    setIsEditingWorkerUrl(false);
  }

  async function handleCvUpload(file?: File) {
    if (!file) {
      return;
    }

    try {
      setStatus("reading");
      setMessage("Reading CV text locally in your browser...");
      setReadDiagnostics([]);
      const text = await extractCvText(file);
      if (!looksLikeUsableCv(text)) {
        throw new Error(
          "The CV text looks too short or did not parse readable words. Try a different PDF/DOCX export.",
        );
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
      setReadDiagnostics([]);
      setDesignedHtml("");
      const job = await readJobDescription(jobUrl, jobText, workerUrl);
      if (job.diagnostics?.length) {
        setReadDiagnostics(job.diagnostics);
      }
      let workingBrand = brand;
      if (!employerWebsiteUrl.trim()) {
        workingBrand = {
          ...brand,
          ...job.brand,
          companyName:
            brand.companyName === DEFAULT_BRAND.companyName ? job.brand.companyName : brand.companyName,
        };
        setBrand(workingBrand);
        setBrandGenerated(true);
      }

      const result = await analyseCvAgainstJob({
        workerUrl,
        sharedSecret: ANALYSE_SHARED_SECRET,
        jobText: job.text,
        cvText,
        employerHint: workingBrand.companyName || job.brand.companyName,
      });

      setAnalysis(result);
      setMessage(job.warning || "Designing an on-brand CV from the employer's homepage...");

      setStatus("designing");
      try {
        const { html } = await designCvHtml({
          workerUrl,
          sharedSecret: ANALYSE_SHARED_SECRET,
          structuredCv: result.tailoredCv.fullCv,
          brand: workingBrand,
          employerHomepageUrl: employerWebsiteUrl.trim(),
          jobTitle: result.jobTitle,
          employerName: result.employerName || workingBrand.companyName,
        });
        setDesignedHtml(html);
      } catch (designError) {
        setMessage(
          `Analysis succeeded but the on-brand CV design failed. ${
            designError instanceof Error ? designError.message : ""
          }`.trim(),
        );
        setStatus("error");
        return;
      }

      setActiveOutput("cv");
      setMessage("Analysis complete. Preview the CV or download the PDF.");
      setStatus("ready");
      setShowReadyOverlay(true);
    } catch (error) {
      setShowJobFallback(true);
      setReadDiagnostics(getErrorDiagnostics(error));
      showError(error);
    }
  }

  async function generateBrand() {
    try {
      setStatus("reading");
      setReadDiagnostics([]);
      setBrandMessage(
        employerBrandSource.trim()
          ? "Generating brand from the pasted employer website details..."
          : "Reading public brand signals from the employer website...",
      );
      const generatedBrand = await readEmployerBrand(employerWebsiteUrl, employerBrandSource, workerUrl);
      setBrand(generatedBrand);
      setBrandGenerated(true);
      setShowBrandFallback(false);
      setBrandMessage("Brand generated. The CV will be designed on this brand when you analyse.");
      setStatus("idle");
    } catch (error) {
      if (error instanceof BrandReadError) {
        const fallback = { ...brand, ...error.fallbackBrand };
        setBrand(fallback);
        setBrandGenerated(true);
        setReadDiagnostics(error.diagnostics);
      } else {
        setReadDiagnostics(getErrorDiagnostics(error));
      }
      setShowBrandFallback(true);
      setBrandMessage(error instanceof Error ? error.message : "The employer website could not be read.");
      setStatus("error");
    }
  }

  function exportPdf() {
    if (!analysis || !designedHtml) {
      return;
    }

    try {
      const fileName = `${slugify(analysis.employerName || brand.companyName)}-tailored-cv.pdf`;
      printCvHtml(designedHtml, fileName);
      setStatus("ready");
      setMessage(
        "Opened the print dialog. Choose 'Save as PDF' as the destination to download your tailored CV.",
      );
    } catch (error) {
      if (error instanceof CvDesignerError) {
        setMessage(error.message);
        setStatus("error");
      } else {
        showError(error);
      }
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
          <p className="section-label">CV Job Tailor</p>
          <h1>Tailor your CV against any job — with evidence, not invention.</h1>
          <p className="hero-copy">
            Drop a job URL, upload your CV, and get a branded PDF. The OpenAI call runs from a Cloudflare Worker, parsing stays in the browser, and unsupported requirements surface as gaps instead of fiction.
          </p>
        </div>
        <div className="privacy-panel">
          <BadgeCheck aria-hidden="true" />
          <div>
            <strong>Static by design</strong>
            <span>No backend. No database. No saved history.</span>
          </div>
        </div>
      </section>

      {workingLabel ? <WorkingIndicator label={workingLabel} /> : null}

      <section className="workspace-grid">
        <div className="input-stack">
          <Panel icon={<Server />} title="Cloudflare Worker" step="01">
            {hasConfiguredWorkerUrl && !isEditingWorkerUrl ? (
              <div className="config-summary">
                <BadgeCheck aria-hidden="true" />
                <div>
                  <strong>Worker URL loaded</strong>
                  <span>{formatWorkerStatus(workerStatus, workerStatusDetail)}</span>
                </div>
                <button className="text-action" type="button" onClick={() => setIsEditingWorkerUrl(true)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <label>
                  Cloudflare Worker URL
                  <input
                    value={workerUrl}
                    onChange={(event) => saveWorkerUrl(event.target.value)}
                    type="url"
                    placeholder="https://cv-job-tailor-reader.your-account.workers.dev"
                  />
                </label>
                {DEFAULT_WORKER_URL && workerUrl !== DEFAULT_WORKER_URL ? (
                  <button className="text-action" type="button" onClick={resetWorkerUrl}>
                    Use deployed Worker URL
                  </button>
                ) : null}
                <p className="hint">{formatWorkerStatus(workerStatus, workerStatusDetail)}</p>
              </>
            )}
            <p className="hint">
              Required. The Worker holds the OpenAI key, reads career pages that block GitHub Pages, and proxies employer logos for the PDF.
            </p>
          </Panel>

          <Panel icon={<Link />} title="Job description" step="02">
            <label>
              Job URL
              <input
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
                type="url"
                placeholder="https://company.com/careers/role"
              />
            </label>
            {showJobFallback || jobText ? (
              <section className="fallback-section">
                <div className="fallback-head">
                  <h3>Paste job description</h3>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => {
                      setShowJobFallback(false);
                      setJobText("");
                    }}
                  >
                    Hide
                  </button>
                </div>
                <textarea
                  value={jobText}
                  onChange={(event) => setJobText(event.target.value)}
                  placeholder="Paste the job description here. Use this if the website blocks browser access."
                />
              </section>
            ) : (
              <button
                className="text-action panel-foot-action"
                type="button"
                onClick={() => setShowJobFallback(true)}
              >
                Paste job description instead
              </button>
            )}
          </Panel>

          <Panel icon={<Upload />} title="Upload CV" step="03">
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

          <Panel icon={<Palette />} title="Employer brand" step="04">
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
              disabled={
                (!employerWebsiteUrl.trim() && !employerBrandSource.trim()) ||
                status === "reading"
              }
              onClick={generateBrand}
            >
              <Palette aria-hidden="true" />
              {brandGenerated ? "Re-generate brand" : "Generate brand"}
            </button>
            <p className="hint">{brandMessage}</p>
            {brandGenerated ? (
              <>
                <div className="brand-preview">
                  <div className="brand-swatch-pair">
                    <span style={{ background: brand.primaryColor }} title={`Primary ${brand.primaryColor}`} />
                    <span style={{ background: brand.accentColor }} title={`Accent ${brand.accentColor}`} />
                  </div>
                  <div>
                    <strong>{brand.companyName}</strong>
                    <span>
                      {[
                        brand.logoUrl ? "Logo found" : "No logo detected",
                        brand.fontFamily || "Default font",
                      ]
                        .filter(Boolean)
                        .join(" / ")}
                    </span>
                  </div>
                </div>
                {brand.palette?.length ? (
                  <div className="palette-strip" aria-label="Extracted brand palette">
                    {brand.palette.slice(0, 5).map((color) => (
                      <span key={color} style={{ background: color }} title={color} />
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {showBrandFallback ? (
              <section className="fallback-section">
                <div className="fallback-head">
                  <h3>Manual brand override</h3>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => {
                      setShowBrandFallback(false);
                      setEmployerBrandSource("");
                    }}
                  >
                    Hide
                  </button>
                </div>
                <label>
                  Paste website text, HTML, or brand notes
                  <textarea
                    value={employerBrandSource}
                    onChange={(event) => setEmployerBrandSource(event.target.value)}
                    placeholder="Paste the employer homepage text, page source, logo URL, or colours such as #123456."
                  />
                </label>
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
              </section>
            ) : (
              <button
                className="text-action panel-foot-action"
                type="button"
                onClick={() => setShowBrandFallback(true)}
              >
                Edit details manually
              </button>
            )}
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
          <ReadDiagnostics diagnostics={readDiagnostics} />
        </div>

        <div className={`review-stack ${isOutputFullscreen ? "review-stack-fullscreen" : ""}`}>
          <div className="output-bar">
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
            <button
              className="icon-action"
              type="button"
              onClick={() => setIsOutputFullscreen((value) => !value)}
              aria-label={isOutputFullscreen ? "Exit fullscreen" : "Open fullscreen"}
              title={isOutputFullscreen ? "Exit fullscreen (Esc)" : "Open fullscreen"}
            >
              {isOutputFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </button>
          </div>
          {activeOutput === "review" ? (
            <ReviewPanel analysis={analysis} />
          ) : (
            <CvHtmlPreview html={designedHtml} />
          )}
          <button
            className="secondary-action"
            disabled={!designedHtml || status === "exporting"}
            onClick={exportPdf}
          >
            <Download aria-hidden="true" />
            Download branded PDF
          </button>
        </div>
      </section>

      {showReadyOverlay && analysis ? (
        <ReadyOverlay
          employerName={analysis.employerName || brand.companyName}
          onDismiss={() => setShowReadyOverlay(false)}
          onOpenReview={() => {
            setActiveOutput("review");
            setIsOutputFullscreen(true);
            setShowReadyOverlay(false);
          }}
          onOpenCv={() => {
            setActiveOutput("cv");
            setIsOutputFullscreen(true);
            setShowReadyOverlay(false);
          }}
          onDownload={() => {
            setShowReadyOverlay(false);
            exportPdf();
          }}
        />
      ) : null}
    </main>
  );
}

function ReadyOverlay({
  employerName,
  onDismiss,
  onOpenReview,
  onOpenCv,
  onDownload,
}: {
  employerName: string;
  onDismiss: () => void;
  onOpenReview: () => void;
  onOpenCv: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ready-overlay-title"
      onClick={onDismiss}
    >
      <div className="overlay-card" onClick={(event) => event.stopPropagation()}>
        <button
          className="overlay-close"
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X aria-hidden="true" />
        </button>
        <BadgeCheck className="overlay-icon" aria-hidden="true" />
        <h2 id="ready-overlay-title">Your tailored CV is ready</h2>
        <p>
          {employerName ? `${employerName} version generated.` : "Analysis complete."}{" "}
          Review the evidence, open the CV preview, or download the branded PDF.
        </p>
        <div className="overlay-actions">
          <button className="primary-action" type="button" onClick={onOpenCv}>
            <Maximize2 aria-hidden="true" />
            Open CV fullscreen
          </button>
          <button className="secondary-action" type="button" onClick={onOpenReview}>
            <Sparkles aria-hidden="true" />
            Open evidence review
          </button>
          <button className="text-action" type="button" onClick={onDownload}>
            <Download aria-hidden="true" />
            Download branded PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkingIndicator({ label }: { label: string }) {
  return (
    <div className="working-indicator" role="status" aria-live="polite">
      <div>
        <span>{label}</span>
        <strong>Working</strong>
      </div>
      <div className="working-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function getWorkingLabel(status: Status, workerStatus: WorkerStatus): string {
  if (status === "reading") {
    return "Reading the document or employer website";
  }
  if (status === "designing") {
    return "Designing the CV from the employer's homepage";
  }
  if (status === "analysing") {
    return "Comparing the job description with the CV";
  }
  if (status === "exporting") {
    return "Preparing the PDF";
  }
  if (workerStatus === "checking") {
    return "Checking the website reader";
  }
  return "";
}

function ReadDiagnostics({ diagnostics }: { diagnostics: ReadDiagnostic[] }) {
  if (!diagnostics.length) {
    return null;
  }

  return (
    <section className="diagnostics-box">
      <strong>Read diagnostics</strong>
      <ul>
        {diagnostics.map((item, index) => (
          <li key={`${item.stage}-${index}`} className={item.ok ? "diagnostic-ok" : "diagnostic-fail"}>
            <span>{item.stage}</span>
            <p>{item.message}</p>
            {item.detail ? <small>{item.detail}</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function getErrorDiagnostics(error: unknown): ReadDiagnostic[] {
  const diagnostics = (error as { diagnostics?: unknown })?.diagnostics;
  return Array.isArray(diagnostics) ? (diagnostics as ReadDiagnostic[]) : [];
}

function Panel(props: { icon: React.ReactNode; title: string; step?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        {props.step ? <span className="panel-step">{props.step}</span> : null}
        {props.icon}
        <h2>{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

function normalizeWorkerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("No Worker URL is configured.");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function formatWorkerStatus(status: WorkerStatus, detail = ""): string {
  if (status === "checking") {
    return "Checking the configured Worker...";
  }
  if (status === "configured") {
    return "Worker reachable. OpenAI key present. Ready to analyse.";
  }
  if (status === "missing-key") {
    return `Worker reachable, but the OPENAI_API_KEY secret is not configured. ${detail}`.trim();
  }
  if (status === "unreachable") {
    return `The Worker could not be reached from this browser. ${detail}`.trim();
  }
  return "Add the Worker URL to enable analysis, website reading, and brand extraction.";
}

function ReviewPanel({ analysis }: { analysis: AnalysisResult | null }) {
  if (!analysis) {
    return (
      <section className="panel empty-state">
        <span className="empty-state-eyebrow">Review</span>
        <h2>Skills, evidence, and gaps will appear here.</h2>
        <p>Run the analysis to see how the job's requirements map onto your CV — and what's missing.</p>
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
        {analysis.skills.map((skill, index) => (
          <span key={index} className={`skill skill-${skill.priority}`}>
            {skill.name}
          </span>
        ))}
      </div>
      <div className="evidence-list">
        {analysis.tailoredCv.evidenceMatches.map((match, index) => (
          <article key={index} className="evidence-item">
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
            {analysis.tailoredCv.gaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "tailored-cv";
}
