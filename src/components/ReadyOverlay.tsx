import { BadgeCheck, Download, Maximize2, Sparkles, X } from "lucide-react";

export function ReadyOverlay({
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
