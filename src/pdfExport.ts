import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function exportElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  let remainingHeight = imageHeight;
  let position = 0;

  const image = canvas.toDataURL("image/png");
  pdf.addImage(image, "PNG", 0, position, imageWidth, imageHeight);
  remainingHeight -= pageHeight;

  while (remainingHeight > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(image, "PNG", 0, position, imageWidth, imageHeight);
    remainingHeight -= pageHeight;
  }

  pdf.save(filename);
}
