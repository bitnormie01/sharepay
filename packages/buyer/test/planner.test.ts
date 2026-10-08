import type { QuoteParams, QuoteRoute, TradingApi } from "@sharepay/core/binance/trading";
import { getStable, getStock } from "@sharepay/core/tokens";
import { describe, expect, it } from "vitest";
import { PlanError, estimateSale, planSale } from "../src/planner.js";
import type { SwapLeg } from "../src/routeProbe.js";

const NVDAB = getStock("NVDAB");
const U = getStable("U").address;
const USDT = getStable("USDT").address;
const WALLET = "0x1111111111111111111111111111111111111111";
const PRICE = 50000000000000000n;

function trading(toTokenAmount: () => string, calls: QuoteParams[] = []): TradingApi {
  return {
    quote: async (params) => {
      calls.push(params);
      return [{ quoteId: "q2", vendorName: "LiquidMesh", toTokenAmount: toTokenAmount(), executionMode: "SWAP", priceImpactPercent: "0.3" }];
    },
    swap: async () => { throw new Error("unused"); },
    approveTransaction: async () => { throw new Error("unused"); },
  };
}

function swapOutcome(amountIn: bigint, expectedOut: bigint, legCount: 1 | 2 = 1) {
  const route: QuoteRoute = { quoteId: "q1", vendorName: "LiquidMesh", toTokenAmount: expectedOut.toString(), executionMode: "SWAP", priceImpactPercent: "0.1" };
  const legs: SwapLeg[] =
    legCount === 2
      ? [{ from: NVDAB.address, to: USDT, amountIn, route }, { from: USDT, to: U, amountIn: expectedOut, route }]
      : [{ from: NVDAB.address, to: U, amountIn, route }];
  return { kind: "swap" as const, legs, expectedOut, priceImpactPercent: "0.1" };
}

describe("estimateSale", () => {
  it("sizes the sale at price / tokenPrice plus a 3% buffer, rounded up, and converts to shares", () => {
    const estimate = estimateSale({ priceAtomic: PRICE, tokenPriceUsd: "168.43", sharesPerToken: 1000778223752807865n });
    expect(estimate).toEqual({ sellAmount: 305765006234045n, sellShares: 306002959824673n });
  });

  it("refuses to estimate without a live price", () => {
    expect(() => estimateSale({ priceAtomic: PRICE, tokenPriceUsd: null, sharesPerToken: 10n ** 18n })).toThrowError(PlanError);
    expect(() => estimateSale({ priceAtomic: PRICE, tokenPriceUsd: "0", sharesPerToken: 10n ** 18n })).toThrow("token price is zero");
  });
});

describe("planSale", () => {
  const estimate = { sellAmount: 305765006234045n, sellShares: 306002959824673n };

  it("keeps the probed route when its output covers price + 1.5%", async () => {
    const calls: QuoteParams[] = [];
    const plan = await planSale(trading(() => "0", calls), {
      stock: NVDAB, payAsset: U, priceAtomic: PRICE, estimate, outcome: swapOutcome(estimate.sellAmount, 51000000000000000n), wallet: WALLET, balance: 10n ** 18n,
    });
    expect(plan).toMatchObject({ sellAmount: 305765006234045n, expectedOut: 51000000000000000n, priceAtomic: PRICE, priceImpactPercent: "0.1" });
    expect(calls).toHaveLength(0);
  });

  it("resizes once and re-probes when the quote is short", async () => {
    const calls: QuoteParams[] = [];
    const plan = await planSale(trading(() => "52000000000000000", calls), {
      stock: NVDAB, payAsset: U, priceAtomic: PRICE, estimate, outcome: swapOutcome(estimate.sellAmount, 49000000000000000n), wallet: WALLET, balance: 10n ** 18n,
    });
    expect(plan.sellAmount).toBe(319852036878401n);
    expect(plan.expectedOut).toBe(52000000000000000n);
    expect(calls[0]?.amount).toBe(319852036878401n);
  });

  it("holds two-leg routes to a 3% margin", async () => {
    const calls: QuoteParams[] = [];
    const plan = await planSale(trading(() => "52000000000000000", calls), {
      stock: NVDAB, payAsset: U, priceAtomic: PRICE, estimate, outcome: swapOutcome(estimate.sellAmount, 51000000000000000n, 2), wallet: WALLET, balance: 10n ** 18n,
    });
    expect(calls[0]?.amount).toBe(311850329397331n);
    expect(plan).toMatchObject({ sellAmount: 311850329397331n, expectedOut: 52000000000000000n });
    expect(plan.legs).toHaveLength(1);
  });

  it("fails with quote_short when the resized quote is still short", async () => {
    const error = await planSale(trading(() => "40000000000000000"), {
      stock: NVDAB, payAsset: U, priceAtomic: PRICE, estimate, outcome: swapOutcome(estimate.sellAmount, 49000000000000000n), wallet: WALLET, balance: 10n ** 18n,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect((error as PlanError).code).toBe("quote_short");
  });

  it("fails with insufficient_shares when the sale exceeds the holding", async () => {
    const error = await planSale(trading(() => "0"), {
      stock: NVDAB, payAsset: U, priceAtomic: PRICE, estimate, outcome: swapOutcome(estimate.sellAmount, 51000000000000000n), wallet: WALLET, balance: 1n,
    }).catch((e: unknown) => e);
    expect((error as PlanError).code).toBe("insufficient_shares");
  });

  it("fails with route_lost when the re-probe finds no SWAP route", async () => {
    const lost: TradingApi = {
      quote: async () => [],
      swap: async () => { throw new Error("unused"); },
      approveTransaction: async () => { throw new Error("unused"); },
    };
    const error = await planSale(lost, {
      stock: NVDAB, payAsset: U, priceAtomic: PRICE, estimate, outcome: swapOutcome(estimate.sellAmount, 49000000000000000n), wallet: WALLET, balance: 10n ** 18n,
    }).catch((e: unknown) => e);
    expect((error as PlanError).code).toBe("route_lost");
  });
});
