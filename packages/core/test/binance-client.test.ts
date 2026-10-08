import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { encodeQuery, signPayload } from "../src/binance/sign.js";
import { BinanceApiError, createBinanceClient } from "../src/binance/client.js";
import { listOf, numberish, stringish } from "../src/binance/listOf.js";
import {
  createJsonlSink,
  parseJsonl,
  summarizeEvents,
  type ApiCallEvent,
} from "../src/devex.js";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>, calls: Call[]): typeof fetch {
  let index = 0;
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (!next) throw new Error("no fake response");
    return new Response(JSON.stringify(next.body), { status: next.status, headers: next.headers });
  };
  return impl as typeof fetch;
}

const fixedNow = () => new Date("2026-05-11T10:08:57.715Z");

describe("signPayload", () => {
  it("matches the documented HMAC-SHA256 base64 construction (vector cross-checked with openssl)", () => {
    expect(
      signPayload({
        timestamp: "2026-05-11T10:08:57.715Z",
        method: "GET",
        requestPath: "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT",
        body: "",
        secretKey: "test-secret",
      }),
    ).toBe("+e4H3erFq96IQ1yTqE+vjaHHmLdSy+rOmPqIo2kR5OA=");
    expect(
      signPayload({
        timestamp: "2026-10-06T12:00:00.000Z",
        method: "POST",
        requestPath: "/build/api/v1/dex/pre-transaction/simulate",
        body: '{"binanceChainId":"56"}',
        secretKey: "test-secret",
      }),
    ).toBe("wwMYnz5cH5m0fHAO5oyvDTXk8x1LoxzqOvFNJVF/eTk=");
  });

  it("encodes queries in insertion order, skipping undefined, keeping commas", () => {
    expect(encodeQuery({ a: "1", b: undefined, c: "x y", d: "0xa,0xb" })).toBe("a=1&c=x%20y&d=0xa,0xb");
    expect(encodeQuery({})).toBe("");
  });
});

describe("createBinanceClient", () => {
  it("signs GET requests with the /build prefix and the exact query string", async () => {
    const calls: Call[] = [];
    const events: ApiCallEvent[] = [];
    const client = createBinanceClient({
      credentials: { apiKey: "key-1", secretKey: "test-secret" },
      fetchImpl: fakeFetch([{ status: 200, body: { code: 0, msg: "success", data: { n: 1 } } }], calls),
      now: fixedNow,
      telemetry: (e) => events.push(e),
    });
    const data = await client.get("/api/v1/dex/market/rwa/tokens", { binanceChainId: "56", platformId: undefined }, z.object({ n: z.number() }));
    expect(data).toEqual({ n: 1 });
    expect(calls[0]?.url).toBe("https://web3.binance.com/build/api/v1/dex/market/rwa/tokens?binanceChainId=56");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["X-OC-APIKEY"]).toBe("key-1");
    expect(headers["X-OC-TIMESTAMP"]).toBe("2026-05-11T10:08:57.715Z");
    expect(headers["X-OC-SIGN"]).toBe(
      signPayload({
        timestamp: "2026-05-11T10:08:57.715Z",
        method: "GET",
        requestPath: "/build/api/v1/dex/market/rwa/tokens?binanceChainId=56",
        body: "",
        secretKey: "test-secret",
      }),
    );
    expect(events[0]).toMatchObject({ method: "GET", path: "/api/v1/dex/market/rwa/tokens", httpStatus: 200, code: 0, msg: "success" });
  });

  it("signs POST bodies exactly as sent", async () => {
    const calls: Call[] = [];
    const client = createBinanceClient({
      credentials: { apiKey: "k", secretKey: "test-secret" },
      fetchImpl: fakeFetch([{ status: 200, body: { code: 0, msg: "", data: { ok: true } } }], calls),
      now: fixedNow,
    });
    await client.post("/api/v1/dex/pre-transaction/simulate", { binanceChainId: "56" }, z.object({ ok: z.boolean() }));
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"binanceChainId":"56"}');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-OC-SIGN"]).toBe(
      signPayload({
        timestamp: "2026-05-11T10:08:57.715Z",
        method: "POST",
        requestPath: "/build/api/v1/dex/pre-transaction/simulate",
        body: '{"binanceChainId":"56"}',
        secretKey: "test-secret",
      }),
    );
  });

  it("throws BinanceApiError with the API code and message on a non-zero code", async () => {
    const events: ApiCallEvent[] = [];
    const client = createBinanceClient({
      credentials: { apiKey: "k", secretKey: "s" },
      fetchImpl: fakeFetch([{ status: 200, body: { code: 40304, msg: "Service not available due to compliance restriction", data: null } }], []),
      now: fixedNow,
      telemetry: (e) => events.push(e),
    });
    const error = await client.get("/api/v1/dex/market/rwa/tokens", {}, z.unknown()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BinanceApiError);
    expect(error).toMatchObject({ code: 40304, apiMsg: "Service not available due to compliance restriction", httpStatus: 200 });
    expect(events[0]?.code).toBe(40304);
  });

  it("retries once after HTTP 429 honouring Retry-After (capped at 5 s)", async () => {
    const calls: Call[] = [];
    const sleeps: number[] = [];
    const client = createBinanceClient({
      credentials: { apiKey: "k", secretKey: "s" },
      fetchImpl: fakeFetch(
        [
          { status: 429, body: { code: 42900, msg: "rate limit" }, headers: { "Retry-After": "2" } },
          { status: 200, body: { code: 0, msg: "", data: [1, 2] } },
        ],
        calls,
      ),
      now: fixedNow,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      minIntervalMs: 0,
    });
    const data = await client.get("/api/v1/x", {}, z.array(z.number()));
    expect(data).toEqual([1, 2]);
    expect(calls).toHaveLength(2);
    expect(sleeps).toContain(2000);
  });

  it("paces consecutive calls to the same endpoint", async () => {
    const sleeps: number[] = [];
    const client = createBinanceClient({
      credentials: { apiKey: "k", secretKey: "s" },
      fetchImpl: fakeFetch([{ status: 200, body: { code: 0, msg: "", data: 1 } }], []),
      now: fixedNow,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      minIntervalMs: 250,
    });
    await client.get("/api/v1/y", {}, z.number());
    await client.get("/api/v1/y", {}, z.number());
    expect(sleeps).toEqual([250]);
  });

  it("rejects data that does not match the schema", async () => {
    const client = createBinanceClient({
      credentials: { apiKey: "k", secretKey: "s" },
      fetchImpl: fakeFetch([{ status: 200, body: { code: 0, msg: "", data: { n: "x" } } }], []),
      now: fixedNow,
    });
    await expect(client.get("/api/v1/z", {}, z.object({ n: z.number() }))).rejects.toThrow("schema mismatch");
  });
});

describe("listOf / stringish / numberish", () => {
  it("accepts a bare array or a wrapped list", () => {
    const schema = listOf(z.object({ a: z.number() }));
    expect(schema.parse([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(schema.parse({ list: [{ a: 2 }] })).toEqual([{ a: 2 }]);
    expect(schema.parse({ routes: [{ a: 3 }] })).toEqual([{ a: 3 }]);
  });

  it("normalizes strings and numbers", () => {
    expect(stringish.parse(12)).toBe("12");
    expect(stringish.parse(null)).toBeNull();
    expect(numberish.parse("1789012513889")).toBe(1789012513889);
    expect(numberish.parse(undefined)).toBeNull();
  });
});

describe("devex telemetry", () => {
  it("appends JSONL events and summarizes per endpoint", () => {
    const dir = mkdtempSync(join(tmpdir(), "devex-"));
    const file = join(dir, "sub", "events.jsonl");
    const sink = createJsonlSink(file);
    sink({ at: "t1", method: "GET", path: "/a", httpStatus: 200, code: 0, msg: "", latencyMs: 100 });
    sink({ at: "t2", method: "GET", path: "/a", httpStatus: 200, code: 40369, msg: "BSTOCK_INVALID_TRADING_TIME", latencyMs: 300 });
    sink({ at: "t3", method: "POST", path: "/b", httpStatus: 429, code: null, msg: "rate limited", latencyMs: 50 });
    const events = parseJsonl(readFileSync(file, "utf8"));
    expect(events).toHaveLength(3);
    const summary = summarizeEvents(events);
    expect(summary).toEqual([
      { path: "/a", calls: 2, errors: 1, p50Ms: 100, p95Ms: 300, codes: [{ code: "0", count: 1, msg: "" }, { code: "40369", count: 1, msg: "BSTOCK_INVALID_TRADING_TIME" }] },
      { path: "/b", calls: 1, errors: 1, p50Ms: 50, p95Ms: 50, codes: [{ code: "http 429", count: 1, msg: "rate limited" }] },
    ]);
  });
});
