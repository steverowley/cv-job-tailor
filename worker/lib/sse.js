// Minimal server-sent-events plumbing: parse an upstream SSE byte stream and
// format outgoing events. Used by /analyse when the client asks to stream.

export function formatSseEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// Async generator over an SSE ReadableStream: yields { event, data } per
// frame, joining multi-line data fields per the SSE spec. Tolerates frames
// split across arbitrary chunk boundaries.
export async function* parseSseStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseFrame(frame);
        if (parsed) yield parsed;
      }
    }
    const tail = parseSseFrame(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export function parseSseFrame(frame) {
  const dataLines = [];
  let event = "";
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    } else if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}
