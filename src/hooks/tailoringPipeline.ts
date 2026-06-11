import { ReadDiagnostic, readJobDescription } from "../jobReader";
import { AnalysisError, analyseCvAgainstJob } from "../analysis";
import { DesignInputs, designCvHtml } from "../cvDesigner";
import { AnalysisResult, BrandSettings } from "../types";

export type Status = "idle" | "reading" | "designing" | "analysing" | "ready" | "exporting" | "error";

export interface TailoringInputs {
  workerUrl: string;
  sharedSecret: string;
  jobUrl: string;
  jobText: string;
  employerWebsiteUrl: string;
  cvText: string;
  cvLayoutDataUrl: string;
  brand: BrandSettings;
  defaultCompanyName: string;
}

export interface TailoringEffects {
  setStatus(status: Status): void;
  setMessage(message: string): void;
  setReadDiagnostics(diagnostics: ReadDiagnostic[]): void;
  onJobReadFailed(): void;
  applyDerivedBrand(brand: BrandSettings): void;
  setAnalysis(analysis: AnalysisResult): void;
  setDesignedHtml(html: string): void;
  setDesignInputs(inputs: DesignInputs): void;
}

// The orchestrator behind the "Analyse and tailor CV" button: read the job,
// derive a brand when none was generated, analyse, then design. Kept as a
// plain function (state reaches it via the effects object) so tests can run
// it without rendering React.
export async function runTailoringPipeline(
  inputs: TailoringInputs,
  fx: TailoringEffects,
): Promise<boolean> {
  fx.setStatus("analysing");
  fx.setMessage("Reading the job details and comparing them with the CV...");
  fx.setReadDiagnostics([]);

  let job: Awaited<ReturnType<typeof readJobDescription>>;
  try {
    job = await readJobDescription(inputs.jobUrl, inputs.jobText, inputs.workerUrl);
  } catch (error) {
    fx.onJobReadFailed();
    fx.setReadDiagnostics(getErrorDiagnostics(error));
    fx.setStatus("error");
    fx.setMessage(error instanceof Error ? error.message : "Something went wrong.");
    return false;
  }
  if (job.diagnostics?.length) {
    fx.setReadDiagnostics(job.diagnostics);
  }
  let workingBrand = inputs.brand;
  if (!inputs.employerWebsiteUrl.trim()) {
    workingBrand = {
      ...inputs.brand,
      ...job.brand,
      companyName:
        inputs.brand.companyName === inputs.defaultCompanyName
          ? job.brand.companyName
          : inputs.brand.companyName,
    };
    fx.applyDerivedBrand(workingBrand);
  }

  let result: AnalysisResult;
  try {
    result = await analyseCvAgainstJob({
      workerUrl: inputs.workerUrl,
      sharedSecret: inputs.sharedSecret,
      jobText: job.text,
      cvText: inputs.cvText,
      employerHint: workingBrand.companyName || job.brand.companyName,
    });
  } catch (error) {
    if (error instanceof AnalysisError) {
      fx.setReadDiagnostics(getErrorDiagnostics(error));
    }
    fx.setStatus("error");
    fx.setMessage(error instanceof Error ? error.message : "Something went wrong.");
    return false;
  }

  fx.setAnalysis(result);
  fx.setMessage(job.warning || "Designing an on-brand CV from the employer's homepage...");
  fx.setStatus("designing");

  try {
    const { html, inputs: designInputs } = await designCvHtml({
      workerUrl: inputs.workerUrl,
      sharedSecret: inputs.sharedSecret,
      structuredCv: result.tailoredCv.fullCv,
      brand: workingBrand,
      employerHomepageUrl: inputs.employerWebsiteUrl.trim(),
      jobTitle: result.jobTitle,
      employerName: result.employerName || workingBrand.companyName,
      cvLayoutDataUrl: inputs.cvLayoutDataUrl,
    });
    fx.setDesignedHtml(html);
    fx.setDesignInputs(designInputs);
  } catch (designError) {
    fx.setMessage(
      `Analysis succeeded but the on-brand CV design failed. ${
        designError instanceof Error ? designError.message : ""
      }`.trim(),
    );
    fx.setStatus("error");
    return false;
  }

  fx.setMessage("Analysis complete. Preview the CV or download the PDF.");
  fx.setStatus("ready");
  return true;
}

export function getErrorDiagnostics(error: unknown): ReadDiagnostic[] {
  const diagnostics = (error as { diagnostics?: unknown })?.diagnostics;
  return Array.isArray(diagnostics) ? (diagnostics as ReadDiagnostic[]) : [];
}
