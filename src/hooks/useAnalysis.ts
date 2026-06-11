import { useState } from "react";
import { extractCvText, extractFirstPageImage, looksLikeUsableCv } from "../documentParser";
import { ReadDiagnostic } from "../jobReader";
import { CvDesignerError, DesignInputs, printCvHtml } from "../cvDesigner";
import { AnalysisResult, BrandSettings } from "../types";
import { Status, runTailoringPipeline } from "./tailoringPipeline";

export type { Status } from "./tailoringPipeline";
export { getErrorDiagnostics } from "./tailoringPipeline";

// NOTE: this token is inlined into the static JS bundle and is therefore visible to any visitor.
// It is anti-abuse obscurity, not a secret. The real boundary is ALLOWED_ORIGINS on the Worker
// plus Cloudflare-side rate limiting. Do not rely on this for confidentiality.
const ANALYSE_SHARED_SECRET = import.meta.env.VITE_ANALYSE_SHARED_SECRET || "";

export function useAnalysis(workerUrl: string) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [readDiagnostics, setReadDiagnostics] = useState<ReadDiagnostic[]>([]);
  const [cvFileName, setCvFileName] = useState("");
  const [cvText, setCvText] = useState("");
  const [cvLayoutDataUrl, setCvLayoutDataUrl] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [designedHtml, setDesignedHtml] = useState<string>("");
  const [designInputs, setDesignInputs] = useState<DesignInputs | null>(null);

  function showError(error: unknown) {
    setStatus("error");
    setMessage(error instanceof Error ? error.message : "Something went wrong.");
  }

  async function handleCvUpload(file?: File) {
    if (!file) {
      return;
    }

    try {
      setStatus("reading");
      setMessage("Reading CV text locally in your browser...");
      setReadDiagnostics([]);
      setCvLayoutDataUrl("");
      setCvText("");
      setCvFileName("");
      setAnalysis(null);
      setDesignedHtml("");
      setDesignInputs(null);
      const text = await extractCvText(file);
      if (!looksLikeUsableCv(text)) {
        throw new Error(
          "The CV text looks too short or did not parse readable words. Try a different PDF/DOCX export.",
        );
      }
      setCvText(text);
      setCvFileName(file.name);
      const layoutImage = await extractFirstPageImage(file);
      if (layoutImage) {
        setCvLayoutDataUrl(layoutImage);
      }
      setMessage(`Loaded ${file.name}. Nothing has been uploaded to a server.`);
      setStatus("idle");
    } catch (error) {
      setCvText("");
      setCvFileName("");
      setCvLayoutDataUrl("");
      showError(error);
    }
  }

  async function runAnalysis(params: {
    jobUrl: string;
    jobText: string;
    employerWebsiteUrl: string;
    brand: BrandSettings;
    defaultCompanyName: string;
    onJobReadFailed(): void;
    applyDerivedBrand(brand: BrandSettings): void;
  }): Promise<boolean> {
    if (status === "analysing" || status === "designing") {
      return false;
    }
    setDesignedHtml("");
    setDesignInputs(null);
    return runTailoringPipeline(
      {
        workerUrl,
        sharedSecret: ANALYSE_SHARED_SECRET,
        jobUrl: params.jobUrl,
        jobText: params.jobText,
        employerWebsiteUrl: params.employerWebsiteUrl,
        cvText,
        cvLayoutDataUrl,
        brand: params.brand,
        defaultCompanyName: params.defaultCompanyName,
      },
      {
        setStatus,
        setMessage,
        setReadDiagnostics,
        onJobReadFailed: params.onJobReadFailed,
        applyDerivedBrand: params.applyDerivedBrand,
        setAnalysis,
        setDesignedHtml,
        setDesignInputs,
      },
    );
  }

  function exportPdf(fallbackCompanyName: string) {
    if (!analysis || !designedHtml) {
      return;
    }
    if (status === "exporting") {
      return;
    }

    setStatus("exporting");
    try {
      const fileName = `${slugify(analysis.employerName || fallbackCompanyName)}-tailored-cv.pdf`;
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

  return {
    status,
    setStatus,
    message,
    setMessage,
    readDiagnostics,
    setReadDiagnostics,
    cvFileName,
    cvText,
    cvLayoutDataUrl,
    analysis,
    designedHtml,
    designInputs,
    handleCvUpload,
    runAnalysis,
    exportPdf,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "tailored-cv";
}
