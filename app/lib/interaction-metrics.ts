type MetricName = "tap_to_strip" | "tap_to_speech_dispatch" | "tap_to_speech_start";

type MetricSample = {
  name: MetricName;
  milliseconds: number;
  recorded_at: number;
};

declare global {
  interface Window {
    __mynahMetrics?: MetricSample[];
  }
}

export function interactionNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function recordInteractionMetric(name: MetricName, startedAt: number) {
  if (typeof window === "undefined") return;

  const sample: MetricSample = {
    name,
    milliseconds: Math.max(0, interactionNow() - startedAt),
    recorded_at: Date.now(),
  };
  const current = window.__mynahMetrics ?? [];
  window.__mynahMetrics = [...current.slice(-49), sample];
  document.documentElement.setAttribute(
    `data-mynah-${name.replaceAll("_", "-")}-ms`,
    sample.milliseconds.toFixed(2),
  );
}
