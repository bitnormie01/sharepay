import type { QuoteRoute, TradingApi } from "@sharepay/core/binance/trading";
import type { CheckoutState, Deliverable, Receipt } from "@sharepay/core/dto";
import { getStable, getStock } from "@sharepay/core/tokens";
import { encodeBase64Json, encodeSettlementResponse } from "@sharepay/core/x402/codec";
import { describe, expect, it } from "vitest";
import { formatPriceUsd, runCheckout, type CheckoutDeps } from "../src/checkout.js";
import type { Holding } from "../src/holdings.js";
import type { ReceiptStore } from "../src/ledger.js";
import type { MerchantAdapter } from "../src/merchants/types.js";
import type { RouteOutcome } from "../src/routeProbe.js";
import { SaleError, type PayerWallet } from "../src/wallets/types.js";

const U = getStable("U").address;
const NVDAB = getStock("NVDAB");
const OWNER = "0x1111111111111111111111111111111111111111";
const MERCHANT = "0x9999999999999999999999999999999999999999";
const SETTLE_TX = `0x${"5e".repeat(32)}` as const;
const SWAP_TX = `0x${"5a".repeat(32)}` as const;

const required = {
  x402Version: 2,
  resource: { url: "https://merchant.example/x402/report?symbol=NVDA" },
  accepts: [{ scheme: "exact", network: "eip155:56", amount: "50000000000000000", asset: U, payTo: MERCHANT, maxTimeoutSeconds: 300, extra: { name: "United Stables", version: "1", assetTransferMethod: "eip3009" } }],
};

function adapter(kind: "instant" | "async" = "instant", id: MerchantAdapter["id"] = "sharepay-nvda-report"): MerchantAdapter {
  return {
    id,
    title: "NVDA research report",
    merchantName: "SharePay merchant agent",
    merchantUrl: "https://merchant.example",
    description: "d",
    deliveryHint: "Instant",
    kind,
    etaSec: kind === "async" ? 240 : null,
    request: () => ({ url: "https://merchant.example/x402/report?symbol=NVDA", init: { method: "GET" }, timeoutMs: 1000 }),
    deliver: async (_response, ctx) => {
      if (kind === "async") ctx.onProgress({ etaSec: 100, jobStartedAt: "t0", lastPolledAt: "t1", note: "generating" });
      return { kind: "markdown", title: "Report", markdown: "# r" } satisfies Deliverable;
    },
  };
}

function wallet(overrides: Partial<PayerWallet> = {}): PayerWallet & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    kind: "api-signer",
    address: async () => OWNER,
    simulateSale: async () => {
      calls.push("simulate");
      return { ok: true, mode: "swap", failReason: null, detail: { minReceive: "50500000000000000" } };
    },
    executeSale: async (_plan, onBroadcast) => {
      calls.push("execute");
      onBroadcast?.();
      onBroadcast?.();
      return { txHashes: [SWAP_TX], received: 51000000000000000n };
    },
    signPayment: async () => {
      calls.push("sign");
      return { name: "PAYMENT-SIGNATURE", value: "signed" };
    },
    ...overrides,
  };
}

function receipts(): ReceiptStore & { added: Receipt[] } {
  const added: Receipt[] = [];
  return {
    added,
    list: () => added,
    add: (r) => added.push(r),
    update: (id, patch) => {
      const i = added.findIndex((r) => r.id === id);
      if (i >= 0) added[i] = { ...(added[i] as Receipt), ...patch };
    },
    latestFor: () => null,
  };
}

const holding: Holding = { stock: NVDAB, balance: 12300000000000000n, priceUsd: "168.43", sharesPerToken: 1000778223752807865n, status: { openState: true, marketStatus: "regular", reasonCode: "TRADING" } };

function swapOutcome(): RouteOutcome {
  const route: QuoteRoute = { quoteId: "q", vendorName: "LiquidMesh", toTokenAmount: "51000000000000000", executionMode: "SWAP", priceImpactPercent: "0.1" };
  return { kind: "swap", legs: [{ from: NVDAB.address, to: U, amountIn: 305765006234045n, route }], expectedOut: 51000000000000000n, priceImpactPercent: "0.1" };
}

const unusedTrading: TradingApi = {
  quote: async () => { throw new Error("unused"); },
  swap: async () => { throw new Error("unused"); },
  approveTransaction: async () => { throw new Error("unused"); },
};

function deps(options: { wallet?: PayerWallet; replayStatus?: number; settlement?: boolean; sweepFound?: boolean; holdings?: Holding[]; outcome?: RouteOutcome } = {}) {
  const fetchCalls: string[] = [];
  const store = receipts();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    fetchCalls.push(`${init?.method ?? "GET"} ${url}${new Headers(init?.headers).get("PAYMENT-SIGNATURE") ? " +sig" : ""}`);
    if (url.includes("/sharepay/activity")) {
      return new Response(JSON.stringify({ items: options.sweepFound === false ? [] : [{ id: "a1", kind: "sweep", at: "t", summary: "Reinvested $0.05 into 0.0000701 S&P 500 shares (SPYB)", amountUsd: "0.05", txHashes: ["0xsweep"], payer: null, triggeredBy: SETTLE_TX, spyShares: "0.0000701" }] }), { status: 200 });
    }
    if (new Headers(init?.headers).get("PAYMENT-SIGNATURE")) {
      const headers: Record<string, string> = {};
      if (options.settlement !== false) headers["PAYMENT-RESPONSE"] = encodeSettlementResponse({ success: (options.replayStatus ?? 200) < 400, transaction: (options.replayStatus ?? 200) < 400 ? SETTLE_TX : "", network: "eip155:56", payer: OWNER, ...((options.replayStatus ?? 200) >= 400 ? { errorReason: "insufficient_funds" } : {}) });
      return new Response(JSON.stringify({ report: {} }), { status: options.replayStatus ?? 200, headers });
    }
    return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": encodeBase64Json(required) } });
  }) as typeof fetch;
  let clock = 1_800_000_000_000;
  const broadcasts: string[] = [];
  const d: CheckoutDeps = {
    walletFor: () => options.wallet ?? wallet(),
    trading: unusedTrading,
    snapshot: async () => ({ tokens: new Map(), at: 0 }),
    holdings: async () => options.holdings ?? [holding],
    probe: async () => options.outcome ?? swapOutcome(),
    fetchImpl,
    sleep: async (ms) => { clock += ms; },
    nowMs: () => clock,
    receipts: store,
    merchantUrl: "https://merchant.example",
    onSaleBroadcast: () => broadcasts.push("slot"),
  };
  return { d, fetchCalls, store, broadcasts };
}

async function run(d: CheckoutDeps, mode: "simulate" | "live", item = adapter()) {
  const states: CheckoutState[] = [];
  const final = await runCheckout(d, { id: "c1", adapter: item, tokenAddress: NVDAB.address, mode }, (s) => states.push(s));
  return { final, states };
}

describe("formatPriceUsd", () => {
  it("formats x402 prices with exactly two decimals, rounding up", () => {
    expect(formatPriceUsd(50000000000000000n)).toBe("0.05");
    expect(formatPriceUsd(100000000000000000n)).toBe("0.10");
    expect(formatPriceUsd(15000000000000000n)).toBe("0.02");
    expect(formatPriceUsd(1230000000000000000n)).toBe("1.23");
  });
});

describe("runCheckout", () => {
  it("runs a live checkout end to end and records a share-denominated receipt", async () => {
    const w = wallet();
    const { d, fetchCalls, store, broadcasts } = deps({ wallet: w });
    const { final, states } = await run(d, "live");
    expect(final.status).toBe("succeeded");
    expect(final.steps.map((s) => [s.id, s.status])).toEqual([
      ["challenge", "done"], ["quote", "done"], ["simulate", "done"], ["sell", "done"],
      ["authorize", "done"], ["settle", "done"], ["deliver", "done"], ["reinvest", "done"],
    ]);
    expect(w.calls).toEqual(["simulate", "execute", "sign"]);
    expect(broadcasts).toEqual(["slot"]);
    expect(fetchCalls[0]).toBe("GET https://merchant.example/x402/report?symbol=NVDA");
    expect(fetchCalls[1]).toBe("GET https://merchant.example/x402/report?symbol=NVDA +sig");
    expect(final.receipt).toMatchObject({
      itemId: "sharepay-nvda-report", paidUsd: "0.05", paidAsset: "U", stockSymbol: "NVDAB", stockName: "NVIDIA",
      sharesSold: "0.000306", swapTxHashes: [SWAP_TX], settlementTxHash: SETTLE_TX, reinvestTxHash: "0xsweep", wallet: "api-signer",
    });
    expect(final.steps[5]?.links[0]?.href).toBe(`https://bscscan.com/tx/${SETTLE_TX}`);
    expect(final.steps[7]?.summary).toBe("Reinvested $0.05 into 0.0000701 S&P 500 shares (SPYB)");
    expect(final.deliverable).toEqual({ kind: "markdown", title: "Report", markdown: "# r" });
    expect(store.added).toHaveLength(1);
    expect(store.added[0]?.reinvestTxHash).toBe("0xsweep");
    expect(states.length).toBeGreaterThan(8);
  });

  it("stops after the simulation in simulate mode and never signs or broadcasts", async () => {
    const w = wallet();
    const { d, fetchCalls, broadcasts } = deps({ wallet: w });
    const { final } = await run(d, "simulate");
    expect(final.status).toBe("succeeded");
    expect(final.steps.map((s) => s.status)).toEqual(["done", "done", "done", "skipped", "skipped", "skipped", "skipped", "skipped"]);
    expect(final.steps[3]?.summary).toBe("Simulate mode: nothing signed or broadcast");
    expect(w.calls).toEqual(["simulate"]);
    expect(broadcasts).toEqual([]);
    expect(fetchCalls).toHaveLength(1);
    expect(final.receipt).toBeNull();
  });

  it("fails at the quote step with the picker reason for a hard-stopped stock", async () => {
    const paused: Holding = { ...holding, status: { openState: false, reasonCode: "ASSET_PAUSED", reasonMsg: "stock_split" } };
    const { d } = deps({ holdings: [paused] });
    const { final } = await run(d, "live");
    expect(final.status).toBe("failed");
    expect(final.error).toEqual({ code: "asset_paused", message: "Paused: stock split" });
    expect(final.steps[1]?.status).toBe("failed");
  });

  it("fails cleanly when the wallet does not hold the chosen stock", async () => {
    const { d } = deps({ holdings: [] });
    const { final } = await run(d, "live");
    expect(final.error?.code).toBe("not_held");
  });

  it("fails at the simulation step without selling", async () => {
    const w = wallet({ simulateSale: async () => ({ ok: false, mode: "swap", failReason: "ERC20: insufficient allowance", detail: {} }) });
    const { d } = deps({ wallet: w });
    const { final } = await run(d, "live");
    expect(final.status).toBe("failed");
    expect(final.error).toEqual({ code: "simulation_failed", message: "ERC20: insufficient allowance" });
    expect(w.calls).toEqual([]);
  });

  it("releases the live slot when the sale fails before anything is broadcast", async () => {
    const w = wallet({ executeSale: async () => { throw new SaleError("price_moved", "minimum receive 40 is below the price 50"); } });
    const { d, store, broadcasts } = deps({ wallet: w });
    const { final } = await run(d, "live");
    expect(final.status).toBe("failed");
    expect(final.error).toEqual({ code: "price_moved", message: "minimum receive 40 is below the price 50" });
    expect(final.steps[3]?.status).toBe("failed");
    expect(broadcasts).toEqual([]);
    expect(store.added).toHaveLength(0);
  });

  it("consumes the live slot once a sale transaction is broadcast, even when the sale then fails", async () => {
    const w = wallet({
      executeSale: async (_plan, onBroadcast) => {
        onBroadcast?.();
        throw new SaleError("nothing_received", "leg 1 returned nothing");
      },
    });
    const { d, broadcasts } = deps({ wallet: w });
    const { final } = await run(d, "live");
    expect(final.error?.code).toBe("nothing_received");
    expect(broadcasts).toEqual(["slot"]);
  });

  it("reports a refused settlement without a receipt", async () => {
    const { d, store } = deps({ replayStatus: 402 });
    const { final } = await run(d, "live");
    expect(final.status).toBe("failed");
    expect(final.error?.code).toBe("settle_failed");
    expect(final.error?.message).toContain("insufficient_funds");
    expect(final.receipt).toBeNull();
    expect(store.added).toHaveLength(0);
  });

  it("marks async deliveries as awaiting_delivery with progress and skips reinvest for third-party merchants", async () => {
    const { d } = deps();
    const { final, states } = await run(d, "live", adapter("async", "bnb-stock-analyst-nvda"));
    expect(states.some((s) => s.status === "awaiting_delivery" && s.etaSec === 100 && s.lastPolledAt === "t1")).toBe(true);
    expect(final.status).toBe("succeeded");
    expect(final.steps[7]).toMatchObject({ status: "skipped", summary: "Only SharePay's own merchant reinvests" });
  });

  it("leaves reinvest skipped when the sweep has not shown up in time", async () => {
    const { d } = deps({ sweepFound: false });
    const { final } = await run(d, "live");
    expect(final.status).toBe("succeeded");
    expect(final.steps[7]).toMatchObject({ status: "skipped", summary: "Reinvest pending on the merchant agent" });
  });
});
