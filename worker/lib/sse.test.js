import { describe, expect, it } from "vitest";
import { formatSseEvent, parseSseFrame, parseSseStream } from "./sse.js";

function streamFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(stream) {
  const frames = [];
  for await (const frame of parseSseStream(stream)) {
    frames.push(frame);
  }
  return frames;
}

describe("formatSseEvent", () => {
  it("serialises the payload as a data frame", () => {
    expect(formatSseEvent({ type: "stage", stage: "drafting" })).toBe(
      'data: {"type":"stage","stage":"drafting"}\n\n',
    );
  });
});

describe("parseSseFrame", () => {
  it("returns the event name and joined data lines", () => {
    expect(parseSseFrame("event: delta\ndata: one\ndata: two")).toEqual({
      event: "delta",
      data: "one\ntwo",
    });
  });

  it("tolerates CRLF line endings", () => {
    expect(parseSseFrame("data: hello\r")).toEqual({ event: "", data: "hello" });
  });

  it("returns null for frames without data", () => {
    expect(parseSseFrame("event: ping")).toBeNull();
    expect(parseSseFrame(": comment only")).toBeNull();
    expect(parseSseFrame("")).toBeNull();
  });
});

describe("parseSseStream", () => {
  it("yields one frame per double-newline boundary", async () => {
    const frames = await collect(streamFromChunks(['data: {"a":1}\n\ndata: {"b":2}\n\n']));
    expect(frames).toEqual([
      { event: "", data: '{"a":1}' },
      { event: "", data: '{"b":2}' },
    ]);
  });

  it("reassembles frames split across chunk boundaries", async () => {
    const frames = await collect(
      streamFromChunks(["data: {\"long", '":true}', "\n", "\ndata: done\n\n"]),
    );
    expect(frames).toEqual([
      { event: "", data: '{"long":true}' },
      { event: "", data: "done" },
    ]);
  });

  it("yields a trailing frame that lacks the final boundary", async () => {
    const frames = await collect(streamFromChunks(["data: tail"]));
    expect(frames).toEqual([{ event: "", data: "tail" }]);
  });
});
