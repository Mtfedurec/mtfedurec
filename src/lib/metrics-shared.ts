/** Metric names & buckets shared by the collector, the Prometheus endpoint and the dashboard. */
export const HTTP_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;
export const DB_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] as const;

export const METRIC_NAMES = {
  httpRequestsTotal: "http_requests_total",
  httpRequestDuration: "http_request_duration_seconds",
  dbQueryDuration: "prisma_query_duration_seconds",
} as const;

export type HttpMetricSample = {
  kind: "http";
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
};

export type DbMetricSample = {
  kind: "db";
  model: string;
  action: string;
  duration_ms: number;
};

export type MetricSample = HttpMetricSample | DbMetricSample;

export type SeriesRow = {
  key: string;
  count: number;
  errors: number;
  avgMs: number;
  p95Ms: number;
};

export type PerformanceSummary = {
  windowMinutes: number;
  http: {
    total: number;
    rps: number;
    errorRatePct: number;
    avgMs: number;
    p95Ms: number;
    byRoute: SeriesRow[];
    timeline: { bucket: string; count: number; p95Ms: number; errors: number }[];
  };
  db: {
    total: number;
    qps: number;
    avgMs: number;
    p95Ms: number;
    byModel: SeriesRow[];
  };
};

/** Collapse dynamic segments so label cardinality stays bounded. */
export function normalizePath(rawPath: string): string {
  const path = rawPath.split("?")[0] ?? "/";
  return (
    path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
      .replace(/\/\d+(?=\/|$)/g, "/:n")
      .slice(0, 120) || "/"
  );
}

export function percentile(sortedMs: number[], q: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.ceil(q * sortedMs.length) - 1);
  return sortedMs[Math.max(0, idx)] ?? 0;
}