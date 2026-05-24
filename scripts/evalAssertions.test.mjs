import { describe, expect, it } from "vitest";
import {
  assertBannedPhrases,
  assertLengthBudgets,
  assertNoFabricatedSkills,
  assertPreservation,
  assertSchema,
  collectStringValues,
  normaliseForMatch,
  runAssertions,
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
