import { describe, expect, it } from "vitest";
import { createAnalysisStreamMapper } from "./analyse.js";

describe("createAnalysisStreamMapper", () => {
  it("emits stage markers for created, reasoning, and first output delta", () => {
    const map = createAnalysisStreamMapper();
    expect(map({ type: "response.created" })).toEqual([{ type: "stage", stage: "accepted" }]);
    expect(map({ type: "response.output_item.added", item: { type: "reasoning" } })).toEqual([
      { type: "stage", stage: "reasoning" },
    ]);
    // Only the first reasoning item produces a stage event.
    expect(map({ type: "response.output_item.added", item: { type: "reasoning" } })).toEqual([]);
    expect(map({ type: "response.output_text.delta", delta: "{" })).toEqual([
      { type: "stage", stage: "drafting" },
    ]);
    expect(map({ type: "response.output_text.delta", delta: "x" })).toEqual([]);
  });

  it("reports progress every ~2KB of accumulated output", () => {
    const map = createAnalysisStreamMapper();
    map({ type: "response.output_text.delta", delta: "x".repeat(1500) });
    const events = map({ type: "response.output_text.delta", delta: "y".repeat(600) });
    expect(events).toEqual([{ type: "progress", chars: 2100 }]);
    // Not again until another 2KB accumulates.
    expect(map({ type: "response.output_text.delta", delta: "z".repeat(100) })).toEqual([]);
  });

  it("completes with the parsed accumulated JSON", () => {
    const map = createAnalysisStreamMapper();
    map({ type: "response.output_text.delta", delta: '{"jobTitle":' });
    map({ type: "response.output_text.delta", delta: '"Designer"}' });
    expect(map({ type: "response.completed", response: {} })).toEqual([
      { type: "complete", analysis: { jobTitle: "Designer" } },
    ]);
  });

  it("falls back to the completed response payload when no deltas arrived", () => {
    const map = createAnalysisStreamMapper();
    const response = { output_text: '{"jobTitle":"PM"}' };
    expect(map({ type: "response.completed", response })).toEqual([
      { type: "complete", analysis: { jobTitle: "PM" } },
    ]);
  });

  it("errors when the completed payload has no parseable analysis", () => {
    const map = createAnalysisStreamMapper();
    map({ type: "response.output_text.delta", delta: "not json" });
    expect(map({ type: "response.completed", response: {} })).toEqual([
      { type: "error", error: "OpenAI returned no structured analysis." },
    ]);
  });

  it("maps failure events to error events", () => {
    const map = createAnalysisStreamMapper();
    expect(map({ type: "response.failed", response: { error: { message: "quota" } } })).toEqual([
      { type: "error", error: "quota" },
    ]);
    expect(map({ type: "error", message: "boom" })).toEqual([{ type: "error", error: "boom" }]);
  });

  it("ignores unrelated event types", () => {
    const map = createAnalysisStreamMapper();
    expect(map({ type: "response.in_progress" })).toEqual([]);
    expect(map({ type: "response.output_item.done" })).toEqual([]);
    expect(map(null)).toEqual([]);
  });
});
