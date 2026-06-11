import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTailoringPipeline, TailoringEffects, TailoringInputs, getErrorDiagnostics } from "./tailoringPipeline";
import { readJobDescription } from "../jobReader";
import { AnalysisError, analyseCvAgainstJob } from "../analysis";
import { designCvHtml } from "../cvDesigner";
import { AnalysisResult, BrandSettings } from "../types";

vi.mock("../jobReader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../jobReader")>()),
  readJobDescription: vi.fn(),
}));
vi.mock("../analysis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../analysis")>()),
  analyseCvAgainstJob: vi.fn(),
}));
vi.mock("../cvDesigner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cvDesigner")>()),
  designCvHtml: vi.fn(),
}));

const mockReadJob = vi.mocked(readJobDescription);
const mockAnalyse = vi.mocked(analyseCvAgainstJob);
const mockDesign = vi.mocked(designCvHtml);

const USER_BRAND: BrandSettings = {
  companyName: "Target employer",
  primaryColor: "#1b4d3e",
  accentColor: "#d3a84f",
};

const JOB_BRAND: BrandSettings = {
  companyName: "Acme",
  primaryColor: "#112233",
  accentColor: "#445566",
};

const ANALYSIS = {
  jobTitle: "Designer",
  employerName: "Acme Ltd",
  skills: [],
  tailoredCv: { fullCv: { name: "Avery", experience: [] } },
} as unknown as AnalysisResult;

function makeInputs(overrides: Partial<TailoringInputs> = {}): TailoringInputs {
  return {
    workerUrl: "https://worker.test",
    sharedSecret: "secret",
    jobUrl: "https://jobs.example/role",
    jobText: "",
    employerWebsiteUrl: "",
    cvText: "CV TEXT",
    cvLayoutDataUrl: "data:image/jpeg;base64,xyz",
    brand: USER_BRAND,
    defaultCompanyName: "Target employer",
    ...overrides,
  };
}

function makeEffects() {
  const log: string[] = [];
  const fx: TailoringEffects = {
    setStatus: vi.fn((s) => log.push(`status:${s}`)),
    setMessage: vi.fn((m) => log.push(`message:${m.slice(0, 30)}`)),
    setReadDiagnostics: vi.fn(),
    onJobReadFailed: vi.fn(() => log.push("jobReadFailed")),
    applyDerivedBrand: vi.fn(() => log.push("derivedBrand")),
    setAnalysis: vi.fn(() => log.push("analysis")),
    setDesignedHtml: vi.fn(() => log.push("html")),
    setDesignInputs: vi.fn(),
  };
  return { fx, log };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("runTailoringPipeline", () => {
  it("runs read → analyse → design and ends ready on the happy path", async () => {
    mockReadJob.mockResolvedValue({ text: "JOB", brand: JOB_BRAND, source: "url" });
    mockAnalyse.mockResolvedValue(ANALYSIS);
    mockDesign.mockResolvedValue({
      html: "<!DOCTYPE html>...",
      screenshotUrl: "",
      inputs: { hadCvLayout: true, hadEmployerScreenshot: false, hadLogo: false },
    });

    const { fx, log } = makeEffects();
    const ok = await runTailoringPipeline(makeInputs(), fx);

    expect(ok).toBe(true);
    expect(log[0]).toBe("status:analysing");
    expect(log[log.length - 1]).toBe("status:ready");
    expect(log).toContain("status:designing");
    expect(fx.setAnalysis).toHaveBeenCalledWith(ANALYSIS);
    expect(fx.setDesignedHtml).toHaveBeenCalledWith("<!DOCTYPE html>...");
    expect(fx.setDesignInputs).toHaveBeenCalledWith({
      hadCvLayout: true,
      hadEmployerScreenshot: false,
      hadLogo: false,
    });
  });

  it("derives the brand from the job page when no employer website is set", async () => {
    mockReadJob.mockResolvedValue({ text: "JOB", brand: JOB_BRAND, source: "url" });
    mockAnalyse.mockResolvedValue(ANALYSIS);
    mockDesign.mockResolvedValue({ html: "<!DOCTYPE html>", screenshotUrl: "", inputs: {} as never });

    const { fx } = makeEffects();
    await runTailoringPipeline(makeInputs({ employerWebsiteUrl: "" }), fx);

    // User never customised the company name, so the job page's name wins.
    expect(fx.applyDerivedBrand).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: "Acme", primaryColor: "#112233" }),
    );
    expect(mockAnalyse).toHaveBeenCalledWith(expect.objectContaining({ employerHint: "Acme" }));
  });

  it("keeps a user-customised company name when deriving the brand", async () => {
    mockReadJob.mockResolvedValue({ text: "JOB", brand: JOB_BRAND, source: "url" });
    mockAnalyse.mockResolvedValue(ANALYSIS);
    mockDesign.mockResolvedValue({ html: "<!DOCTYPE html>", screenshotUrl: "", inputs: {} as never });

    const { fx } = makeEffects();
    await runTailoringPipeline(
      makeInputs({ brand: { ...USER_BRAND, companyName: "My Override" } }),
      fx,
    );

    expect(fx.applyDerivedBrand).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: "My Override" }),
    );
  });

  it("does not touch the brand when an employer website is set", async () => {
    mockReadJob.mockResolvedValue({ text: "JOB", brand: JOB_BRAND, source: "url" });
    mockAnalyse.mockResolvedValue(ANALYSIS);
    mockDesign.mockResolvedValue({ html: "<!DOCTYPE html>", screenshotUrl: "", inputs: {} as never });

    const { fx } = makeEffects();
    await runTailoringPipeline(makeInputs({ employerWebsiteUrl: "https://acme.example" }), fx);

    expect(fx.applyDerivedBrand).not.toHaveBeenCalled();
    expect(mockDesign).toHaveBeenCalledWith(
      expect.objectContaining({ brand: USER_BRAND, employerHomepageUrl: "https://acme.example" }),
    );
  });

  it("shows the paste fallback and surfaces diagnostics when the job read fails", async () => {
    const error = Object.assign(new Error("Read failed"), {
      diagnostics: [{ stage: "worker", ok: false, message: "boom" }],
    });
    mockReadJob.mockRejectedValue(error);

    const { fx, log } = makeEffects();
    const ok = await runTailoringPipeline(makeInputs(), fx);

    expect(ok).toBe(false);
    expect(fx.onJobReadFailed).toHaveBeenCalledOnce();
    expect(fx.setReadDiagnostics).toHaveBeenLastCalledWith(error.diagnostics);
    expect(log[log.length - 2]).toBe("status:error");
    expect(mockAnalyse).not.toHaveBeenCalled();
  });

  it("stops with an error and keeps diagnostics when the analysis fails", async () => {
    mockReadJob.mockResolvedValue({ text: "JOB", brand: JOB_BRAND, source: "url" });
    mockAnalyse.mockRejectedValue(new AnalysisError("Worker responded with 401.", 401));

    const { fx } = makeEffects();
    const ok = await runTailoringPipeline(makeInputs(), fx);

    expect(ok).toBe(false);
    expect(fx.setStatus).toHaveBeenLastCalledWith("error");
    expect(fx.setMessage).toHaveBeenLastCalledWith("Worker responded with 401.");
    expect(mockDesign).not.toHaveBeenCalled();
    expect(fx.setAnalysis).not.toHaveBeenCalled();
  });

  it("keeps the analysis but reports an error when the design step fails", async () => {
    mockReadJob.mockResolvedValue({ text: "JOB", brand: JOB_BRAND, source: "url" });
    mockAnalyse.mockResolvedValue(ANALYSIS);
    mockDesign.mockRejectedValue(new Error("design exploded"));

    const { fx } = makeEffects();
    const ok = await runTailoringPipeline(makeInputs(), fx);

    expect(ok).toBe(false);
    expect(fx.setAnalysis).toHaveBeenCalledWith(ANALYSIS);
    expect(fx.setMessage).toHaveBeenLastCalledWith(
      "Analysis succeeded but the on-brand CV design failed. design exploded",
    );
    expect(fx.setStatus).toHaveBeenLastCalledWith("error");
  });

  it("surfaces the job reader's warning while designing", async () => {
    mockReadJob.mockResolvedValue({
      text: "JOB",
      brand: JOB_BRAND,
      source: "pasted",
      warning: "Used the pasted text.",
    });
    mockAnalyse.mockResolvedValue(ANALYSIS);
    mockDesign.mockResolvedValue({ html: "<!DOCTYPE html>", screenshotUrl: "", inputs: {} as never });

    const { fx } = makeEffects();
    await runTailoringPipeline(makeInputs(), fx);

    expect(fx.setMessage).toHaveBeenCalledWith("Used the pasted text.");
  });
});

describe("getErrorDiagnostics", () => {
  it("returns the diagnostics array carried on an error", () => {
    const diagnostics = [{ stage: "worker", ok: false, message: "x" }];
    expect(getErrorDiagnostics(Object.assign(new Error("e"), { diagnostics }))).toEqual(diagnostics);
  });

  it("returns an empty array for errors without diagnostics", () => {
    expect(getErrorDiagnostics(new Error("plain"))).toEqual([]);
    expect(getErrorDiagnostics(null)).toEqual([]);
    expect(getErrorDiagnostics({ diagnostics: "not-an-array" })).toEqual([]);
  });
});
