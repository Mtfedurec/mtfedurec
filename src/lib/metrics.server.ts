import {
  DB_BUCKETS,
  HTTP_BUCKETS,
  METRIC_NAMES,
  normalizePath,
  percentile,
  type MetricSample,
  type PerformanceSummary,
  type SeriesRow,
} from "./metrics-shared";

type MetricRow = {
  kind: "http" | "db";
  method: string | null;
  path: string | null;
  status_code: number | null;
  model: string | null;
  action: string | null;
  duration_ms: number;
  created_at: string;
};

const MAX_ROWS = 20000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Persist a batch of samples. Never throws — monitoring must not break the app. */
export async function recordSamples(samples: MetricSample[]): Promise<void> {
  if (samples.length === 0) return;
  try {
    const db = await admin();
    const payload = samples.slice(0, 500).map((s) =>
      s.kind === "http"
        ? {
            kind: "http",
            method: s.method.slice(0, 10).toUpperCase(),
            path: normalizePath(s.path),
            status_code: s.status_code,
            duration_ms: Math.max(0, Math.round(s.duration_ms * 1000) / 1000),
          }
        : {
            kind: "db",
            model: s.model.slice(0, 60),
            action: s.action.slice(0, 30),
            duration_ms: Math.max(0, Math.round(s.duration_ms * 1000) / 1000),
          },
    );
    await db.from("perf_metrics").insert(payload);
  } catch (error) {
    console.error("[metrics] failed to record samples", error);
  }
}

async function loadRows(sinceIso: string): Promise<MetricRow[]> {
  const db = await admin();
  const { data, error } = await db
    .from("perf_metrics")
    .select("kind, method, path, status_code, model, action, duration_ms, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw error;
  return (data ?? []) as MetricRow[];
}

function summarize(label: string, durations: number[], errors: number): SeriesRow {
  const sorted = [...durations].sort((a, b) => a - b);
  const total = sorted.reduce((sum, d) => sum + d, 0);
  return {
    key: label,
    count: sorted.length,
    errors,
    avgMs: sorted.length ? Math.round((total / sorted.length) * 100) / 100 : 0,
    p95Ms: Math.round(percentile(sorted, 0.95) * 100) / 100,
  };
}

export async function buildSummary(windowMinutes = 60): Promise<PerformanceSummary> {
  const minutes = Math.min(24 * 60, Math.max(5, windowMinutes));
  const since = new Date(Date.now() - minutes * 60_000);
  const rows = await loadRows(since.toISOString());

  const http = rows.filter((r) => r.kind === "http");
  const db = rows.filter((r) => r.kind === "db");

  const httpByRoute = new Map<string, { durations: number[]; errors: number }>();
  for (const r of http) {
    const key = `${r.method ?? "GET"} ${r.path ?? "/"}`;
    const entry = httpByRoute.get(key) ?? { durations: [], errors: 0 };
    entry.durations.push(Number(r.duration_ms));
    if ((r.status_code ?? 200) >= 500) entry.errors += 1;
    httpByRoute.set(key, entry);
  }

  const dbByModel = new Map<string, number[]>();
  for (const r of db) {
    const key = `${r.model ?? "raw"}.${r.action ?? "query"}`;
    const list = dbByModel.get(key) ?? [];
    list.push(Number(r.duration_ms));
    dbByModel.set(key, list);
  }

  const bucketMs = Math.max(60_000, Math.round((minutes * 60_000) / 30));
  const timeline = new Map<number, { durations: number[]; errors: number }>();
  for (const r of http) {
    const slot = Math.floor(new Date(r.created_at).getTime() / bucketMs) * bucketMs;
    const entry = timeline.get(slot) ?? { durations: [], errors: 0 };
    entry.durations.push(Number(r.duration_ms));
    if ((r.status_code ?? 200) >= 500) entry.errors += 1;
    timeline.set(slot, entry);
  }

  const httpDurations = http.map((r) => Number(r.duration_ms));
  const dbDurations = db.map((r) => Number(r.duration_ms));
  const httpErrors = http.filter((r) => (r.status_code ?? 200) >= 500).length;
  const overallHttp = summarize("all", httpDurations, httpErrors);
  const overallDb = summarize("all", dbDurations, 0);
  const seconds = minutes * 60;

  return {
    windowMinutes: minutes,
    http: {
      total: http.length,
      rps: Math.round((http.length / seconds) * 1000) / 1000,
      errorRatePct: http.length ? Math.round((httpErrors / http.length) * 10000) / 100 : 0,
      avgMs: overallHttp.avgMs,
      p95Ms: overallHttp.p95Ms,
      byRoute: [...httpByRoute.entries()]
        .map(([key, v]) => summarize(key, v.durations, v.errors))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
      timeline: [...timeline.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([slot, v]) => {
          const row = summarize("", v.durations, v.errors);
          return {
            bucket: new Date(slot).toISOString(),
            count: row.count,
            p95Ms: row.p95Ms,
            errors: v.errors,
          };
        }),
    },
    db: {
      total: db.length,
      qps: Math.round((db.length / seconds) * 1000) / 1000,
      avgMs: overallDb.avgMs,
      p95Ms: overallDb.p95Ms,
      byModel: [...dbByModel.entries()]
        .map(([key, durations]) => summarize(key, durations, 0))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    },
  };
}

function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function histogramLines(
  name: string,
  buckets: readonly number[],
  groups: Map<string, { labels: Record<string, string>; durationsSec: number[] }>,
): string[] {
  const lines: string[] = [];
  for (const { labels, durationsSec } of groups.values()) {
    const base = Object.entries(labels)
      .map(([k, v]) => `${k}="${esc(v)}"`)
      .join(",");
    let cumulative = 0;
    for (const bucket of buckets) {
      cumulative = durationsSec.filter((d) => d <= bucket).length;
      lines.push(`${name}_bucket{${base},le="${bucket}"} ${cumulative}`);
    }
    lines.push(`${name}_bucket{${base},le="+Inf"} ${durationsSec.length}`);
    lines.push(
      `${name}_sum{${base}} ${durationsSec.reduce((s, d) => s + d, 0).toFixed(6)}`,
    );
    lines.push(`${name}_count{${base}} ${durationsSec.length}`);
  }
  return lines;
}

/** Prometheus text exposition of every retained sample (7-day retention window). */
export async function renderPrometheus(): Promise<string> {
  const rows = await loadRows(new Date(Date.now() - 7 * 24 * 3600_000).toISOString());
  const out: string[] = [];

  const counter = new Map<string, { labels: Record<string, string>; count: number }>();
  const httpHist = new Map<string, { labels: Record<string, string>; durationsSec: number[] }>();
  const dbHist = new Map<string, { labels: Record<string, string>; durationsSec: number[] }>();

  for (const r of rows) {
    const seconds = Number(r.duration_ms) / 1000;
    if (r.kind === "http") {
      const labels = {
        method: r.method ?? "GET",
        path: r.path ?? "/",
        status_code: String(r.status_code ?? 200),
      };
      const key = `${labels.method}|${labels.path}|${labels.status_code}`;
      const c = counter.get(key) ?? { labels, count: 0 };
      c.count += 1;
      counter.set(key, c);
      const h = httpHist.get(key) ?? { labels, durationsSec: [] };
      h.durationsSec.push(seconds);
      httpHist.set(key, h);
    } else {
      const labels = { model: r.model ?? "raw", action: r.action ?? "query" };
      const key = `${labels.model}|${labels.action}`;
      const h = dbHist.get(key) ?? { labels, durationsSec: [] };
      h.durationsSec.push(seconds);
      dbHist.set(key, h);
    }
  }

  out.push(`# HELP ${METRIC_NAMES.httpRequestsTotal} Total number of HTTP requests processed`);
  out.push(`# TYPE ${METRIC_NAMES.httpRequestsTotal} counter`);
  for (const { labels, count } of counter.values()) {
    const base = Object.entries(labels)
      .map(([k, v]) => `${k}="${esc(v)}"`)
      .join(",");
    out.push(`${METRIC_NAMES.httpRequestsTotal}{${base}} ${count}`);
  }

  out.push(`# HELP ${METRIC_NAMES.httpRequestDuration} HTTP request duration in seconds`);
  out.push(`# TYPE ${METRIC_NAMES.httpRequestDuration} histogram`);
  out.push(...histogramLines(METRIC_NAMES.httpRequestDuration, HTTP_BUCKETS, httpHist));

  out.push(`# HELP ${METRIC_NAMES.dbQueryDuration} Database query execution time in seconds`);
  out.push(`# TYPE ${METRIC_NAMES.dbQueryDuration} histogram`);
  out.push(...histogramLines(METRIC_NAMES.dbQueryDuration, DB_BUCKETS, dbHist));

  return `${out.join("\n")}\n`;
}

export async function pruneOldMetrics(): Promise<void> {
  try {
    const db = await admin();
    await db.rpc("prune_perf_metrics");
  } catch (error) {
    console.error("[metrics] prune failed", error);
  }
}