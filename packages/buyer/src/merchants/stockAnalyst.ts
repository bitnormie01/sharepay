import { DeliveryError, type DeliveryContext, type MerchantAdapter } from "./types.js";

interface JobStatus {
  status?: string;
  retryable?: boolean;
  errorCode?: string;
  downloadUrl?: string;
}

const POLL_MS = 10_000;
const DEADLINE_MS = 10 * 60 * 1000;

export function stockAnalystAdapter(baseUrl = "https://stock-agent.bnbchain.org"): MerchantAdapter {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    id: "bnb-stock-analyst-nvda",
    title: "NVDA full analysis",
    merchantName: "BNB Chain stock analyst (Agent Studio)",
    merchantUrl: base,
    description: "BNB Chain's own Agent Studio stock analyst writes a full NVDA analysis; payment settles through Binance's B402 facilitator.",
    deliveryHint: "Arrives in about 2–5 min",
    kind: "async",
    etaSec: 240,
    request: () => ({
      url: `${base}/x402/analyze/async`,
      init: { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ symbols: ["NVDA"] }) },
      timeoutMs: 60_000,
    }),
    async deliver(response: Response, ctx: DeliveryContext) {
      const receipt = (await response.json().catch(() => ({}))) as { jobId?: string; jobToken?: string; error?: string };
      if ((response.status !== 202 && response.status !== 200) || !receipt.jobId || !receipt.jobToken) {
        throw new DeliveryError("merchant_error", `stock analyst answered HTTP ${response.status}: ${receipt.error ?? "no job receipt"}`);
      }
      const headers = { Accept: "application/json", "X-Job-Token": receipt.jobToken };
      const jobUrl = `${base}/x402/jobs/${receipt.jobId}`;
      const startedAt = ctx.nowMs();
      const jobStartedAt = new Date(startedAt).toISOString();
      let resumed = false;
      for (;;) {
        const res = await ctx.fetchImpl(jobUrl, { method: "GET", headers, signal: AbortSignal.timeout(30_000) });
        const job = (await res.json().catch(() => ({}))) as JobStatus;
        const polledAt = new Date(ctx.nowMs()).toISOString();
        const elapsedSec = Math.round((ctx.nowMs() - startedAt) / 1000);
        ctx.onProgress({ etaSec: Math.max(240 - elapsedSec, 0), jobStartedAt, lastPolledAt: polledAt, note: `Report generating (${job.status ?? "unknown"})` });
        if (job.status === "succeeded" && job.downloadUrl) {
          const download = await ctx.fetchImpl(job.downloadUrl, { method: "GET", headers: { Accept: "text/markdown, text/plain;q=0.9" }, signal: AbortSignal.timeout(60_000) });
          if (!download.ok) throw new DeliveryError("download_failed", `report download failed with HTTP ${download.status}`);
          return { kind: "markdown", title: "NVDA full analysis (BNB Chain stock analyst)", markdown: await download.text() };
        }
        if (job.status === "failed") {
          if (job.retryable === true && !resumed) {
            resumed = true;
            await ctx.fetchImpl(`${jobUrl}/resume`, { method: "POST", headers, signal: AbortSignal.timeout(30_000) });
          } else {
            throw new DeliveryError("analysis_failed", `stock analyst job failed: ${job.errorCode ?? "unknown error"}`);
          }
        } else {
          if (ctx.nowMs() - startedAt > DEADLINE_MS) throw new DeliveryError("analysis_timeout", "stock analyst did not finish within 10 minutes");
          const retryAfter = Number(res.headers.get("Retry-After") ?? "0");
          await ctx.sleep(Number.isFinite(retryAfter) && retryAfter * 1000 > POLL_MS ? retryAfter * 1000 : POLL_MS);
        }
      }
    },
  };
}
