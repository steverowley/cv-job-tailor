import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { App } from "./App";

// React requires this flag for act() outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    sessionStorage.clear();
  });

  it("renders the composed page: all four input panels, the action, and the output tabs", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container!);
      root.render(<App />);
    });

    const text = container.textContent || "";
    expect(text).toContain("Cloudflare Worker");
    expect(text).toContain("Job description");
    expect(text).toContain("Upload CV");
    expect(text).toContain("Employer brand");
    expect(text).toContain("Analyse and tailor CV");
    expect(text).toContain("Review");
    expect(text).toContain("Download branded PDF");

    // The analyse button must start disabled: no worker, job, or CV yet.
    const analyse = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Analyse and tailor CV"),
    );
    expect(analyse?.disabled).toBe(true);
  });
});
