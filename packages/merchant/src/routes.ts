import type { ResearchReportDto } from "@sharepay/core/dto";
import { formatAmount } from "@sharepay/core/money";
import { X402_NETWORK } from "@sharepay/core/tokens";
import { encodeBase64Json, encodeSettlementResponse } from "@sharepay/core/x402/codec";
import type { PaymentRequired } from "@sharepay/core/x402/types";
import express, { type Express, type Router } from "express";
import type { Address, Hex } from "viem";
import type { ActivityStore } from "./activity.js";
import type { MerchantConfig } from "./config.js";
import { buildReportRequirements } from "./requirements.js";
import type { VerifyResult } from "./verify.js";

export interface MerchantRuntime {
  config: MerchantConfig;
  payTo: Address;
  getReport: (symbol: string) => Promise<ResearchReportDto>;
  verify: (required: PaymentRequired, headerValue: string) => Promise<VerifyResult>;
  settle: (asset: Address, calldata: Hex) => Promise<{ txHash: Hex }>;
  activity: ActivityStore;
  sweeper: { trigger(triggeredBy: string | null): void; stop(): void };
  inFlight: Set<string>;
  deepHealth: () => Promise<{ rwaCode: number | null; rwaMessage: string }>;
}

function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMerchantRouter(runtime: MerchantRuntime): Router {
  const router = express.Router();
  const { config } = runtime;
  const priceUsd = formatAmount(config.priceAtomic, 18, 2);

  function requirementsFor(symbol: string): PaymentRequired {
    return buildReportRequirements({
      priceAtomic: config.priceAtomic,
      payTo: runtime.payTo,
      resourceUrl: `${config.publicUrl}/x402/report?symbol=${symbol}`,
      maxTimeoutSeconds: config.maxTimeoutSeconds,
      assets: config.acceptedAssets,
    });
  }

  router.get("/x402/report/price", (_req, res) => {
    const required = requirementsFor("NVDA");
    res.json({ x402Version: 2, priceUsd, accepts: required.accepts });
  });

  router.get("/x402/report", async (req, res) => {
    const symbol = String(req.query.symbol ?? "NVDA").toUpperCase();
    if (!/^[A-Z]{1,8}$/.test(symbol)) {
      res.status(400).json({ error: "bad_symbol" });
      return;
    }
    const required = requirementsFor(symbol);
    const header = req.get("payment-signature");
    if (!header) {
      res.status(402).set("PAYMENT-REQUIRED", encodeBase64Json(required)).json({ error: "payment_required", paymentRequired: required });
      return;
    }
    const verified = await runtime.verify(required, header);
    if (!verified.ok) {
      res
        .status(402)
        .set("PAYMENT-REQUIRED", encodeBase64Json(required))
        .set(
          "PAYMENT-RESPONSE",
          encodeSettlementResponse({ success: false, errorReason: verified.reason, transaction: "", network: X402_NETWORK, payer: verified.payer ?? "" }),
        )
        .json({ error: verified.reason, detail: verified.detail });
      return;
    }
    runtime.inFlight.add(verified.inFlightKey);
    let txHash: Hex;
    let report: ResearchReportDto;
    try {
      try {
        report = await runtime.getReport(symbol);
      } catch (error) {
        res.status(503).json({ error: "report_unavailable", detail: errorText(error) });
        return;
      }
      try {
        txHash = (await runtime.settle(verified.stable.address, verified.calldata)).txHash;
      } catch (error) {
        res
          .status(402)
          .set(
            "PAYMENT-RESPONSE",
            encodeSettlementResponse({ success: false, errorReason: "settle_failed", transaction: "", network: X402_NETWORK, payer: verified.payer }),
          )
          .json({ error: "settle_failed", detail: errorText(error) });
        return;
      }
    } finally {
      runtime.inFlight.delete(verified.inFlightKey);
    }
    const amountUsd = formatAmount(BigInt(verified.accept.amount), 18, 2);
    runtime.activity.add({
      kind: "settlement",
      summary: `Received a $${amountUsd} payment from ${shortAddress(verified.payer)}`,
      amountUsd,
      txHashes: [txHash],
      payer: verified.payer,
      triggeredBy: null,
      spyShares: null,
    });
    runtime.sweeper.trigger(txHash);
    res
      .status(200)
      .set("PAYMENT-RESPONSE", encodeSettlementResponse({ success: true, transaction: txHash, network: X402_NETWORK, payer: verified.payer }))
      .json({ report, settlement: { transaction: txHash, network: X402_NETWORK, payer: verified.payer } });
  });

  router.get("/sharepay/activity", (req, res) => {
    const after = typeof req.query.after === "string" && req.query.after.length > 0 ? req.query.after : null;
    res.json({ items: runtime.activity.after(after) });
  });

  router.get("/sharepay/health", async (req, res) => {
    const base = { ok: true, payTo: runtime.payTo, network: X402_NETWORK, priceUsd, sweepEnabled: config.sweep.enabled };
    if (req.query.deep === "1") {
      res.json({ ...base, ...(await runtime.deepHealth()) });
      return;
    }
    res.json(base);
  });

  return router;
}

export function mountSharePayMerchant(app: Express, runtime: MerchantRuntime): void {
  app.use(createMerchantRouter(runtime));
}
