import { BinanceApiError } from "@sharepay/core/binance/client";
import { bestSwapRoute, hasRfqRoute, type QuoteRoute, type TradingApi } from "@sharepay/core/binance/trading";
import { getStable } from "@sharepay/core/tokens";
import type { Address } from "viem";

export interface SwapLeg {
  from: Address;
  to: Address;
  amountIn: bigint;
  route: QuoteRoute;
}

export type FailedRouteKind = "rfq_only" | "closed" | "below_min" | "above_max" | "no_liquidity" | "error";

export type RouteOutcome =
  | { kind: "swap"; legs: SwapLeg[]; expectedOut: bigint; priceImpactPercent: string | null }
  | { kind: FailedRouteKind; code: number | null; message: string; minUsd: string | null };

type FailedOutcome = { kind: FailedRouteKind; code: number | null; message: string; minUsd: string | null };

export interface ProbeParams {
  stock: Address;
  payAsset: Address;
  sellAmount: bigint;
  wallet: Address;
}

export function parseMinUsd(message: string): string | null {
  const match = message.match(/(\d+(?:\.\d+)?)/);
  return match?.[1] ?? null;
}

export function classifyQuoteError(error: unknown): FailedOutcome {
  if (error instanceof BinanceApiError) {
    const code = error.code;
    const message = `${code ?? `http ${error.httpStatus}`} ${error.apiMsg}`.trim();
    switch (code) {
      case 40367:
      case 40369:
        return { kind: "closed", code, message, minUsd: null };
      case 40375:
        return { kind: "below_min", code, message, minUsd: parseMinUsd(error.apiMsg) };
      case 40366:
        return { kind: "above_max", code, message, minUsd: null };
      case 40374:
        return { kind: "no_liquidity", code, message, minUsd: null };
      default:
        return { kind: "error", code, message, minUsd: null };
    }
  }
  return { kind: "error", code: null, message: error instanceof Error ? error.message : String(error), minUsd: null };
}

function maxImpact(a: string | null | undefined, b: string | null | undefined): string | null {
  const values = [a, b].filter((v): v is string => typeof v === "string").map(Number).filter((v) => Number.isFinite(v));
  return values.length > 0 ? String(Math.max(...values)) : null;
}

export async function probeRoute(trading: TradingApi, params: ProbeParams): Promise<RouteOutcome> {
  const failures: FailedOutcome[] = [];
  let rfqSeen = false;
  const attempt = async (from: Address, to: Address, amount: bigint, vendor?: "LiquidMesh"): Promise<QuoteRoute | null> => {
    try {
      const routes = await trading.quote({ amount, fromTokenAddress: from, toTokenAddress: to, userWalletAddress: params.wallet, vendor });
      if (hasRfqRoute(routes)) rfqSeen = true;
      return bestSwapRoute(routes);
    } catch (error) {
      failures.push(classifyQuoteError(error));
      return null;
    }
  };

  const direct =
    (await attempt(params.stock, params.payAsset, params.sellAmount)) ??
    (await attempt(params.stock, params.payAsset, params.sellAmount, "LiquidMesh"));
  if (direct) {
    return {
      kind: "swap",
      legs: [{ from: params.stock, to: params.payAsset, amountIn: params.sellAmount, route: direct }],
      expectedOut: BigInt(direct.toTokenAmount),
      priceImpactPercent: direct.priceImpactPercent ?? null,
    };
  }

  const usdt = getStable("USDT").address;
  const first = await attempt(params.stock, usdt, params.sellAmount, "LiquidMesh");
  if (first) {
    const usdtOut = BigInt(first.toTokenAmount);
    const second = await attempt(usdt, params.payAsset, usdtOut, "LiquidMesh");
    if (second) {
      return {
        kind: "swap",
        legs: [
          { from: params.stock, to: usdt, amountIn: params.sellAmount, route: first },
          { from: usdt, to: params.payAsset, amountIn: usdtOut, route: second },
        ],
        expectedOut: BigInt(second.toTokenAmount),
        priceImpactPercent: maxImpact(first.priceImpactPercent, second.priceImpactPercent),
      };
    }
  }

  const specific = failures.find((f) => f.kind === "closed" || f.kind === "below_min" || f.kind === "above_max");
  if (specific) return specific;
  if (rfqSeen) return { kind: "rfq_only", code: null, message: "Only an RFQ route is available", minUsd: null };
  return (
    failures.find((f) => f.kind === "no_liquidity") ??
    failures[0] ?? { kind: "no_liquidity", code: null, message: "No live route right now", minUsd: null }
  );
}
