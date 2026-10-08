import type { ResearchReportDto } from "@sharepay/core/dto";
import { DeliveryError, type MerchantAdapter } from "./types.js";

export function sharepayReportAdapter(merchantUrl: string): MerchantAdapter {
  const base = merchantUrl.replace(/\/+$/, "");
  return {
    id: "sharepay-nvda-report",
    title: "NVDA research report",
    merchantName: "SharePay merchant agent (BNB Agent Studio)",
    merchantUrl: base,
    description: "Company profile, market data and a cross-issuer comparison of NVIDIA's tokenized versions on BSC, built deterministically from the Binance RWA Data API.",
    deliveryHint: "Instant",
    kind: "instant",
    etaSec: null,
    request: () => ({ url: `${base}/x402/report?symbol=NVDA`, init: { method: "GET", headers: { Accept: "application/json" } }, timeoutMs: 90_000 }),
    async deliver(response) {
      const body = (await response.json().catch(() => ({}))) as { report?: ResearchReportDto; error?: string; detail?: string };
      if (response.status !== 200 || !body.report) {
        throw new DeliveryError("merchant_error", `merchant answered HTTP ${response.status}: ${body.error ?? "no report"}${body.detail ? ` (${body.detail})` : ""}`);
      }
      return { kind: "report", report: body.report };
    },
  };
}
