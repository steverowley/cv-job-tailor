import { afterEach, describe, expect, it, vi } from "vitest";
import { CvDesignerError, designCvHtml, printCvHtml } from "./cvDesigner";
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

  it("turns a 429 with an HTML body into a friendly rate-limit error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>Blocked</html>", {
        status: 429,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      designCvHtml({
        workerUrl: "https://worker.example.com",
        structuredCv: FULL_CV,
        brand: BRAND,
      }),
    ).rejects.toMatchObject({
      name: "CvDesignerError",
      status: 429,
      message: expect.stringMatching(/Too many requests/),
    });
  });

  it("POSTs the structured CV, brand, and employer details to /design-cv-html", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            html: "<!DOCTYPE html><html></html>",
            screenshotUrl: "https://s.example/x.png",
            inputs: { hadCvLayout: true, hadEmployerScreenshot: true, hadLogo: false },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    const result = await designCvHtml({
      workerUrl: "https://worker.example.com/",
      sharedSecret: "shh",
      structuredCv: FULL_CV,
      brand: BRAND,
      employerHomepageUrl: " https://acme.example.com ",
      jobTitle: "Engineer",
      employerName: "Acme",
      cvLayoutDataUrl: "data:image/jpeg;base64,AAAA",
    });

    expect(result.html).toBe("<!DOCTYPE html><html></html>");
    expect(result.screenshotUrl).toBe("https://s.example/x.png");
    expect(result.inputs).toEqual({ hadCvLayout: true, hadEmployerScreenshot: true, hadLogo: false });

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
    expect(body.cvLayoutDataUrl).toBe("data:image/jpeg;base64,AAAA");
  });

  it("sends an empty cvLayoutDataUrl when the caller doesn't supply one", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ html: "<!DOCTYPE html><html></html>" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await designCvHtml({
      workerUrl: "https://worker.example.com",
      structuredCv: FULL_CV,
      brand: BRAND,
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.cvLayoutDataUrl).toBe("");
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

describe("printCvHtml", () => {
  it("opens a new window with the HTML and triggers print", () => {
    const writeSpy = vi.fn();
    const openSpy = vi.fn();
    const closeSpy = vi.fn();
    const focusSpy = vi.fn();
    const printSpy = vi.fn();
    const fakeDoc = { open: openSpy, write: writeSpy, close: closeSpy, readyState: "complete" };
    const fakeWindow = {
      document: fakeDoc,
      addEventListener: vi.fn(),
      focus: focusSpy,
      print: printSpy,
    } as unknown as Window;
    const openWindowSpy = vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    vi.useFakeTimers();
    printCvHtml("<!DOCTYPE html><html><head></head><body></body></html>", "acme-tailored-cv.pdf");
    vi.runAllTimers();
    vi.useRealTimers();

    expect(openWindowSpy).toHaveBeenCalledWith("", "_blank");
    expect(openSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();
    const written = writeSpy.mock.calls[0][0] as string;
    expect(written).toContain("<title>acme-tailored-cv</title>");
    expect(closeSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(printSpy).toHaveBeenCalled();
  });

  it("throws when the browser blocks the popup", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(() => printCvHtml("<!DOCTYPE html><html></html>", "x.pdf")).toThrow(/pop-ups/i);
  });
});
