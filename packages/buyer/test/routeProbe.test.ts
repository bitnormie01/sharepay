import { BinanceApiError } from "@sharepay/core/binance/client";
import type { QuoteParams, QuoteRoute, TradingApi } from "@sharepay/core/binance/trading";
import { getStable, getStock } from "@sharepay/core/tokens";
import { describe, expect, it } from "vitest";
import { classifyQuoteError, parseMinUsd, probeRoute } from "../src/routeProbe.js";

const NVDAB = getStock("NVDAB").address;
const NVDAON = getStock("NVDAon").address;
const U = getStable("U").address;
const USDT = getStable("USDT").address;
const WALLET = "0x1111111111111111111111111111111111111111";

type Script = (params: QuoteParams) => QuoteRoute[];

function trading(script: Script, calls: QuoteParams[]): TradingApi {
  return {
    quote: async (params) => {
      calls.push(params);
      return script(params);
    },
    swap: async () => {
      throw new Error("unused");
    },
    approveTransaction: async () => {
      throw new Error("unused");
    },
  };
}

const swap = (toTokenAmount: string, impact = "0.1"): QuoteRoute => ({ quoteId: `q-${toTokenAmount}`, vendorName: "LiquidMesh", toTokenAmount, executionMode: "SWAP", priceImpactPercent: impact });
const rfq: QuoteRoute = { quoteId: "rfq", vendorName: "PcsXRfq", toTokenAmount: "60000000000000000", executionMode: "RFQ" };
const apiError = (code: number, msg: string) => new BinanceApiError("/api/v1/dex/aggregator/quote", 200, code, msg);

describe("probeRoute", () => {
  it("returns the best direct SWAP route from the multi-vendor quote", async () => {
    const calls: QuoteParams[] = [];
    const outcome = await probeRoute(trading(() => [rfq, swap("51000000000000000")], calls), { stock: NVDAB, payAsset: U, sellAmount: 305765006234045n, wallet: WALLET });
    expect(outcome).toMatchObject({ kind: "swap", expectedOut: 51000000000000000n, priceImpactPercent: "0.1" });
    if (outcome.kind !== "swap") return;
    expect(outcome.legs).toHaveLength(1);
    expect(outcome.legs[0]).toMatchObject({ from: NVDAB, to: U, amountIn: 305765006234045n });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ userWalletAddress: WALLET, vendor: undefined });
  });

  it("falls back to LiquidMesh when the multi-vendor quote is RFQ-only", async () => {
    const calls: QuoteParams[] = [];
    const outcome = await probeRoute(trading((p) => (p.vendor === "LiquidMesh" ? [swap("52000000000000000")] : [rfq]), calls), { stock: NVDAB, payAsset: U, sellAmount: 1n, wallet: WALLET });
    expect(outcome).toMatchObject({ kind: "swap", expectedOut: 52000000000000000n });
    expect(calls.map((c) => c.vendor)).toEqual([undefined, "LiquidMesh"]);
  });

  it("routes two legs through USDT when there is no direct SWAP route", async () => {
    const calls: QuoteParams[] = [];
    const script: Script = (p) => {
      if (p.toTokenAddress === U && p.fromTokenAddress === NVDAB) return [];
      if (p.toTokenAddress === USDT) return [swap("51500000000000000", "0.2")];
      if (p.fromTokenAddress === USDT) return [swap("51400000000000000", "0.05")];
      return [];
    };
    const outcome = await probeRoute(trading(script, calls), { stock: NVDAB, payAsset: U, sellAmount: 9n, wallet: WALLET });
    expect(outcome).toMatchObject({ kind: "swap", expectedOut: 51400000000000000n, priceImpactPercent: "0.2" });
    if (outcome.kind !== "swap") return;
    expect(outcome.legs.map((l) => [l.from, l.to, l.amountIn])).toEqual([
      [NVDAB, USDT, 9n],
      [USDT, U, 51500000000000000n],
    ]);
  });

  it("reports RFQ-only when only RFQ routes exist anywhere", async () => {
    const outcome = await probeRoute(trading((p) => (p.vendor === "LiquidMesh" ? [] : [rfq]), []), { stock: NVDAON, payAsset: U, sellAmount: 1n, wallet: WALLET });
    expect(outcome).toEqual({ kind: "rfq_only", code: null, message: "Only an RFQ route is available", minUsd: null });
  });

  it("prefers specific API refusals (closed, below minimum, above maximum)", async () => {
    const closed = await probeRoute(trading(() => { throw apiError(40369, "BSTOCK_INVALID_TRADING_TIME"); }, []), { stock: NVDAB, payAsset: U, sellAmount: 1n, wallet: WALLET });
    expect(closed).toEqual({ kind: "closed", code: 40369, message: "40369 BSTOCK_INVALID_TRADING_TIME", minUsd: null });
    const belowMin = await probeRoute(
      trading((p) => { if (p.vendor === undefined && p.fromTokenAddress === NVDAON) throw apiError(40375, "ONDO_FROM_USD_AMOUNT_TOO_SMALL, minimum 5.5 USD"); return []; }, []),
      { stock: NVDAON, payAsset: U, sellAmount: 1n, wallet: WALLET },
    );
    expect(belowMin).toMatchObject({ kind: "below_min", code: 40375, minUsd: "5.5" });
    const aboveMax = await probeRoute(trading(() => { throw apiError(40366, "ONDO_MAX_SINGLE_ORDER_LIMIT"); }, []), { stock: NVDAON, payAsset: U, sellAmount: 1n, wallet: WALLET });
    expect(aboveMax.kind).toBe("above_max");
  });

  it("falls back to no-liquidity when nothing routes", async () => {
    const empty = await probeRoute(trading(() => [], []), { stock: NVDAB, payAsset: U, sellAmount: 1n, wallet: WALLET });
    expect(empty).toEqual({ kind: "no_liquidity", code: null, message: "No live route right now", minUsd: null });
    const thin = await probeRoute(trading(() => { throw apiError(40374, "RWA_INSUFFICIENT_LIQUIDITY"); }, []), { stock: NVDAB, payAsset: U, sellAmount: 1n, wallet: WALLET });
    expect(thin.kind).toBe("no_liquidity");
  });
});

describe("classifyQuoteError / parseMinUsd", () => {
  it("maps codes and plain errors", () => {
    expect(classifyQuoteError(apiError(40367, "ONDO_MARKET_STATE_NOT_TRADABLE")).kind).toBe("closed");
    expect(classifyQuoteError(apiError(40370, "BSTOCK_INVALID_TRADING_PAIR"))).toEqual({ kind: "error", code: 40370, message: "40370 BSTOCK_INVALID_TRADING_PAIR", minUsd: null });
    expect(classifyQuoteError(new Error("socket hang up"))).toEqual({ kind: "error", code: null, message: "socket hang up", minUsd: null });
    expect(parseMinUsd("min order is 10 USD")).toBe("10");
    expect(parseMinUsd("no numbers here")).toBeNull();
  });
});
