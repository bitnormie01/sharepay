import { BinanceApiError } from "@sharepay/core/binance/client";
import type { QuoteRoute, TradingApi } from "@sharepay/core/binance/trading";
import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { createWalletMutex, type TxSigner } from "@sharepay/core/chain/txpipeline";
import { AGGREGATION_ROUTER, getStable, getStock } from "@sharepay/core/tokens";
import { describe, expect, it } from "vitest";
import { createActivityStore } from "../src/activity.js";
import type { SweepConfig } from "../src/config.js";
import { createSweeper, runSweepOnce, type SweepDeps } from "../src/sweeper.js";

const MERCHANT = "0x9999999999999999999999999999999999999999";
const U = getStable("U").address;
const USD1 = getStable("USD1").address;
const USDT = getStable("USDT").address;
const SPYB = getStock("SPYB").address;
const SPY_RECEIVED = 70000000000000n;
const USDT_RECEIVED = 49900000000000000n;

const config: SweepConfig = {
  enabled: true,
  minAtomic: 50000000000000000n,
  floatAtomic: 0n,
  maxAtomic: 5000000000000000000n,
  maxPriceImpactPercent: 2,
  slippagePercent: "1",
  intervalMs: 300000,
};

function swapRoute(overrides: Partial<QuoteRoute> = {}): QuoteRoute[] {
  return [{ quoteId: "q", toTokenAmount: "70000000000000", executionMode: "SWAP", priceImpactPercent: "0.1", approveTarget: AGGREGATION_ROUTER, ...overrides }];
}

function world(options: {
  balances?: Record<string, bigint>;
  allowance?: bigint;
  routes?: (from: string, to: string) => QuoteRoute[];
  approveSpender?: string;
  clock?: { now: number };
}) {
  const balances = new Map<string, bigint>(Object.entries(options.balances ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const broadcasts: string[] = [];
  const quotes: string[] = [];
  const balanceReads: string[] = [];
  let allowance = options.allowance ?? 10n ** 30n;
  const chain: ChainReader = {
    balanceOf: async (token) => {
      balanceReads.push(token.toLowerCase());
      return balances.get(token.toLowerCase()) ?? 0n;
    },
    allowance: async () => allowance,
    authorizationState: async () => false,
    uiMultiplier: async () => 1001729792036835231n,
    nativeBalance: async () => 0n,
    pendingNonce: async () => 0,
    waitForReceipt: async () => ({ status: "success", blockNumber: 1n }),
  };
  const tx: TransactionApi = {
    simulate: async () => ({ ok: true, status: "SUCCESS", failReason: null, balanceChanges: [], allowanceChanges: [] }),
    gasPrice: async () => 1n,
    gasLimit: async () => 100000n,
    broadcast: async ({ signedTransaction }) => {
      broadcasts.push(signedTransaction);
      if (signedTransaction === "0x5a01") balances.set(SPYB, (balances.get(SPYB) ?? 0n) + SPY_RECEIVED);
      if (signedTransaction === "0x5a02") balances.set(USDT, (balances.get(USDT) ?? 0n) + USDT_RECEIVED);
      if (signedTransaction === "0xa1") allowance = 10n ** 30n;
      return { orderId: "o", txHash: `0x${broadcasts.length.toString(16).padStart(64, "0")}` };
    },
  };
  const trading: TradingApi = {
    quote: async (params) => {
      quotes.push(`${params.fromTokenAddress}->${params.toTokenAddress}:${params.amount}:${params.vendor ?? ""}`);
      return (options.routes ?? (() => swapRoute()))(params.fromTokenAddress.toLowerCase(), params.toTokenAddress.toLowerCase());
    },
    swap: async (params) => ({
      executionMode: "SWAP",
      tx: { to: AGGREGATION_ROUTER, data: params.toTokenAddress.toLowerCase() === SPYB ? "0x5a01" : "0x5a02", value: "0" },
    }),
    approveTransaction: async () => ({ data: "0xa1", dexContractAddress: options.approveSpender ?? AGGREGATION_ROUTER }),
  };
  const signer: TxSigner = { address: MERCHANT, signLegacyTx: async (request) => request.data };
  const clock = options.clock ?? { now: 0 };
  const activity = createActivityStore({ path: null, seedPath: null, now: () => new Date(clock.now) });
  const deps: SweepDeps = { trading, tx, chain, signer, mutex: createWalletMutex(), activity, config, receiptTimeoutMs: 1000, nowMs: () => clock.now };
  return { deps, broadcasts, quotes, balanceReads, activity, clock };
}

describe("runSweepOnce", () => {
  it("does nothing below the minimum", async () => {
    const w = world({ balances: { [U]: 10000000000000000n } });
    await runSweepOnce(w.deps, null);
    expect(w.quotes).toEqual([]);
    expect(w.activity.list()).toEqual([]);
  });

  it("reinvests U into SPYB through a SWAP route and records the shares bought", async () => {
    const w = world({ balances: { [U]: 50000000000000000n } });
    await runSweepOnce(w.deps, "0xsettle");
    expect(w.broadcasts).toEqual(["0x5a01"]);
    expect(w.quotes[0]).toBe(`${U}->${SPYB}:50000000000000000:LiquidMesh`);
    const [entry] = w.activity.list();
    expect(entry).toMatchObject({
      kind: "sweep",
      summary: "Reinvested $0.05 into 0.0000701 S&P 500 shares (SPYB)",
      amountUsd: "0.05",
      triggeredBy: "0xsettle",
      spyShares: "0.0000701",
    });
    expect(entry?.txHashes).toHaveLength(1);
  });

  it("approves first when the allowance is short, then re-quotes and swaps", async () => {
    const w = world({ balances: { [U]: 60000000000000000n }, allowance: 0n });
    await runSweepOnce(w.deps, null);
    expect(w.broadcasts).toEqual(["0xa1", "0x5a01"]);
    expect(w.activity.list()[0]?.txHashes).toHaveLength(2);
  });

  it("refuses an approval whose spender differs from the route spender", async () => {
    const w = world({ balances: { [U]: 60000000000000000n }, allowance: 0n, approveSpender: "0x0000000000000000000000000000000000000bad" });
    await runSweepOnce(w.deps, null);
    expect(w.broadcasts).toEqual([]);
    expect(w.activity.list()[0]).toMatchObject({ kind: "sweep_skipped" });
    expect(w.activity.list()[0]?.summary).toContain("does not match route spender");
  });

  it("skips when the price impact is above the cap", async () => {
    const w = world({ balances: { [U]: 50000000000000000n }, routes: () => swapRoute({ priceImpactPercent: "5" }) });
    await runSweepOnce(w.deps, null);
    expect(w.broadcasts).toEqual([]);
    expect(w.activity.list()[0]?.summary).toBe("Reinvest postponed: price impact 5% is above 2%");
  });

  it("falls back to two legs through USDT when the direct pair is refused (40370)", async () => {
    const w = world({
      balances: { [U]: 50000000000000000n },
      routes: (from, to) => {
        if (from === U && to === SPYB) throw new BinanceApiError("/api/v1/dex/aggregator/quote", 200, 40370, "BSTOCK_INVALID_TRADING_PAIR");
        return swapRoute();
      },
    });
    await runSweepOnce(w.deps, null);
    expect(w.broadcasts).toEqual(["0x5a02", "0x5a01"]);
    expect(w.quotes.some((q) => q.startsWith(`${USDT}->${SPYB}:${USDT_RECEIVED}`))).toBe(true);
    expect(w.activity.list()[0]).toMatchObject({ kind: "sweep" });
    expect(w.activity.list()[0]?.txHashes).toHaveLength(2);
  });

  it("records a repeated skip reason at most once per 10 minutes", async () => {
    const clock = { now: 0 };
    const w = world({ balances: { [USD1]: 50000000000000000n }, routes: () => [{ quoteId: "r", toTokenAmount: "1", executionMode: "RFQ" }], clock });
    const state = { lastSkipAt: new Map<string, number>() };
    await runSweepOnce(w.deps, null, state);
    clock.now = 60_000;
    await runSweepOnce(w.deps, null, state);
    expect(w.activity.list()).toHaveLength(1);
    clock.now = 11 * 60_000;
    await runSweepOnce(w.deps, null, state);
    expect(w.activity.list()).toHaveLength(2);
  });
});

describe("createSweeper", () => {
  it("is single-flight and queues at most one follow-up run", async () => {
    const w = world({ balances: { [U]: 1n } });
    const sweeper = createSweeper(w.deps);
    sweeper.trigger("a");
    sweeper.trigger("b");
    sweeper.trigger("c");
    await sweeper.idle();
    expect(w.balanceReads.filter((t) => t === U)).toHaveLength(2);
  });

  it("does nothing when disabled", async () => {
    const w = world({ balances: { [U]: 50000000000000000n } });
    const sweeper = createSweeper({ ...w.deps, config: { ...config, enabled: false } });
    sweeper.trigger("a");
    sweeper.start();
    await sweeper.idle();
    sweeper.stop();
    expect(w.balanceReads).toEqual([]);
  });
});
