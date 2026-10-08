import type { Badge, PickerOption } from "@sharepay/core/dto";
import { formatAmount, formatSignificant, sharesFromTokens, usdValue } from "@sharepay/core/money";
import type { Address } from "viem";
import type { Holding } from "./holdings.js";
import { PlanError, estimateSale, type SaleEstimate } from "./planner.js";
import type { ProbeParams, RouteOutcome } from "./routeProbe.js";
import { classifyStatus, formatUtcShort, type StatusClass, type StatusVerdict } from "./status.js";

export interface OptionInput {
  holding: Holding;
  status: StatusVerdict;
  estimate: SaleEstimate | null;
  outcome: RouteOutcome | null;
}

export function evaluateOption(input: OptionInput): PickerOption {
  const { holding, status, estimate, outcome } = input;
  const sharesHeld = formatSignificant(sharesFromTokens(holding.balance, holding.sharesPerToken), 18, 4);
  const base = {
    tokenAddress: holding.stock.address,
    symbol: holding.stock.symbol,
    name: holding.stock.name,
    platform: holding.stock.platform,
    sharesHeld,
    valueUsd: holding.priceUsd ? usdValue(holding.balance, holding.priceUsd) : "0",
    rank: null,
  };
  const grey = (code: string, message: string): PickerOption => ({ ...base, payable: false, badges: [], reason: { code, message }, plan: null });

  if (status.cls === "hard") return grey(status.code, status.message);
  if (!estimate) return grey("no_price", "No live price for this stock right now");
  if (holding.balance < estimate.sellAmount) {
    return grey("insufficient_shares", `Not enough shares: need ${formatSignificant(estimate.sellShares, 18, 4)}, have ${sharesHeld}`);
  }
  if (!outcome) return grey("no_route", "No live route right now");
  switch (outcome.kind) {
    case "swap": {
      const badges: Badge[] = status.cls === "soft" ? [{ tone: "amber", text: status.message }] : [];
      return {
        ...base,
        payable: true,
        badges,
        reason: null,
        plan: {
          sellTokens: formatSignificant(estimate.sellAmount, 18, 4),
          sellShares: formatSignificant(estimate.sellShares, 18, 4),
          expectedOut: formatAmount(outcome.expectedOut, 18, 4),
          priceImpactPercent: outcome.priceImpactPercent,
          legs: outcome.legs.length === 2 ? 2 : 1,
        },
      };
    }
    case "rfq_only":
      return grey("rfq_only", "Only an RFQ route is available (not used for sub-dollar payments)");
    case "below_min":
      return grey("below_min", outcome.minUsd ? `Below Ondo's minimum order ($${outcome.minUsd})` : "Below the issuer's minimum order");
    case "above_max":
      return grey("above_max", "Above the maximum single order");
    case "closed":
      return grey("closed_no_route", `Market closed and no 24/7 route${status.nextOpenTime ? ` · reopens ${formatUtcShort(status.nextOpenTime)}` : ""}`);
    case "no_liquidity":
      return grey("no_route", "No live route right now");
    case "error":
      return grey("route_error", `No live route (${outcome.message})`);
  }
}

function impactOf(option: PickerOption): number {
  const value = Number(option.plan?.priceImpactPercent ?? "100");
  return Number.isFinite(value) ? value : 100;
}

export function rankOptions(evaluated: Array<{ option: PickerOption; statusCls: StatusClass }>): PickerOption[] {
  const payable = evaluated
    .filter((e) => e.option.payable)
    .sort(
      (a, b) =>
        (a.statusCls === "open" ? 0 : 1) - (b.statusCls === "open" ? 0 : 1) ||
        impactOf(a.option) - impactOf(b.option) ||
        Number(b.option.valueUsd) - Number(a.option.valueUsd) ||
        a.option.symbol.localeCompare(b.option.symbol),
    );
  const greyed = evaluated.filter((e) => !e.option.payable).sort((a, b) => a.option.symbol.localeCompare(b.option.symbol));
  return [...payable.map((e, i) => ({ ...e.option, rank: i + 1 })), ...greyed.map((e) => ({ ...e.option, rank: null }))];
}

export async function computePicker(
  deps: { probe: (params: ProbeParams) => Promise<RouteOutcome> },
  params: { holdings: Holding[]; priceAtomic: bigint; payAsset: Address; wallet: Address },
): Promise<PickerOption[]> {
  const evaluated: Array<{ option: PickerOption; statusCls: StatusClass }> = [];
  for (const holding of params.holdings) {
    const status = classifyStatus(holding.status);
    let estimate: SaleEstimate | null = null;
    let outcome: RouteOutcome | null = null;
    if (status.cls !== "hard") {
      try {
        estimate = estimateSale({ priceAtomic: params.priceAtomic, tokenPriceUsd: holding.priceUsd, sharesPerToken: holding.sharesPerToken });
      } catch (error) {
        if (!(error instanceof PlanError)) throw error;
      }
      if (estimate && holding.balance >= estimate.sellAmount) {
        outcome = await deps.probe({ stock: holding.stock.address, payAsset: params.payAsset, sellAmount: estimate.sellAmount, wallet: params.wallet });
      }
    }
    evaluated.push({ option: evaluateOption({ holding, status, estimate, outcome }), statusCls: status.cls });
  }
  return rankOptions(evaluated);
}
