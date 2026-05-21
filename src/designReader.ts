import { BrandSettings, DesignSpec } from "./types";

export class DesignReadError extends Error {
  constructor(
    message: string,
    readonly fallbackSpec: DesignSpec,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DesignReadError";
  }
}

export async function readEmployerDesignSpec(params: {
  workerUrl: string;
  sharedSecret?: string;
  websiteUrl: string;
  brand: BrandSettings;
  htmlExcerpt?: string;
}): Promise<{ designSpec: DesignSpec; screenshotUrl?: string }> {
  const { workerUrl, sharedSecret, websiteUrl, brand, htmlExcerpt } = params;

  const trimmedWorkerUrl = workerUrl.trim().replace(/\/+$/, "");
  if (!trimmedWorkerUrl) {
    throw new DesignReadError(
      "The Cloudflare Worker URL is not configured.",
      defaultDesignSpec(brand),
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sharedSecret?.trim()) {
    headers.Authorization = `Bearer ${sharedSecret.trim()}`;
  }

  let response: Response;
  try {
    response = await fetch(`${trimmedWorkerUrl}/design`, {
      method: "POST",
      headers,
      body: JSON.stringify({ websiteUrl, brand, htmlExcerpt }),
    });
  } catch (error) {
    throw new DesignReadError(
      `The browser could not reach the Worker. ${error instanceof Error ? error.message : ""}`.trim(),
      defaultDesignSpec(brand),
    );
  }

  const rawText = await response.text();
  let payload: { designSpec?: DesignSpec; screenshotUrl?: string; error?: string } = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new DesignReadError(
        "The Worker returned a non-JSON response from /design.",
        defaultDesignSpec(brand),
        response.status,
      );
    }
  }

  if (!response.ok) {
    throw new DesignReadError(
      payload.error || `Worker responded with ${response.status}.`,
      defaultDesignSpec(brand),
      response.status,
    );
  }

  if (!payload.designSpec) {
    throw new DesignReadError(
      "The Worker did not return a design spec.",
      defaultDesignSpec(brand),
      response.status,
    );
  }

  return {
    designSpec: normalizeDesignSpec(payload.designSpec, brand),
    screenshotUrl: payload.screenshotUrl,
  };
}

export function defaultDesignSpec(brand: BrandSettings): DesignSpec {
  const primary = brand.primaryColor || "#1b4d3e";
  const accent = brand.accentColor || "#d3a84f";
  const background = brand.backgroundColor || "#fffdf8";
  const text = brand.textColor || "#24211d";

  return {
    archetype: "sidebar-classic",
    mood: "Default — classic two-column CV with the extracted brand colours.",
    typography: {
      headingFont: brand.fontFamily || "Inter",
      headingKind: "sans",
      headingWeight: "bold",
      headingCase: "default",
      headingTracking: "normal",
      bodyFont: brand.fontFamily || "Inter",
      bodyKind: "sans",
      density: "comfortable",
      headlineSize: "large",
    },
    geometry: { corner: "soft", divider: "rule", bullet: "dot" },
    color: {
      pageBackground: background,
      surface: background,
      primary,
      accent,
      text,
      muted: mutedFrom(text),
    },
    hero: { accentBar: "top-thick", showLogo: true },
    sectionLabel: "uppercase-tracked",
    sidebar: "left",
  };
}

function normalizeDesignSpec(raw: DesignSpec, brand: BrandSettings): DesignSpec {
  const fallback = defaultDesignSpec(brand);
  const color = {
    pageBackground: pickColor(raw?.color?.pageBackground, fallback.color.pageBackground),
    surface: pickColor(raw?.color?.surface, fallback.color.surface),
    primary: pickColor(raw?.color?.primary, fallback.color.primary),
    accent: pickColor(raw?.color?.accent, fallback.color.accent),
    text: pickColor(raw?.color?.text, fallback.color.text),
    muted: pickColor(raw?.color?.muted, fallback.color.muted),
  };
  return {
    archetype: raw?.archetype || fallback.archetype,
    mood: raw?.mood || fallback.mood,
    typography: { ...fallback.typography, ...(raw?.typography || {}) },
    geometry: { ...fallback.geometry, ...(raw?.geometry || {}) },
    color,
    hero: { ...fallback.hero, ...(raw?.hero || {}) },
    sectionLabel: raw?.sectionLabel || fallback.sectionLabel,
    sidebar: raw?.sidebar || fallback.sidebar,
  };
}

function pickColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
  return fallback;
}

function mutedFrom(text: string): string {
  const value = text.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const mix = (channel: number) => Math.round(channel * 0.55 + 255 * 0.45);
  const hex = [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}
