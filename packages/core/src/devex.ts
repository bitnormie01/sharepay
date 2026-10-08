import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ApiCallEvent {
  at: string;
  method: string;
  path: string;
  httpStatus: number;
  code: number | null;
  msg: string | null;
  latencyMs: number;
}

export type TelemetrySink = (event: ApiCallEvent) => void;

export interface EndpointSummary {
  path: string;
  calls: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  codes: Array<{ code: string; count: number; msg: string }>;
}

export function createJsonlSink(filePath: string): TelemetrySink {
  mkdirSync(dirname(filePath), { recursive: true });
  return (event) => {
    try {
      appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
    } catch {
      // Telemetry must never break a payment.
    }
  };
}

export function parseJsonl(text: string): ApiCallEvent[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ApiCallEvent);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index] ?? 0;
}

export function summarizeEvents(events: ApiCallEvent[]): EndpointSummary[] {
  const byPath = new Map<string, ApiCallEvent[]>();
  for (const event of events) {
    const list = byPath.get(event.path) ?? [];
    list.push(event);
    byPath.set(event.path, list);
  }
  return [...byPath.keys()].sort().map((path) => {
    const list = byPath.get(path) ?? [];
    const latencies = list.map((e) => e.latencyMs).sort((a, b) => a - b);
    const codes = new Map<string, { code: string; count: number; msg: string }>();
    let errors = 0;
    for (const e of list) {
      const isError = e.httpStatus >= 400 || e.httpStatus === 0 || (e.code !== null && e.code !== 0);
      if (isError) errors += 1;
      const key = e.code !== null ? String(e.code) : `http ${e.httpStatus}`;
      const entry = codes.get(key) ?? { code: key, count: 0, msg: e.msg ?? "" };
      entry.count += 1;
      codes.set(key, entry);
    }
    return {
      path,
      calls: list.length,
      errors,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      codes: [...codes.values()],
    };
  });
}
