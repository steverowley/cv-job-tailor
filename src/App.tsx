import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Download, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { CvHtmlPreview } from "./CvHtmlPreview";
import { DesignInputsStrip } from "./components/DesignInputsStrip";
import { ReadDiagnostics } from "./components/ReadDiagnostics";
import { ReadyOverlay } from "./components/ReadyOverlay";
import { WorkingIndicator, getWorkingLabel } from "./components/WorkingIndicator";
import { useAnalysis } from "./hooks/useAnalysis";
import { DEFAULT_BRAND, useBrandOverrides } from "./hooks/useBrandOverrides";
import { useWorkerStatus } from "./hooks/useWorkerStatus";
import { BrandPanel } from "./panels/BrandPanel";
import { CvUploadPanel } from "./panels/CvUploadPanel";
import { JobPanel } from "./panels/JobPanel";
import { ReviewPanel } from "./panels/ReviewPanel";
import { WorkerPanel } from "./panels/WorkerPanel";

export function App() {
  const worker = useWorkerStatus();
  const pipeline = useAnalysis(worker.workerUrl);
  const branding = useBrandOverrides({
    workerUrl: worker.workerUrl,
    setStatus: pipeline.setStatus,
    setReadDiagnostics: pipeline.setReadDiagnostics,
  });

  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [showJobFallback, setShowJobFallback] = useState(false);
  const [activeOutput, setActiveOutput] = useState<"review" | "cv">("review");
  const [showReadyOverlay, setShowReadyOverlay] = useState(false);
  const [isOutputFullscreen, setIsOutputFullscreen] = useState(false);

  const canAnalyse = useMemo(
    () =>
      worker.workerStatus === "configured" &&
      (jobUrl.trim() || jobText.trim()) &&
      pipeline.cvText.trim(),
    [worker.workerStatus, jobText, jobUrl, pipeline.cvText],
  );
  const workingLabel = getWorkingLabel(pipeline.status, worker.workerStatus);

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

  async function runAnalysis() {
    const ok = await pipeline.runAnalysis({
      jobUrl,
      jobText,
      employerWebsiteUrl: branding.employerWebsiteUrl,
      brand: branding.brand,
      defaultCompanyName: DEFAULT_BRAND.companyName,
      onJobReadFailed: () => setShowJobFallback(true),
      applyDerivedBrand: branding.applyDerivedBrand,
    });
    if (ok) {
      setActiveOutput("cv");
      setShowReadyOverlay(true);
    }
  }

  function exportPdf() {
    pipeline.exportPdf(branding.brand.companyName);
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
          <WorkerPanel
            workerUrl={worker.workerUrl}
            saveWorkerUrl={worker.saveWorkerUrl}
            resetWorkerUrl={worker.resetWorkerUrl}
            isEditingWorkerUrl={worker.isEditingWorkerUrl}
            setIsEditingWorkerUrl={worker.setIsEditingWorkerUrl}
            workerStatus={worker.workerStatus}
            workerStatusDetail={worker.workerStatusDetail}
            hasConfiguredWorkerUrl={worker.hasConfiguredWorkerUrl}
            canResetToDefault={worker.canResetToDefault}
          />

          <JobPanel
            jobUrl={jobUrl}
            setJobUrl={setJobUrl}
            jobText={jobText}
            setJobText={setJobText}
            showJobFallback={showJobFallback}
            setShowJobFallback={setShowJobFallback}
          />

          <CvUploadPanel
            cvFileName={pipeline.cvFileName}
            cvText={pipeline.cvText}
            onUpload={pipeline.handleCvUpload}
          />

          <BrandPanel
            employerWebsiteUrl={branding.employerWebsiteUrl}
            setEmployerWebsiteUrl={branding.setEmployerWebsiteUrl}
            employerBrandSource={branding.employerBrandSource}
            setEmployerBrandSource={branding.setEmployerBrandSource}
            brand={branding.brand}
            setBrand={branding.setBrand}
            brandGenerated={branding.brandGenerated}
            brandMessage={branding.brandMessage}
            showBrandFallback={branding.showBrandFallback}
            setShowBrandFallback={branding.setShowBrandFallback}
            generateBrand={branding.generateBrand}
            isReading={pipeline.status === "reading"}
          />

          <button
            className="primary-action"
            disabled={!canAnalyse || pipeline.status === "analysing" || pipeline.status === "designing"}
            onClick={runAnalysis}
          >
            <Sparkles aria-hidden="true" />
            Analyse and tailor CV
          </button>

          {pipeline.message ? (
            <div className={`status ${pipeline.status === "error" ? "status-error" : ""}`}>
              {pipeline.status === "error" ? (
                <AlertTriangle aria-hidden="true" />
              ) : (
                <BadgeCheck aria-hidden="true" />
              )}
              <span>{pipeline.message}</span>
            </div>
          ) : null}
          <ReadDiagnostics diagnostics={pipeline.readDiagnostics} />
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
            <ReviewPanel analysis={pipeline.analysis} />
          ) : (
            <>
              {pipeline.designedHtml && pipeline.designInputs ? (
                <DesignInputsStrip inputs={pipeline.designInputs} />
              ) : null}
              <CvHtmlPreview html={pipeline.designedHtml} />
            </>
          )}
          <button
            className="secondary-action"
            disabled={!pipeline.designedHtml || pipeline.status === "exporting"}
            onClick={exportPdf}
          >
            <Download aria-hidden="true" />
            Download branded PDF
          </button>
        </div>
      </section>

      {showReadyOverlay && pipeline.analysis ? (
        <ReadyOverlay
          employerName={pipeline.analysis.employerName || branding.brand.companyName}
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
