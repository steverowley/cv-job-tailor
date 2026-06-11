import { useEffect, useRef } from "react";
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
  const cardRef = useRef<HTMLDivElement>(null);

  // aria-modal alone doesn't stop Tab from escaping into the page behind the
  // dialog, so trap focus inside the card and restore it on close.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(card.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"));
    focusables()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    card.addEventListener("keydown", onKeyDown);
    return () => {
      card.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ready-overlay-title"
      onClick={onDismiss}
    >
      <div className="overlay-card" ref={cardRef} onClick={(event) => event.stopPropagation()}>
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
