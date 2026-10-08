import type { QuoteRoute } from "@sharepay/core/binance/trading";
import type { PickerOption } from "@sharepay/core/dto";
import { getStable, getStock } from "@sharepay/core/tokens";
import { describe, expect, it } from "vitest";
import type { Holding } from "../src/holdings.js";
import { computePicker, evaluateOption, rankOptions } from "../src/picker.js";
import type { ProbeParams, RouteOutcome } from "../src/routeProbe.js";
import { classifyStatus } from "../src/status.js";

const U = getStable("U").address;
const WALLET = "0x1111111111111111111111111111111111111111";
const PRICE = 50000000000000000n;
const MON = Date.UTC(2026, 9, 12, 13, 30);

function holding(symbol: string, balance: bigint, priceUsd: string | null, status: Holding["status"]): Holding {
  return { stock: getStock(symbol), balance, priceUsd, sharesPerToken: 10n ** 18n, status };
}

const OPEN = { openState: true, marketStatus: "regular", reasonCode: "TRADING" };
const CLOSED = { openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: MON };

function swapOutcome(impact: string | null, legs: 1 | 2 = 1): RouteOutcome {
  const route: QuoteRoute = { quoteId: "q", toTokenAmount: "51000000000000000", executionMode: "SWAP", priceImpactPercent: impact };
  const leg = { from: getStock("NVDAB").address, to: U, amountIn: 1n, route };
  return { kind: "swap", legs: legs === 2 ? [leg, leg] : [leg], expectedOut: 51000000000000000n, priceImpactPercent: impact };
}

const estimate = { sellAmount: 305765006234045n, sellShares: 305765006234045n };

describe("evaluateOption", () => {
  it("makes an open stock with a SWAP route payable with a sale plan", () => {
    const option = evaluateOption({ holding: holding("NVDAB", 12300000000000000n, "168.43", OPEN), status: classifyStatus(OPEN), estimate, outcome: swapOutcome("0.1") });
    expect(option).toEqual({
      tokenAddress: getStock("NVDAB").address,
      symbol: "NVDAB",
      name: "NVIDIA",
      platform: "bstock",
      sharesHeld: "0.0123",
      valueUsd: "2.07",
      payable: true,
      rank: null,
      badges: [],
      reason: null,
      plan: { sellTokens: "0.0003057", sellShares: "0.0003057", expectedOut: "0.051", priceImpactPercent: "0.1", legs: 1 },
    });
  });

  it("keeps a closed bStock payable with an amber badge when a SWAP route exists", () => {
    const option = evaluateOption({ holding: holding("NVDAB", 10n ** 16n, "168.43", CLOSED), status: classifyStatus(CLOSED), estimate, outcome: swapOutcome("0.2", 2) });
    expect(option.payable).toBe(true);
    expect(option.badges).toEqual([{ tone: "amber", text: "Market closed (Weekend or Holiday) · reopens Mon 13:30 UTC" }]);
    expect(option.plan?.legs).toBe(2);
  });

  it.each<[string, Parameters<typeof evaluateOption>[0], { code: string; message: string }]>([
    ["hard status", { holding: holding("TSLAB", 10n ** 16n, "250", { openState: false, reasonCode: "ASSET_PAUSED", reasonMsg: "stock_split" }), status: classifyStatus({ openState: false, reasonCode: "ASSET_PAUSED", reasonMsg: "stock_split" }), estimate, outcome: swapOutcome("0.1") }, { code: "asset_paused", message: "Paused: stock split" }],
    ["no price", { holding: holding("NVDAB", 10n ** 16n, null, OPEN), status: classifyStatus(OPEN), estimate: null, outcome: null }, { code: "no_price", message: "No live price for this stock right now" }],
    ["too few shares", { holding: holding("NVDAB", 1000n, "168.43", OPEN), status: classifyStatus(OPEN), estimate, outcome: null }, { code: "insufficient_shares", message: "Not enough shares: need 0.0003057, have 0.000000000000001" }],
    ["rfq only", { holding: holding("NVDAon", 10n ** 16n, "168.9", OPEN), status: classifyStatus(OPEN), estimate, outcome: { kind: "rfq_only", code: null, message: "Only an RFQ route is available", minUsd: null } }, { code: "rfq_only", message: "Only an RFQ route is available (not used for sub-dollar payments)" }],
    ["below min", { holding: holding("NVDAon", 10n ** 16n, "168.9", OPEN), status: classifyStatus(OPEN), estimate, outcome: { kind: "below_min", code: 40375, message: "40375 x", minUsd: "5" } }, { code: "below_min", message: "Below Ondo's minimum order ($5)" }],
    ["above max", { holding: holding("NVDAon", 10n ** 16n, "168.9", OPEN), status: classifyStatus(OPEN), estimate, outcome: { kind: "above_max", code: 40366, message: "40366 x", minUsd: null } }, { code: "above_max", message: "Above the maximum single order" }],
    ["closed, no 24/7 route", { holding: holding("NVDAon", 10n ** 16n, "168.9", CLOSED), status: classifyStatus(CLOSED), estimate, outcome: { kind: "closed", code: 40367, message: "40367 x", minUsd: null } }, { code: "closed_no_route", message: "Market closed and no 24/7 route · reopens Mon 13:30 UTC" }],
    ["no liquidity", { holding: holding("NVDAB", 10n ** 16n, "168.43", OPEN), status: classifyStatus(OPEN), estimate, outcome: { kind: "no_liquidity", code: null, message: "x", minUsd: null } }, { code: "no_route", message: "No live route right now" }],
    ["api error", { holding: holding("NVDAB", 10n ** 16n, "168.43", OPEN), status: classifyStatus(OPEN), estimate, outcome: { kind: "error", code: 50000, message: "50000 internal", minUsd: null } }, { code: "route_error", message: "No live route (50000 internal)" }],
  ])("greys out: %s", (_name, input, reason) => {
    const option = evaluateOption(input);
    expect(option.payable).toBe(false);
    expect(option.plan).toBeNull();
    expect(option.reason).toEqual(reason);
  });
});

describe("rankOptions", () => {
  it("ranks open before soft, then lower price impact, then larger holdings; greyed options last by symbol", () => {
    const base = (symbol: string, payable: boolean, impact: string | null, valueUsd: string): PickerOption => ({
      tokenAddress: symbol, symbol, name: symbol, platform: "bstock", sharesHeld: "1", valueUsd, payable, rank: null, badges: [], reason: payable ? null : { code: "x", message: "x" },
      plan: payable ? { sellTokens: "1", sellShares: "1", expectedOut: "1", priceImpactPercent: impact, legs: 1 } : null,
    });
    const ranked = rankOptions([
      { option: base("SOFT", true, "0.01", "9"), statusCls: "soft" },
      { option: base("OPEN_HI", true, "0.5", "9"), statusCls: "open" },
      { option: base("OPEN_LO", true, "0.1", "1"), statusCls: "open" },
      { option: base("OPEN_LO_BIG", true, "0.1", "5"), statusCls: "open" },
      { option: base("ZGREY", false, null, "9"), statusCls: "hard" },
      { option: base("AGREY", false, null, "9"), statusCls: "open" },
    ]);
    expect(ranked.map((o) => [o.symbol, o.rank])).toEqual([
      ["OPEN_LO_BIG", 1],
      ["OPEN_LO", 2],
      ["OPEN_HI", 3],
      ["SOFT", 4],
      ["AGREY", null],
      ["ZGREY", null],
    ]);
  });
});

describe("computePicker", () => {
  it("skips probes for hard-stopped stocks and ranks the rest", async () => {
    const probes: ProbeParams[] = [];
    const options = await computePicker(
      {
        probe: async (params) => {
          probes.push(params);
          return swapOutcome("0.1");
        },
      },
      {
        holdings: [
          holding("NVDAB", 12300000000000000n, "168.43", OPEN),
          holding("TSLAB", 10n ** 16n, "250", { openState: false, reasonCode: "MARKET_MAINTENANCE" }),
          holding("AAPLB", 10n ** 16n, null, OPEN),
        ],
        priceAtomic: PRICE,
        payAsset: U,
        wallet: WALLET,
      },
    );
    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({ stock: getStock("NVDAB").address, payAsset: U, sellAmount: 305765006234045n, wallet: WALLET });
    expect(options.map((o) => [o.symbol, o.payable, o.rank])).toEqual([
      ["NVDAB", true, 1],
      ["AAPLB", false, null],
      ["TSLAB", false, null],
    ]);
  });
});
