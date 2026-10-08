import { z } from "zod";
import type { TelemetrySink } from "../devex.js";
import { encodeQuery, signPayload, type HttpMethod } from "./sign.js";

export const DEFAULT_BASE_URL = "https://web3.binance.com";
const BUILD_PREFIX = "/build";

export class BinanceApiError extends Error {
  readonly path: string;
  readonly httpStatus: number;
  readonly code: number | null;
  readonly apiMsg: string;

  constructor(path: string, httpStatus: number, code: number | null, apiMsg: string) {
    super(`Binance API ${path} failed: ${code ?? `http ${httpStatus}`} ${apiMsg}`);
    this.name = "BinanceApiError";
    this.path = path;
    this.httpStatus = httpStatus;
    this.code = code;
    this.apiMsg = apiMsg;
  }
}

export interface BinanceClientOptions {
  credentials: { apiKey: string; secretKey: string };
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  minIntervalMs?: number;
  telemetry?: TelemetrySink;
}

export interface BinanceClient {
  get<T>(path: string, query: Record<string, string | undefined>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T>;
  post<T>(path: string, body: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T>;
}

const EnvelopeSchema = z
  .object({
    code: z.union([z.number(), z.string()]).nullable().optional(),
    msg: z.string().nullable().optional(),
    data: z.unknown(),
  })
  .passthrough();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createBinanceClient(options: BinanceClientOptions): BinanceClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 15_000;
  const minIntervalMs = options.minIntervalMs ?? 250;
  const telemetry: TelemetrySink = options.telemetry ?? (() => undefined);
  const lastStart = new Map<string, number>();

  async function pace(path: string): Promise<void> {
    const previous = lastStart.get(path);
    if (previous !== undefined) {
      const wait = previous + minIntervalMs - now().getTime();
      if (wait > 0) await sleep(wait);
    }
    lastStart.set(path, now().getTime());
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    query: Record<string, string | undefined>,
    body: unknown,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    const qs = encodeQuery(query);
    const requestPath = `${BUILD_PREFIX}${path}${qs ? `?${qs}` : ""}`;
    const bodyText = method === "POST" ? JSON.stringify(body ?? {}) : "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await pace(path);
      const timestamp = now().toISOString();
      const headers: Record<string, string> = {
        "X-OC-APIKEY": options.credentials.apiKey,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signPayload({ timestamp, method, requestPath, body: bodyText, secretKey: options.credentials.secretKey }),
        "X-OC-RECV-WINDOW": "10000",
        Accept: "application/json",
      };
      if (method === "POST") headers["Content-Type"] = "application/json";
      const started = Date.now();
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${requestPath}`, {
          method,
          headers,
          body: method === "POST" ? bodyText : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        telemetry({ at: timestamp, method, path, httpStatus: 0, code: null, msg: errorMessage(error), latencyMs: Date.now() - started });
        throw new BinanceApiError(path, 0, null, errorMessage(error));
      }
      const latencyMs = Date.now() - started;
      if (response.status === 429 && attempt === 0) {
        telemetry({ at: timestamp, method, path, httpStatus: 429, code: null, msg: "rate limited", latencyMs });
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) : 1;
        await sleep(seconds * 1000);
        continue;
      }
      const text = await response.text();
      let parsedJson: unknown = null;
      try {
        parsedJson = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        parsedJson = null;
      }
      const envelope = EnvelopeSchema.safeParse(parsedJson);
      if (!envelope.success) {
        telemetry({ at: timestamp, method, path, httpStatus: response.status, code: null, msg: `non-envelope body: ${text.slice(0, 200)}`, latencyMs });
        throw new BinanceApiError(path, response.status, null, `unexpected response body: ${text.slice(0, 200)}`);
      }
      const rawCode = envelope.data.code;
      const code = rawCode === null || rawCode === undefined ? null : Number(rawCode);
      const msg = envelope.data.msg ?? "";
      telemetry({ at: timestamp, method, path, httpStatus: response.status, code, msg, latencyMs });
      const ok = response.ok && (code === 0 || code === null);
      if (!ok) {
        throw new BinanceApiError(path, response.status, code, msg);
      }
      const data = schema.safeParse(envelope.data.data);
      if (!data.success) {
        throw new BinanceApiError(path, response.status, code, `schema mismatch: ${data.error.message.slice(0, 300)}`);
      }
      return data.data;
    }
    throw new BinanceApiError(path, 429, null, "rate limited after retry");
  }

  return {
    get: (path, query, schema) => request("GET", path, query, undefined, schema),
    post: (path, body, schema) => request("POST", path, {}, body, schema),
  };
}
