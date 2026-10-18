import { describe, expect, it } from "vitest";
import { cmcDossierAdapter, parseSseJson } from "../src/merchants/cmcDossier.js";
import { sharepayReportAdapter } from "../src/merchants/sharepayReport.js";
import { stockAnalystAdapter } from "../src/merchants/stockAnalyst.js";
import { DeliveryError, type DeliveryContext } from "../src/merchants/types.js";

function ctx(responses: Array<(url: string, init?: RequestInit) => Response>, seen: Array<{ url: string; init?: RequestInit }>): DeliveryContext & { progress: string[]; sleeps: number[] } {
  let i = 0;
  const progress: string[] = [];
  const sleeps: number[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (!next) throw new Error("no response");
    return next(String(input), init);
  };
  let clock = 1_800_000_000_000;
  return {
    fetchImpl: impl as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    nowMs: () => clock,
    onProgress: (update) => progress.push(update.note),
    progress,
    sleeps,
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("sharepayReportAdapter", () => {
  it("requests the NVDA report and unwraps the report JSON", async () => {
    const adapter = sharepayReportAdapter("https://merchant.example/");
    expect(adapter).toMatchObject({ id: "sharepay-nvda-report", kind: "instant", merchantUrl: "https://merchant.example" });
    expect(adapter.request()).toMatchObject({ url: "https://merchant.example/x402/report?symbol=NVDA", timeoutMs: 90000 });
    const deliverable = await adapter.deliver(json({ report: { symbol: "NVDA", markdown: "# r" }, settlement: {} }), ctx([], []));
    expect(deliverable).toMatchObject({ kind: "report", report: { symbol: "NVDA" } });
    await expect(adapter.deliver(json({ error: "settle_failed" }, 402), ctx([], []))).rejects.toBeInstanceOf(DeliveryError);
  });
});

describe("stockAnalystAdapter", () => {
  it("polls the job with X-Job-Token, resumes a retryable failure once and downloads the markdown", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const c = ctx(
      [
        () => json({ jobId: "x402_abc", status: "running", expiresAt: 1 }), // GET job
        () => json({ jobId: "x402_abc", status: "failed", retryable: true, errorCode: "analysis_timeout", expiresAt: 1 }), // GET job
        () => json({ jobId: "x402_abc", status: "queued", expiresAt: 1 }, 202), // POST resume
        () => json({ jobId: "x402_abc", status: "succeeded", downloadUrl: "https://s3.example/report.md", downloadUrlExpiresAt: 2, expiresAt: 1 }), // GET job
        () => new Response("# NVDA analysis\n\n| a | b |\n|---|---|", { status: 200, headers: { "Content-Type": "text/markdown" } }), // GET downloadUrl
      ],
      seen,
    );
    const adapter = stockAnalystAdapter();
    expect(adapter.request()).toMatchObject({ url: "https://stock-agent.bnbchain.org/x402/analyze/async", timeoutMs: 60000 });
    expect(adapter.request().init.body).toBe('{"symbols":["NVDA"]}');
    const deliverable = await adapter.deliver(json({ jobId: "x402_abc", jobToken: "tok", status: "queued", statusUrl: "/x402/jobs/x402_abc", expiresAt: 1 }, 202), c);
    expect(deliverable).toEqual({ kind: "markdown", title: "NVDA full analysis (BNB Chain stock analyst)", markdown: "# NVDA analysis\n\n| a | b |\n|---|---|" });
    expect(seen.map((s) => s.url)).toEqual([
      "https://stock-agent.bnbchain.org/x402/jobs/x402_abc",
      "https://stock-agent.bnbchain.org/x402/jobs/x402_abc",
      "https://stock-agent.bnbchain.org/x402/jobs/x402_abc/resume",
      "https://stock-agent.bnbchain.org/x402/jobs/x402_abc",
      "https://s3.example/report.md",
    ]);
    expect(new Headers(seen[0]?.init?.headers).get("X-Job-Token")).toBe("tok");
    expect(seen[2]?.init?.method).toBe("POST");
    expect(new Headers(seen[2]?.init?.headers).get("X-Job-Token")).toBe("tok");
    expect(c.sleeps).toEqual([10000]);
    expect(c.progress.length).toBeGreaterThan(0);
  });

  it("fails on a non-retryable job failure and on a missing receipt", async () => {
    const adapter = stockAnalystAdapter();
    const c = ctx([() => json({ jobId: "x402_abc", status: "failed", retryable: false, errorCode: "bad_symbol", expiresAt: 1 })], []);
    await expect(adapter.deliver(json({ jobId: "x402_abc", jobToken: "tok", status: "queued", statusUrl: "/x402/jobs/x402_abc", expiresAt: 1 }, 202), c)).rejects.toThrow("bad_symbol");
    await expect(adapter.deliver(json({ error: "nope" }, 402), ctx([], []))).rejects.toBeInstanceOf(DeliveryError);
  });
});

describe("cmcDossierAdapter", () => {
  it("builds the execute_skill JSON-RPC call", () => {
    const request = cmcDossierAdapter().request();
    expect(request.url).toBe("https://mcp.coinmarketcap.com/x402/mcp");
    expect(request.timeoutMs).toBe(330000);
    expect(JSON.parse(String(request.init.body))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "execute_skill", arguments: { unique_name: "us_equity_research_dossier", parameters: { symbol: "NVDA" } } },
    });
    expect(new Headers(request.init.headers).get("Accept")).toBe("application/json, text/event-stream");
  });

  it("parses the SSE data line and unwraps an ok result", async () => {
    const inner = JSON.stringify({ ok: true, data: { identity: { symbol: "NVDA" } }, executionMeta: { executionTimeMs: "40000" } });
    const body = `event:message\ndata:${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: inner }] } })}\n\n`;
    expect(parseSseJson(body)).toMatchObject({ jsonrpc: "2.0" });
    const deliverable = await cmcDossierAdapter().deliver(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }), ctx([], []));
    expect(deliverable).toEqual({ kind: "json", title: "NVDA research dossier (CoinMarketCap)", data: { identity: { symbol: "NVDA" } } });
  });

  it("joins multi-line SSE data and skips progress/ping events around the response (live 2026-10-11)", async () => {
    const inner = JSON.stringify({ ok: true, data: { identity: { symbol: "NVDA" } } });
    const rpc = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: inner }] } });
    const split = rpc.indexOf(',"result"');
    const progress = JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } });
    const body = `event: message\ndata: ${progress}\n\nevent: message\ndata: ${rpc.slice(0, split)}\ndata: ${rpc.slice(split)}\n\n: keep-alive\nevent: ping\ndata: \n\n`;
    expect(parseSseJson(body)).toMatchObject({ jsonrpc: "2.0", id: 1 });
    const deliverable = await cmcDossierAdapter().deliver(new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }), ctx([], []));
    expect(deliverable).toEqual({ kind: "json", title: "NVDA research dossier (CoinMarketCap)", data: { identity: { symbol: "NVDA" } } });
  });

  it("reads a plain JSON body and puts an excerpt of an unreadable one into the error", async () => {
    const inner = JSON.stringify({ ok: true, data: { x: 1 } });
    const plain = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: inner }] } });
    expect(await cmcDossierAdapter().deliver(new Response(plain, { status: 200 }), ctx([], []))).toMatchObject({ data: { x: 1 } });
    await expect(cmcDossierAdapter().deliver(new Response("<html>gateway timeout</html>", { status: 200 }), ctx([], []))).rejects.toThrow("gateway timeout");
  });

  it("rejects tool errors and non-ok results", async () => {
    const errorBody = `data:${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "SKILL_NOT_FOUND" }] } })}\n`;
    await expect(cmcDossierAdapter().deliver(new Response(errorBody, { status: 200 }), ctx([], []))).rejects.toThrow("SKILL_NOT_FOUND");
    const notOk = `data:${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "timeout" }) }] } })}\n`;
    await expect(cmcDossierAdapter().deliver(new Response(notOk, { status: 200 }), ctx([], []))).rejects.toBeInstanceOf(DeliveryError);
  });
});
