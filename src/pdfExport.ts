import { AnalysisResult, BrandSettings } from "./types";

export async function exportTailoredCvPdf(params: {
  analysis: AnalysisResult;
  brand: BrandSettings;
  filename: string;
  workerUrl: string;
}): Promise<void> {
  const { analysis, brand, filename, workerUrl } = params;
  const [{ pdf }, { TailoredCvDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./CvDocument"),
  ]);

  const logoDataUrl = await loadLogoDataUrl(brand.logoUrl, workerUrl);

  const blob = await pdf(
    TailoredCvDocument({ analysis, brand, logoDataUrl }),
  ).toBlob();

  triggerDownload(blob, filename);
}

async function loadLogoDataUrl(
  logoUrl: string | undefined,
  workerUrl: string,
): Promise<string | undefined> {
  if (!logoUrl) {
    return undefined;
  }

  const trimmedWorker = workerUrl.trim().replace(/\/+$/, "");
  const proxied = trimmedWorker
    ? `${trimmedWorker}/proxy-image?url=${encodeURIComponent(logoUrl)}`
    : logoUrl;

  try {
    const response = await fetch(proxied);
    if (!response.ok) {
      return undefined;
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch {
    return undefined;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
