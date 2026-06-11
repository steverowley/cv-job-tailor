import { BadgeCheck, Server } from "lucide-react";
import { Panel } from "../components/Panel";
import { WorkerStatus, formatWorkerStatus } from "../hooks/useWorkerStatus";

export function WorkerPanel(props: {
  workerUrl: string;
  saveWorkerUrl(value: string): void;
  resetWorkerUrl(): void;
  isEditingWorkerUrl: boolean;
  setIsEditingWorkerUrl(value: boolean): void;
  workerStatus: WorkerStatus;
  workerStatusDetail: string;
  hasConfiguredWorkerUrl: boolean;
  canResetToDefault: boolean;
}) {
  return (
    <Panel icon={<Server />} title="Cloudflare Worker" step="01">
      {props.hasConfiguredWorkerUrl && !props.isEditingWorkerUrl ? (
        <div className="config-summary">
          <BadgeCheck aria-hidden="true" />
          <div>
            <strong>Worker URL loaded</strong>
            <span>{formatWorkerStatus(props.workerStatus, props.workerStatusDetail)}</span>
          </div>
          <button className="text-action" type="button" onClick={() => props.setIsEditingWorkerUrl(true)}>
            Change
          </button>
        </div>
      ) : (
        <>
          <label>
            Cloudflare Worker URL
            <input
              value={props.workerUrl}
              onChange={(event) => props.saveWorkerUrl(event.target.value)}
              type="url"
              placeholder="https://cv-job-tailor-reader.your-account.workers.dev"
            />
          </label>
          {props.canResetToDefault ? (
            <button className="text-action" type="button" onClick={props.resetWorkerUrl}>
              Use deployed Worker URL
            </button>
          ) : null}
          <p className="hint">{formatWorkerStatus(props.workerStatus, props.workerStatusDetail)}</p>
        </>
      )}
      <p className="hint">
        Required. The Worker holds the OpenAI key, reads career pages that block GitHub Pages, and proxies employer logos for the PDF.
      </p>
    </Panel>
  );
}
