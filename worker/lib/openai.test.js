import { describe, expect, it } from "vitest";
import { extractOpenAIError, extractOpenAIStructuredAnalysis } from "./openai.js";

describe("extractOpenAIStructuredAnalysis", () => {
  it("returns null for falsy or empty inputs", () => {
    expect(extractOpenAIStructuredAnalysis(null)).toBeNull();
    expect(extractOpenAIStructuredAnalysis(undefined)).toBeNull();
    expect(extractOpenAIStructuredAnalysis({})).toBeNull();
  });

  it("parses the top-level output_text shortcut", () => {
    const payload = { output_text: JSON.stringify({ hello: "world" }) };
    expect(extractOpenAIStructuredAnalysis(payload)).toEqual({ hello: "world" });
  });

  it("falls through to per-block extraction when output_text is unparseable", () => {
    const payload = {
      output_text: "not json {{",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify({ a: 1 }) }] },
      ],
    };
    expect(extractOpenAIStructuredAnalysis(payload)).toEqual({ a: 1 });
  });

  it("accepts both output_text and text block types", () => {
    const outputText = {
      output: [{ content: [{ type: "output_text", text: '{"a":1}' }] }],
    };
    const text = {
      output: [{ content: [{ type: "text", text: '{"b":2}' }] }],
    };
    expect(extractOpenAIStructuredAnalysis(outputText)).toEqual({ a: 1 });
    expect(extractOpenAIStructuredAnalysis(text)).toEqual({ b: 2 });
  });

  it("skips blocks with unparseable JSON and continues searching", () => {
    const payload = {
      output: [
        { content: [{ type: "output_text", text: "garbage" }] },
        { content: [{ type: "output_text", text: '{"found":true}' }] },
      ],
    };
    expect(extractOpenAIStructuredAnalysis(payload)).toEqual({ found: true });
  });

  it("returns null when no parseable block is found", () => {
    const payload = {
      output: [
        { content: [{ type: "output_text", text: "garbage" }] },
        { content: [{ type: "image", url: "..." }] },
      ],
    };
    expect(extractOpenAIStructuredAnalysis(payload)).toBeNull();
  });

  it("ignores output that is not an array", () => {
    expect(extractOpenAIStructuredAnalysis({ output: "not-an-array" })).toBeNull();
  });
});

describe("extractOpenAIError", () => {
  it("returns the message from a JSON error envelope", () => {
    const body = JSON.stringify({ error: { message: "Rate limited" } });
    expect(extractOpenAIError(body)).toBe("Rate limited");
  });

  it("returns the first 500 chars of non-JSON bodies", () => {
    const body = "x".repeat(800);
    expect(extractOpenAIError(body)).toBe("x".repeat(500));
  });

  it("returns empty string when the body is missing or empty", () => {
    expect(extractOpenAIError("")).toBe("");
    // @ts-expect-error — intentional null
    expect(extractOpenAIError(null)).toBe("");
  });

  it("returns empty string when JSON has no error.message", () => {
    expect(extractOpenAIError(JSON.stringify({ status: "ok" }))).toBe("");
  });
});
