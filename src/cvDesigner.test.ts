import { afterEach, describe, expect, it, vi } from "vitest";
import { CvDesignerError, designCvHtml, renderCvPdf } from "./cvDesigner";
import { BrandSettings, FullCv } from "./types";

const BRAND: BrandSettings = {
  companyName: "Acme",
  primaryColor: "#101010",
  accentColor: "#ff5500",
  logoUrl: "https://acme.example.com/logo.png",
};

const FULL_CV: FullCv = {
  name: "Jane Doe",
  contactLines: ["jane@example.com"],
  headline: "Senior Engineer",
  profile: "Profile text.",
  skills: ["TypeScript"],
  experience: [],
  education: [],
  certifications: [],
  additionalSections: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("designCvHtml", () => {
  it("rejects an empty Worker URL", async () => {
    await expect(
      designCvHtml({
        workerUrl: "   ",
        structuredCv: FULL_CV,
        brand: BRAND,
      }),
    ).rejects.toBeInstanceOf(CvDesignerError);
  });

  it("POSTs the structured CV, brand, and employer details to /design-cv-html", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ html: "<!DOCTYPE html><html></html>", screenshotUrl: "https://s.example/x.png" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const result = await designCvHtml({
      workerUrl: "https://worker.example.com/",
      sharedSecret: "shh",
      structuredCv: FULL_CV,
      brand: BRAND,
      employerHomepageUrl: " https://acme.example.com ",
      jobTitle: "Engineer",
      employerName: "Acme",
    });

    expect(result.html).toBe("<!DOCTYPE html><html></html>");
    expect(result.screenshotUrl).toBe("https://s.example/x.png");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://worker.example.com/design-cv-html");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer shh");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.structuredCv).toEqual(FULL_CV);
    expect(body.brand.companyName).toBe("Acme");
    expect(body.employerHomepageUrl).toBe("https://acme.example.com");
    expect(body.logoUrl).toBe("https://acme.example.com/logo.png");
    expect(body.jobTitle).toBe("Engineer");
    expect(body.employerName).toBe("Acme");
  });

  it("surfaces the Worker error message on a 502", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "HTML failed safety checks" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      designCvHtml({
        workerUrl: "https://worker.example.com",
        structuredCv: FULL_CV,
        brand: BRAND,
      }),
    ).rejects.toMatchObject({ name: "CvDesignerError", message: "HTML failed safety checks", status: 502 });
  });
});

describe("renderCvPdf", () => {
  it("POSTs the HTML and resolves with the PDF blob", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" }), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );

    const blob = await renderCvPdf({
      workerUrl: "https://worker.example.com",
      sharedSecret: "shh",
      html: "<!DOCTYPE html><html></html>",
      fileName: "acme-tailored-cv.pdf",
    });

    expect(blob.type).toBe("application/pdf");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://worker.example.com/render-pdf");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.html).toBe("<!DOCTYPE html><html></html>");
    expect(body.fileName).toBe("acme-tailored-cv.pdf");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer shh");
  });

  it("surfaces a 503 when Browser Rendering is not configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "missing CF_ACCOUNT_ID" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      renderCvPdf({
        workerUrl: "https://worker.example.com",
        html: "<!DOCTYPE html><html></html>",
      }),
    ).rejects.toMatchObject({ name: "CvDesignerError", status: 503, message: "missing CF_ACCOUNT_ID" });
  });
});
