import { describe, expect, it } from "vitest";
import {
  assertBannedPhrases,
  assertHtmlPageStructure,
  assertHtmlPreservation,
  assertHtmlShape,
  assertHtmlSize,
  assertLengthBudgets,
  assertNoFabricatedSkills,
  assertPreservation,
  assertSchema,
  collectStringValues,
  normaliseForMatch,
  runAssertions,
  runHtmlAssertions,
  stripTags,
  wordCount,
} from "./evalAssertions.mjs";

const CV_SAMPLE = `Jordan Patel
Senior Product Designer · London

EXPERIENCE
Lead Product Designer, Ledgerwave
March 2022 – Present, London
- Owned the Ledgerwave reconciliation module used daily by 9,000 accountants.
- Led the rebuild of the Ledgerwave Pattern Library across 38 documented components.
- Ran discovery sessions and mobile onboarding research for the customer team.

SKILLS
Design systems, Figma, React, Stakeholder workshops, WCAG accessibility, Mobile design, Discovery research, Component documentation`;

function makeAnalysis(overrides = {}) {
  return {
    jobTitle: "Senior Product Designer",
    employerName: "Helix Money",
    skills: [{ name: "Design systems", priority: "required", evidenceNeeded: "x" }],
    tailoredCv: {
      headline: "Senior Product Designer — fintech, design systems",
      summary:
        "Senior product designer with seven years of experience in B2B SaaS. Owned end-to-end design for three core flows at a mid-market fintech, led the migration to a documented design system, and ran discovery work that shaped mobile onboarding. Comfortable shipping in a fortnightly cadence and holding design quality with senior business stakeholders.",
      coreSkills: [
        "Design systems",
        "Figma",
        "React",
        "Stakeholder workshops",
        "WCAG accessibility",
        "Mobile-first design",
        "Discovery research",
        "Component documentation",
      ],
      experienceBullets: [
        "Owned design for the Ledgerwave reconciliation module used daily by 9,000 accountants across the UK and Ireland.",
        "Led the rebuild of the Ledgerwave Pattern Library from 64 components to 38 documented React components in Figma.",
        "Mentored two mid-level designers to senior promotion through weekly critiques and pairing sessions across the squad.",
      ],
      fullCv: {
        name: "Jordan Patel",
        contactLines: ["jordan.patel@example.com"],
        headline: "Senior Product Designer — fintech, design systems",
        profile:
          "Senior product designer with seven years of experience in B2B SaaS. Owned end-to-end design for three core flows at a mid-market fintech, led the migration to a documented design system, and ran discovery work that shaped mobile onboarding. Comfortable shipping in a fortnightly cadence and holding design quality with senior business stakeholders.",
        skills: [
          "Design systems",
          "Figma",
          "React",
          "Stakeholder workshops",
          "WCAG accessibility",
          "Mobile-first design",
          "Discovery research",
          "Component documentation",
        ],
        experience: [
          {
            role: "Lead Product Designer",
            organisation: "Ledgerwave",
            dates: "March 2022 – Present",
            location: "London",
            bullets: [
              "Owned the Ledgerwave reconciliation module used daily by 9,000 accountants across the UK and Ireland.",
              "Led the rebuild of the Ledgerwave Pattern Library across 38 documented React components in Figma.",
            ],
          },
        ],
        education: [],
        certifications: [],
        additionalSections: [],
      },
      evidenceMatches: [],
      gaps: [],
      cautions: [],
    },
    ...overrides,
  };
}

describe("assertSchema", () => {
  it("passes a complete analysis object", () => {
    expect(assertSchema(makeAnalysis())).toEqual([]);
  });

  it("rejects null or non-objects", () => {
    expect(assertSchema(null)).toEqual(["analysis is not an object"]);
    expect(assertSchema("x")).toEqual(["analysis is not an object"]);
  });

  it("flags missing top-level fields", () => {
    const failures = assertSchema({});
    expect(failures.join("\n")).toMatch(/jobTitle/);
    expect(failures.join("\n")).toMatch(/skills/);
    expect(failures.join("\n")).toMatch(/tailoredCv/);
  });

  it("flags missing nested fullCv fields", () => {
    const analysis = makeAnalysis();
    delete analysis.tailoredCv.fullCv.name;
    const failures = assertSchema(analysis);
    expect(failures.join("\n")).toMatch(/fullCv\.name/);
  });
});

describe("assertBannedPhrases", () => {
  it("returns empty when no banned phrases appear", () => {
    expect(assertBannedPhrases(makeAnalysis())).toEqual([]);
  });

  it.each([
    "passionate about design systems",
    "results-driven product manager",
    "team player who hits the ground running",
    "responsible for shipping the rebuild",
  ])("flags strings containing %s", (snippet) => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.summary = snippet;
    const failures = assertBannedPhrases(analysis);
    expect(failures.length).toBeGreaterThan(0);
  });

  it("scans nested arrays and objects, not just the top level", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.fullCv.experience[0].bullets[0] = "responsible for the rebuild";
    const failures = assertBannedPhrases(analysis);
    expect(failures.join("\n")).toMatch(/responsible for/);
  });
});

describe("assertLengthBudgets", () => {
  it("passes the sample analysis", () => {
    expect(assertLengthBudgets(makeAnalysis())).toEqual([]);
  });

  it("flags headlines over 80 chars", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.headline = "x".repeat(90);
    const failures = assertLengthBudgets(analysis);
    expect(failures.join("\n")).toMatch(/tailoredCv\.headline/);
  });

  it("flags summary that is too short or too long", () => {
    const tooShort = makeAnalysis();
    tooShort.tailoredCv.summary = "Too short.";
    expect(assertLengthBudgets(tooShort).join("\n")).toMatch(/summary is \d+ words/);

    const tooLong = makeAnalysis();
    tooLong.tailoredCv.summary = "word ".repeat(150).trim();
    expect(assertLengthBudgets(tooLong).join("\n")).toMatch(/summary is \d+ words/);
  });

  it("flags coreSkills list outside 8-14 items", () => {
    const tooFew = makeAnalysis();
    tooFew.tailoredCv.coreSkills = ["a", "b"];
    expect(assertLengthBudgets(tooFew).join("\n")).toMatch(/coreSkills/);
  });

  it("flags experience bullets outside 12-30 word range", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.fullCv.experience[0].bullets = ["short"];
    expect(assertLengthBudgets(analysis).join("\n")).toMatch(/bullets\[0\] is 1 words/);
  });
});

describe("assertPreservation", () => {
  it("passes when names, employers and dates appear in the CV", () => {
    expect(assertPreservation(CV_SAMPLE, makeAnalysis())).toEqual([]);
  });

  it("flags a candidate name that the CV does not contain", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.fullCv.name = "Someone Else";
    expect(assertPreservation(CV_SAMPLE, analysis).join("\n")).toMatch(/name "Someone Else"/);
  });

  it("flags an employer name that the CV does not contain", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.fullCv.experience[0].organisation = "Phantom Co";
    expect(
      assertPreservation(CV_SAMPLE, analysis).join("\n"),
    ).toMatch(/organisation "Phantom Co"/);
  });

  it("tolerates date reformatting when the date tokens still appear in the CV", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.fullCv.experience[0].dates = "Mar 2022 – Present";
    expect(assertPreservation(CV_SAMPLE, analysis)).toEqual([]);
  });

  it("flags a date with no tokens anchored in the CV", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.fullCv.experience[0].dates = "January 1999 – December 2001";
    expect(
      assertPreservation(CV_SAMPLE, analysis).join("\n"),
    ).toMatch(/dates "January 1999/);
  });
});

describe("assertNoFabricatedSkills", () => {
  it("passes when every coreSkill is anchored in the CV", () => {
    expect(assertNoFabricatedSkills(CV_SAMPLE, makeAnalysis())).toEqual([]);
  });

  it("flags a skill with no anchor in the CV", () => {
    const analysis = makeAnalysis();
    analysis.tailoredCv.coreSkills.push("Kubernetes operator development");
    const failures = assertNoFabricatedSkills(CV_SAMPLE, analysis);
    expect(failures.join("\n")).toMatch(/Kubernetes/);
  });

  it("tolerates paraphrased skills when a significant token still appears", () => {
    // CV says "Stakeholder workshops" — the model rephrasing to "Stakeholder
    // engagement" should pass because "stakeholder" is in the CV.
    const analysis = makeAnalysis();
    analysis.tailoredCv.coreSkills[3] = "Stakeholder engagement";
    expect(assertNoFabricatedSkills(CV_SAMPLE, analysis)).toEqual([]);
  });
});

describe("runAssertions", () => {
  it("returns no failures for a well-formed, evidence-only analysis", () => {
    expect(runAssertions(CV_SAMPLE, makeAnalysis())).toEqual([]);
  });

  it("bails out of deeper checks when the schema is broken", () => {
    const failures = runAssertions(CV_SAMPLE, { foo: "bar" });
    // Schema failure surfaces; no banned-phrase or length failures cascade.
    expect(failures.some((f) => f.includes("missing"))).toBe(true);
    expect(failures.some((f) => f.includes("banned phrase"))).toBe(false);
  });
});

describe("collectStringValues", () => {
  it("walks nested objects and arrays", () => {
    const out = collectStringValues({
      a: "one",
      b: { c: "two", d: ["three", { e: "four" }] },
    });
    expect(out.sort()).toEqual(["four", "one", "three", "two"]);
  });

  it("returns an empty list for primitives", () => {
    expect(collectStringValues(42)).toEqual([]);
    expect(collectStringValues(null)).toEqual([]);
  });
});

describe("normaliseForMatch", () => {
  it("lowercases, collapses whitespace, and normalises hyphens/quotes", () => {
    expect(normaliseForMatch("  Hello — World  ")).toBe("hello - world");
    expect(normaliseForMatch("Don’t")).toBe("don't");
  });
});

describe("wordCount", () => {
  it("counts whitespace-separated tokens", () => {
    expect(wordCount("one two three")).toBe(3);
    expect(wordCount("  spaced   out  ")).toBe(2);
  });

  it("returns 0 for empty or non-string input", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// HTML assertion tests
// ---------------------------------------------------------------------------

function makeValidHtml({ name = "Jordan Patel", org = "Ledgerwave", pages = 1, extra = "" } = {}) {
  const pageMarkup = Array.from({ length: pages }, () =>
    `<section class="page"><h1>${name}</h1><p>${org}</p>${extra}</section>`,
  ).join("");
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'">
    <style>
      @page { size: A4 portrait; margin: 0; }
      .page { width: 210mm; min-height: 297mm; padding: 18mm; box-sizing: border-box; }
    </style>
  </head>
  <body>${pageMarkup}</body>
</html>`;
}

describe("assertHtmlShape", () => {
  it("accepts a minimal valid document", () => {
    expect(assertHtmlShape(makeValidHtml())).toEqual([]);
  });

  it("rejects empty / non-string input", () => {
    expect(assertHtmlShape("")).toEqual(["html is empty or not a string"]);
    expect(assertHtmlShape(null)).toEqual(["html is empty or not a string"]);
  });

  it("rejects input missing DOCTYPE", () => {
    const html = "<html><head></head><body></body></html>";
    expect(assertHtmlShape(html).join("\n")).toMatch(/<!DOCTYPE html>/);
  });

  it("rejects multiple <style> blocks", () => {
    const html = makeValidHtml().replace(
      "<style>",
      "<style></style><style>",
    );
    expect(assertHtmlShape(html).join("\n")).toMatch(/exactly one <style> block/);
  });

  it.each([
    ["<script>alert(1)</script>", "<script"],
    ["<iframe src=\"x\"></iframe>", "<iframe"],
    ["<form></form>", "<form"],
    ["<a href=\"javascript:alert(1)\">x</a>", "javascript:"],
  ])("flags forbidden token in %s", (snippet, expectedToken) => {
    const html = makeValidHtml({ extra: snippet });
    const failures = assertHtmlShape(html);
    expect(failures.join("\n")).toMatch(new RegExp(`forbidden token "${expectedToken}"`));
  });

  it("requires the CSP meta tag the worker injects", () => {
    const html = makeValidHtml().replace(
      /<meta http-equiv="Content-Security-Policy"[^>]*>/,
      "",
    );
    expect(assertHtmlShape(html).join("\n")).toMatch(/Content-Security-Policy/);
  });
});

describe("assertHtmlPageStructure", () => {
  it("passes a document with @page A4 portrait and one .page section", () => {
    expect(assertHtmlPageStructure(makeValidHtml())).toEqual([]);
  });

  it("flags missing @page declaration", () => {
    const html = makeValidHtml().replace(/@page\s*\{[^}]*\}/, "");
    expect(assertHtmlPageStructure(html).join("\n")).toMatch(/@page/);
  });

  it("flags missing A4 portrait directive", () => {
    const html = makeValidHtml().replace("A4 portrait", "A5 landscape");
    expect(assertHtmlPageStructure(html).join("\n")).toMatch(/A4 portrait/);
  });

  it("flags 0 page sections", () => {
    const html = makeValidHtml().replace(/<section[^>]*>[\s\S]*?<\/section>/g, "");
    expect(assertHtmlPageStructure(html).join("\n")).toMatch(/no <section/);
  });

  it("flags more than the two-page hard cap", () => {
    const html = makeValidHtml({ pages: 3 });
    expect(assertHtmlPageStructure(html).join("\n")).toMatch(/3 page sections found/);
  });
});

describe("assertHtmlPreservation", () => {
  const analysis = {
    tailoredCv: {
      fullCv: {
        name: "Jordan Patel",
        experience: [
          { organisation: "Ledgerwave" },
          { organisation: "Tilden Health" },
        ],
      },
    },
  };

  it("passes when name and every employer appear as rendered text", () => {
    const html = makeValidHtml({
      extra: "<p>Lead Product Designer, Ledgerwave</p><p>Product Designer, Tilden Health</p>",
    });
    expect(assertHtmlPreservation("", analysis, html)).toEqual([]);
  });

  it("flags missing candidate name", () => {
    const html = makeValidHtml({ name: "Someone Else" });
    expect(assertHtmlPreservation("", analysis, html).join("\n")).toMatch(/Jordan Patel/);
  });

  it("flags missing employer organisation", () => {
    const html = makeValidHtml({ org: "Ledgerwave" });
    expect(
      assertHtmlPreservation("", analysis, html).join("\n"),
    ).toMatch(/Tilden Health/);
  });

  it("ignores employer names that only appear inside <style>", () => {
    const html = `<!DOCTYPE html><html><head>
      <meta http-equiv="Content-Security-Policy" content="x">
      <style>/* Tilden Health brand */ @page { size: A4 portrait; }</style>
    </head><body><section class="page"><h1>Jordan Patel</h1><p>Ledgerwave</p></section></body></html>`;
    expect(
      assertHtmlPreservation("", analysis, html).join("\n"),
    ).toMatch(/Tilden Health/);
  });
});

describe("assertHtmlSize", () => {
  it("passes documents under the 200 KB cap", () => {
    expect(assertHtmlSize(makeValidHtml())).toEqual([]);
  });

  it("flags documents over the cap", () => {
    const filler = "x".repeat(220_000);
    const html = makeValidHtml({ extra: filler });
    expect(assertHtmlSize(html).join("\n")).toMatch(/bytes \(max 200000\)/);
  });
});

describe("stripTags", () => {
  it("drops <style> contents entirely so CSS text doesn't leak into checks", () => {
    const html = "<style>.foo { font-family: Tilden; }</style><body>Real</body>";
    expect(stripTags(html).trim()).toBe("Real");
  });

  it("removes all other tags but keeps text", () => {
    expect(stripTags("<p>Hello <b>world</b></p>").trim()).toBe("Hello  world");
  });
});

describe("runHtmlAssertions", () => {
  const analysis = {
    tailoredCv: {
      fullCv: {
        name: "Jordan Patel",
        experience: [{ organisation: "Ledgerwave" }],
      },
    },
  };

  it("returns no failures for a well-formed HTML doc", () => {
    const html = makeValidHtml({ extra: "<p>Lead Product Designer, Ledgerwave</p>" });
    expect(runHtmlAssertions("", analysis, html)).toEqual([]);
  });

  it("bails out of deeper checks when the shape is wrong", () => {
    const html = "not html at all";
    const failures = runHtmlAssertions("", analysis, html);
    // Shape failure surfaces; no preservation / size failures cascade.
    expect(failures.some((f) => f.includes("DOCTYPE"))).toBe(true);
    expect(failures.some((f) => f.includes("organisation"))).toBe(false);
  });
});
