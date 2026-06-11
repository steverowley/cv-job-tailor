import { Status } from "../hooks/useAnalysis";
import { WorkerStatus } from "../hooks/useWorkerStatus";

export function WorkingIndicator({ label }: { label: string }) {
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

export function getWorkingLabel(status: Status, workerStatus: WorkerStatus): string {
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
