import type { TradingApi } from "@sharepay/core/binance/trading";
import { ONE, addBps, mulDivUp, sharesFromTokens, toUnits } from "@sharepay/core/money";
import type { StockToken } from "@sharepay/core/tokens";
import type { Address } from "viem";
import { probeRoute, type SwapLeg } from "./routeProbe.js";

export interface SaleEstimate {
  sellAmount: bigint;
  sellShares: bigint;
}

export interface SalePlan {
  stock: StockToken;
  payAsset: Address;
  priceAtomic: bigint;
  legs: SwapLeg[];
  sellAmount: bigint;
  expectedOut: bigint;
  priceImpactPercent: string | null;
}

export class PlanError extends Error {
  readonly code: "no_price" | "quote_short" | "insufficient_shares" | "route_lost";

  constructor(code: "no_price" | "quote_short" | "insufficient_shares" | "route_lost", message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

export const SALE_BUFFER_BPS = 300;
export const QUOTE_MARGIN_BPS = 150;
export const TWO_LEG_MARGIN_BPS = 300;

function targetFor(priceAtomic: bigint, legs: number): bigint {
  return addBps(priceAtomic, legs === 2 ? TWO_LEG_MARGIN_BPS : QUOTE_MARGIN_BPS);
}

export function estimateSale(params: { priceAtomic: bigint; tokenPriceUsd: string | null; sharesPerToken: bigint }): SaleEstimate {
  if (!params.tokenPriceUsd) throw new PlanError("no_price", "no live token price");
  const price = toUnits(params.tokenPriceUsd, 18);
  if (price === 0n) throw new PlanError("no_price", "token price is zero");
  const sellAmount = addBps(mulDivUp(params.priceAtomic, ONE, price), SALE_BUFFER_BPS);
  return { sellAmount, sellShares: sharesFromTokens(sellAmount, params.sharesPerToken) };
}

export async function planSale(
  trading: TradingApi,
  params: {
    stock: StockToken;
    payAsset: Address;
    priceAtomic: bigint;
    estimate: SaleEstimate;
    outcome: { kind: "swap"; legs: SwapLeg[]; expectedOut: bigint; priceImpactPercent: string | null };
    wallet: Address;
    balance: bigint;
  },
): Promise<SalePlan> {
  let sellAmount = params.estimate.sellAmount;
  let outcome = params.outcome;
  if (sellAmount > params.balance) {
    throw new PlanError("insufficient_shares", `need ${sellAmount} tokens, hold ${params.balance}`);
  }
  const target = targetFor(params.priceAtomic, outcome.legs.length);
  if (outcome.expectedOut < target) {
    if (outcome.expectedOut === 0n) throw new PlanError("quote_short", "route returns nothing");
    sellAmount = addBps(mulDivUp(sellAmount, target, outcome.expectedOut), 100);
    if (sellAmount > params.balance) {
      throw new PlanError("insufficient_shares", `need ${sellAmount} tokens after resizing, hold ${params.balance}`);
    }
    const again = await probeRoute(trading, { stock: params.stock.address, payAsset: params.payAsset, sellAmount, wallet: params.wallet });
    if (again.kind !== "swap") throw new PlanError("route_lost", `route disappeared while resizing: ${again.message}`);
    const againTarget = targetFor(params.priceAtomic, again.legs.length);
    if (again.expectedOut < againTarget) throw new PlanError("quote_short", `quote ${again.expectedOut} is still below ${againTarget}`);
    outcome = again;
  }
  return {
    stock: params.stock,
    payAsset: params.payAsset,
    priceAtomic: params.priceAtomic,
    legs: outcome.legs,
    sellAmount,
    expectedOut: outcome.expectedOut,
    priceImpactPercent: outcome.priceImpactPercent,
  };
}
