import { useEffect, useState } from "react";

export type WorkerStatus = "idle" | "checking" | "configured" | "missing-key" | "unreachable";

const DEFAULT_WORKER_URL = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || "";

export function useWorkerStatus() {
  const [workerUrl, setWorkerUrl] = useState(
    () => sessionStorage.getItem("cv-job-tailor-worker-url") || DEFAULT_WORKER_URL,
  );
  const [isEditingWorkerUrl, setIsEditingWorkerUrl] = useState(() => !DEFAULT_WORKER_URL);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("idle");
  const [workerStatusDetail, setWorkerStatusDetail] = useState("");

  useEffect(() => {
    if (!workerUrl.trim()) {
      // Resetting to idle when the URL is cleared is the intended behaviour;
      // the cascading-render cost is one extra pass on an empty form.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkerStatus("idle");
      setWorkerStatusDetail("");
      return;
    }

    const controller = new AbortController();
    async function checkWorker() {
      try {
        setWorkerStatus("checking");
        setWorkerStatusDetail("");
        const endpoint = `${normalizeWorkerUrl(workerUrl)}/status`;
        const response = await fetch(endpoint, {
          signal: controller.signal,
        });
        const rawText = await response.text();
        const payload = rawText
          ? (JSON.parse(rawText) as { error?: string; hasOpenAiKey?: boolean })
          : {};
        if (!response.ok) {
          setWorkerStatusDetail(
            `Status check reached ${endpoint}, but the Worker returned ${response.status}. ${payload.error || rawText}`,
          );
          setWorkerStatus("unreachable");
          return;
        }
        setWorkerStatusDetail(`Checked ${endpoint}.`);
        setWorkerStatus(payload.hasOpenAiKey ? "configured" : "missing-key");
      } catch (error) {
        if (!controller.signal.aborted) {
          setWorkerStatus("unreachable");
          setWorkerStatusDetail(error instanceof Error ? error.message : "The Worker status check failed.");
        }
      }
    }

    checkWorker();
    return () => controller.abort();
  }, [workerUrl]);

  function saveWorkerUrl(value: string) {
    setWorkerUrl(value);
    if (value.trim()) {
      sessionStorage.setItem("cv-job-tailor-worker-url", value.trim());
    } else {
      sessionStorage.removeItem("cv-job-tailor-worker-url");
    }
  }

  function resetWorkerUrl() {
    sessionStorage.removeItem("cv-job-tailor-worker-url");
    setWorkerUrl(DEFAULT_WORKER_URL);
    setIsEditingWorkerUrl(false);
  }

  const hasConfiguredWorkerUrl = Boolean(DEFAULT_WORKER_URL && workerUrl.trim() === DEFAULT_WORKER_URL);
  const canResetToDefault = Boolean(DEFAULT_WORKER_URL && workerUrl !== DEFAULT_WORKER_URL);

  return {
    workerUrl,
    saveWorkerUrl,
    resetWorkerUrl,
    isEditingWorkerUrl,
    setIsEditingWorkerUrl,
    workerStatus,
    workerStatusDetail,
    hasConfiguredWorkerUrl,
    canResetToDefault,
  };
}

function normalizeWorkerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("No Worker URL is configured.");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function formatWorkerStatus(status: WorkerStatus, detail = ""): string {
  if (status === "checking") {
    return "Checking the configured Worker...";
  }
  if (status === "configured") {
    return "Worker reachable. OpenAI key present. Ready to analyse.";
  }
  if (status === "missing-key") {
    return `Worker reachable, but the OPENAI_API_KEY secret is not configured. ${detail}`.trim();
  }
  if (status === "unreachable") {
    return `The Worker could not be reached from this browser. ${detail}`.trim();
  }
  return "Add the Worker URL to enable analysis, website reading, and brand extraction.";
}
