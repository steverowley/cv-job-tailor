import { useState } from "react";
import { BrandReadError, ReadDiagnostic, readEmployerBrand } from "../jobReader";
import { BrandSettings } from "../types";
import { Status, getErrorDiagnostics } from "./useAnalysis";

export const DEFAULT_BRAND: BrandSettings = {
  companyName: "Target employer",
  primaryColor: "#1b4d3e",
  accentColor: "#d3a84f",
  fontFamily: "Georgia",
};

export function useBrandOverrides(params: {
  workerUrl: string;
  setStatus(status: Status): void;
  setReadDiagnostics(diagnostics: ReadDiagnostic[]): void;
}) {
  const [employerWebsiteUrl, setEmployerWebsiteUrl] = useState("");
  const [employerBrandSource, setEmployerBrandSource] = useState("");
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND);
  const [brandGenerated, setBrandGenerated] = useState(false);
  const [brandMessage, setBrandMessage] = useState(
    "Add the employer website to make the PDF match their public brand signals.",
  );
  const [showBrandFallback, setShowBrandFallback] = useState(false);

  async function generateBrand() {
    try {
      params.setStatus("reading");
      params.setReadDiagnostics([]);
      setBrandMessage(
        employerBrandSource.trim()
          ? "Generating brand from the pasted employer website details..."
          : "Reading public brand signals from the employer website...",
      );
      const generatedBrand = await readEmployerBrand(
        employerWebsiteUrl,
        employerBrandSource,
        params.workerUrl,
      );
      setBrand(generatedBrand);
      setBrandGenerated(true);
      setShowBrandFallback(false);
      setBrandMessage("Brand generated. The CV will be designed on this brand when you analyse.");
      params.setStatus("idle");
    } catch (error) {
      if (error instanceof BrandReadError) {
        const fallback = { ...brand, ...error.fallbackBrand };
        setBrand(fallback);
        setBrandGenerated(true);
        params.setReadDiagnostics(error.diagnostics);
      } else {
        params.setReadDiagnostics(getErrorDiagnostics(error));
      }
      setShowBrandFallback(true);
      setBrandMessage(error instanceof Error ? error.message : "The employer website could not be read.");
      params.setStatus("error");
    }
  }

  // Used by the analysis pipeline when no employer website was given and the
  // brand has to be derived from the job page instead.
  function applyDerivedBrand(derived: BrandSettings) {
    setBrand(derived);
    setBrandGenerated(true);
  }

  return {
    employerWebsiteUrl,
    setEmployerWebsiteUrl,
    employerBrandSource,
    setEmployerBrandSource,
    brand,
    setBrand,
    brandGenerated,
    brandMessage,
    showBrandFallback,
    setShowBrandFallback,
    generateBrand,
    applyDerivedBrand,
  };
}
