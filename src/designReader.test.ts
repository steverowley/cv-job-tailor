import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignReadError, defaultDesignSpec, readEmployerDesignSpec } from "./designReader";
import { BrandSettings } from "./types";

const baseBrand: BrandSettings = {
  companyName: "Acme",
  primaryColor: "#0066cc",
  accentColor: "#ffaa33",
  backgroundColor: "#ffffff",
  textColor: "#111111",
  fontFamily: "Inter",
  palette: ["#0066cc", "#ffaa33"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defaultDesignSpec", () => {
  it("uses extracted brand colours for primary, accent, and background", () => {
    const spec = defaultDesignSpec(baseBrand);
    expect(spec.color.primary).toBe("#0066cc");
    expect(spec.color.accent).toBe("#ffaa33");
    expect(spec.color.pageBackground).toBe("#ffffff");
    expect(spec.archetype).toBe("sidebar-classic");
  });

  it("falls back when colours are missing", () => {
    const spec = defaultDesignSpec({ companyName: "X", primaryColor: "", accentColor: "" });
    expect(spec.color.primary).toMatch(/^#/);
    expect(spec.color.accent).toMatch(/^#/);
  });
});

describe("readEmployerDesignSpec", () => {
  it("rejects an empty Worker URL with a DesignReadError that exposes a fallback spec", async () => {
    await expect(
      readEmployerDesignSpec({
        workerUrl: "  ",
        websiteUrl: "https://acme.example.com",
        brand: baseBrand,
      }),
    ).rejects.toMatchObject({
      name: "DesignReadError",
    });
  });

  it("POSTs websiteUrl, brand, and optional htmlExcerpt to /design and unpacks the design spec", async () => {
    const spec = {
      ...defaultDesignSpec(baseBrand),
      archetype: "feature-band",
      mood: "Bold, brand-forward, modern.",
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ designSpec: spec, screenshotUrl: "https://cdn.example.com/shot.png" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const result = await readEmployerDesignSpec({
      workerUrl: "https://worker.example.com/",
      sharedSecret: "shh",
      websiteUrl: "https://acme.example.com",
      brand: baseBrand,
      htmlExcerpt: "<html />",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://worker.example.com/design");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer shh");
    expect((init as RequestInit).body).toBe(
      JSON.stringify({
        websiteUrl: "https://acme.example.com",
        brand: baseBrand,
        htmlExcerpt: "<html />",
      }),
    );
    expect(result.designSpec.archetype).toBe("feature-band");
    expect(result.screenshotUrl).toBe("https://cdn.example.com/shot.png");
  });

  it("surfaces worker errors as DesignReadError with the fallback spec attached", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Screenshot failed." }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
    );

    let captured: DesignReadError | undefined;
    try {
      await readEmployerDesignSpec({
        workerUrl: "https://worker.example.com",
        websiteUrl: "https://acme.example.com",
        brand: baseBrand,
      });
    } catch (error) {
      if (error instanceof DesignReadError) {
        captured = error;
      } else {
        throw error;
      }
    }

    expect(captured).toBeDefined();
    expect(captured?.message).toBe("Screenshot failed.");
    expect(captured?.status).toBe(502);
    expect(captured?.fallbackSpec.color.primary).toBe(baseBrand.primaryColor);
  });

  it("rejects with a DesignReadError when the Worker returns 200 without a design spec", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );

    await expect(
      readEmployerDesignSpec({
        workerUrl: "https://worker.example.com",
        websiteUrl: "https://acme.example.com",
        brand: baseBrand,
      }),
    ).rejects.toMatchObject({ name: "DesignReadError" });
  });

  it("normalises bad colours from the worker by falling back to brand values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          designSpec: {
            ...defaultDesignSpec(baseBrand),
            color: {
              pageBackground: "not-a-colour",
              surface: "#ffffff",
              primary: "#abcdef",
              accent: "garbage",
              text: "#222222",
              muted: "#777777",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await readEmployerDesignSpec({
      workerUrl: "https://worker.example.com",
      websiteUrl: "https://acme.example.com",
      brand: baseBrand,
    });

    expect(result.designSpec.color.primary).toBe("#abcdef");
    expect(result.designSpec.color.pageBackground).toBe(baseBrand.backgroundColor);
    expect(result.designSpec.color.accent).toBe(baseBrand.accentColor);
  });
});
