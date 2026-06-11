import { Link } from "lucide-react";
import { Panel } from "../components/Panel";

export function JobPanel(props: {
  jobUrl: string;
  setJobUrl(value: string): void;
  jobText: string;
  setJobText(value: string): void;
  showJobFallback: boolean;
  setShowJobFallback(value: boolean): void;
}) {
  return (
    <Panel icon={<Link />} title="Job description" step="02">
      <label>
        Job URL
        <input
          value={props.jobUrl}
          onChange={(event) => props.setJobUrl(event.target.value)}
          type="url"
          placeholder="https://company.com/careers/role"
        />
      </label>
      {props.showJobFallback || props.jobText ? (
        <section className="fallback-section">
          <div className="fallback-head">
            <h3>Paste job description</h3>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                props.setShowJobFallback(false);
                props.setJobText("");
              }}
            >
              Hide
            </button>
          </div>
          <textarea
            value={props.jobText}
            onChange={(event) => props.setJobText(event.target.value)}
            placeholder="Paste the job description here. Use this if the website blocks browser access."
          />
        </section>
      ) : (
        <button
          className="text-action panel-foot-action"
          type="button"
          onClick={() => props.setShowJobFallback(true)}
        >
          Paste job description instead
        </button>
      )}
    </Panel>
  );
}
