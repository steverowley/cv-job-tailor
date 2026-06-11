import { FileText, Upload } from "lucide-react";
import { Panel } from "../components/Panel";

export function CvUploadPanel(props: {
  cvFileName: string;
  cvText: string;
  onUpload(file?: File): void;
}) {
  return (
    <Panel icon={<Upload />} title="Upload CV" step="03">
      <label className="upload-box">
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => props.onUpload(event.target.files?.[0])}
        />
        <FileText aria-hidden="true" />
        <span>{props.cvFileName || "Choose a PDF or DOCX CV"}</span>
      </label>
      {props.cvText ? (
        <p className="hint">{props.cvText.length.toLocaleString()} characters extracted locally.</p>
      ) : null}
      {props.cvFileName.toLowerCase().endsWith(".docx") ? (
        <p className="hint">
          Tip: a PDF upload also gives the designer an image of your current layout to mirror — DOCX
          text is used, but its layout can't be read.
        </p>
      ) : null}
    </Panel>
  );
}
