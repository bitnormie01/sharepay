import type { TxSigner } from "@sharepay/core/chain/txpipeline";
import type { ResearchReportDto } from "@sharepay/core/dto";
import { getStable } from "@sharepay/core/tokens";
import { decodeBase64Json } from "@sharepay/core/x402/codec";
import express from "express";
import request from "supertest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createActivityStore } from "../src/activity.js";
import { loadMerchantConfig } from "../src/config.js";
import { mountSharePayMerchant, type MerchantRuntime } from "../src/routes.js";
import { createMerchantRuntime } from "../src/runtime.js";
import { sharePayRunWork } from "../src/runWork.js";
import type { VerifyResult } from "../src/verify.js";

const MERCHANT = "0x9999999999999999999999999999999999999999";
const PAYER = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}` as const;

const REPORT: ResearchReportDto = {
  symbol: "NVDA",
  companyName: "NVIDIA Corporation",
  generatedAt: "2026-10-07T10:00:00.000Z",
  summary: ["s"],
  company: [],
  market: [],
  status: { open: true, label: "Open (regular)", nextOpenTime: null },
  issuers: [],
  crossIssuerSpreadBps: null,
  disclaimer: "d",
  sources: [],
  markdown: "# r",
};

const OK: VerifyResult = {
  ok: true,
  payload: {
    x402Version: 2,
    accepted: { scheme: "exact", network: "eip155:56", amount: "50000000000000000", asset: getStable("U").address, payTo: MERCHANT, maxTimeoutSeconds: 300 },
    payload: { signature: "0x00", authorization: { from: PAYER, to: MERCHANT, value: "50000000000000000", validAfter: "0", validBefore: "1", nonce: `0x${"00".repeat(32)}` } },
  },
  accept: { scheme: "exact", network: "eip155:56", amount: "50000000000000000", asset: getStable("U").address, payTo: MERCHANT, maxTimeoutSeconds: 300 },
  stable: getStable("U"),
  payer: PAYER,
  calldata: "0xe3ee160e",
  inFlightKey: "key-1",
};

function runtime(overrides: Partial<MerchantRuntime> = {}) {
  const calls: string[] = [];
  const rt: MerchantRuntime = {
    config: loadMerchantConfig({ MERCHANT_PUBLIC_URL: "https://merchant.example" }),
    payTo: MERCHANT,
    getReport: async (symbol) => {
      calls.push(`report:${symbol}`);
      return REPORT;
    },
    verify: async () => OK,
    settle: async () => {
      calls.push("settle");
      return { txHash: TX };
    },
    activity: createActivityStore({ path: null, seedPath: null, now: () => new Date("2026-10-07T10:00:00.000Z") }),
    sweeper: { trigger: (t) => calls.push(`sweep:${t}`), stop: () => undefined },
    inFlight: new Set<string>(),
    deepHealth: async () => ({ rwaCode: 0, rwaMessage: "ok" }),
    ...overrides,
  };
  const app = express();
  mountSharePayMerchant(app, rt);
  return { app, rt, calls };
}

describe("GET /x402/report", () => {
  it("answers 402 with a base64 PAYMENT-REQUIRED header when unpaid", async () => {
    const { app } = runtime();
    const res = await request(app).get("/x402/report?symbol=nvda");
    expect(res.status).toBe(402);
    const required = decodeBase64Json(String(res.headers["payment-required"])) as { x402Version: number; resource: { url: string }; accepts: Array<{ payTo: string; amount: string }> };
    expect(required.x402Version).toBe(2);
    expect(required.resource.url).toBe("https://merchant.example/x402/report?symbol=NVDA");
    expect(required.accepts).toHaveLength(2);
    expect(required.accepts[0]).toMatchObject({ payTo: MERCHANT, amount: "50000000000000000" });
    expect(res.body.error).toBe("payment_required");
  });

  it("rejects bad symbols", async () => {
    const { app } = runtime();
    expect((await request(app).get("/x402/report?symbol=NV-DA")).status).toBe(400);
  });

  it("delivers the report after verifying and settling, then triggers the sweep", async () => {
    const { app, rt, calls } = runtime();
    const res = await request(app).get("/x402/report?symbol=NVDA").set("PAYMENT-SIGNATURE", "abc");
    expect(res.status).toBe(200);
    expect(decodeBase64Json(String(res.headers["payment-response"]))).toEqual({ success: true, transaction: TX, network: "eip155:56", payer: PAYER });
    expect(res.body.report.symbol).toBe("NVDA");
    expect(res.body.settlement).toEqual({ transaction: TX, network: "eip155:56", payer: PAYER });
    expect(calls).toEqual(["report:NVDA", "settle", `sweep:${TX}`]);
    expect(rt.activity.list()[0]).toMatchObject({ kind: "settlement", summary: "Received a $0.05 payment from 0x1111…1111", amountUsd: "0.05", txHashes: [TX], payer: PAYER });
    expect(rt.inFlight.size).toBe(0);
  });

  it("answers 402 with PAYMENT-RESPONSE errorReason when verification fails", async () => {
    const { app, calls } = runtime({ verify: async () => ({ ok: false, reason: "expired", payer: PAYER, detail: "validBefore has passed" }) });
    const res = await request(app).get("/x402/report?symbol=NVDA").set("PAYMENT-SIGNATURE", "abc");
    expect(res.status).toBe(402);
    expect(decodeBase64Json(String(res.headers["payment-response"]))).toEqual({ success: false, errorReason: "expired", transaction: "", network: "eip155:56", payer: PAYER });
    expect(res.headers["payment-required"]).toBeDefined();
    expect(res.body).toEqual({ error: "expired", detail: "validBefore has passed" });
    expect(calls).toEqual([]);
  });

  it("does not charge when the report cannot be built", async () => {
    const { app, rt, calls } = runtime({ getReport: async () => { throw new Error("rwa down"); } });
    const res = await request(app).get("/x402/report?symbol=NVDA").set("PAYMENT-SIGNATURE", "abc");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("report_unavailable");
    expect(calls).toEqual([]);
    expect(rt.inFlight.size).toBe(0);
  });

  it("reports settle failures and clears the in-flight nonce", async () => {
    const { app, rt } = runtime({ settle: async () => { throw new Error("reverted"); } });
    const res = await request(app).get("/x402/report?symbol=NVDA").set("PAYMENT-SIGNATURE", "abc");
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: "settle_failed", detail: "reverted" });
    expect(rt.inFlight.size).toBe(0);
  });
});

describe("discovery, activity and health routes", () => {
  it("serves the price, the activity feed and health (with a deep RWA probe)", async () => {
    const { app, rt } = runtime();
    const price = await request(app).get("/x402/report/price");
    expect(price.body).toMatchObject({ x402Version: 2, priceUsd: "0.05" });
    expect(price.body.accepts).toHaveLength(2);
    const first = rt.activity.add({ kind: "settlement", summary: "a", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null });
    rt.activity.add({ kind: "sweep", summary: "b", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null });
    expect((await request(app).get("/sharepay/activity")).body.items).toHaveLength(2);
    expect((await request(app).get(`/sharepay/activity?after=${first.id}`)).body.items.map((i: { summary: string }) => i.summary)).toEqual(["b"]);
    expect((await request(app).get("/sharepay/health")).body).toEqual({ ok: true, payTo: MERCHANT, network: "eip155:56", priceUsd: "0.05", sweepEnabled: true });
    expect((await request(app).get("/sharepay/health?deep=1")).body).toMatchObject({ ok: true, rwaCode: 0, rwaMessage: "ok" });
  });
});

describe("sharePayRunWork", () => {
  it("answers deterministically and points at the paid endpoint", async () => {
    const work = sharePayRunWork("https://merchant.example/");
    const text = await work("anything", { sessionId: "s" });
    expect(text).toContain("does not run an LLM");
    expect(text).toContain("GET https://merchant.example/x402/report?symbol=NVDA");
  });
});

describe("createMerchantRuntime", () => {
  it("requires Binance credentials", async () => {
    const signer: TxSigner = { address: MERCHANT, signLegacyTx: async () => "0x00" };
    await expect(createMerchantRuntime({ env: { MERCHANT_PUBLIC_URL: "https://m.example" }, signer })).rejects.toThrow("BINANCE_API_KEY");
  });

  it("wires a runtime around the signer without touching the network", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signer: TxSigner = { address: account.address, signLegacyTx: async () => "0x00" };
    const rt = await createMerchantRuntime({
      env: { MERCHANT_PUBLIC_URL: "https://m.example", BINANCE_API_KEY: "k", BINANCE_API_SECRET: "s", SWEEP_ENABLED: "false", ACTIVITY_PATH: "", ACTIVITY_SEED_PATH: "" },
      signer,
    });
    expect(rt.payTo).toBe(account.address);
    expect(rt.config.sweep.enabled).toBe(false);
    rt.sweeper.stop();
  });
});
