import type { RwaApi, RwaToken } from "@sharepay/core/binance/rwa";
import type { WalletApi } from "@sharepay/core/binance/wallet";
import { getStock } from "@sharepay/core/tokens";
import { describe, expect, it } from "vitest";
import { loadHoldings, loadMarketSnapshot, ratioToMultiplier } from "../src/holdings.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const NVDAB = getStock("NVDAB");
const NVDAON = getStock("NVDAon");
const TSLAB = getStock("TSLAB");

const tokens: RwaToken[] = [
  { binanceChainId: "56", tokenContractAddress: NVDAB.address.toUpperCase().replace("0X", "0x"), platformId: "bstock", tokenSymbol: "NVDAB", tokenToShareRatio: "1.000778", tokenPrice: "168.43", statusInfo: { openState: true, marketStatus: "regular", reasonCode: "TRADING" } },
  { binanceChainId: "56", tokenContractAddress: NVDAON.address, platformId: "ondo", tokenSymbol: "NVDAon", tokenToShareRatio: "1.001715", tokenPrice: "168.90", statusInfo: { openState: false, reasonCode: "MARKET_CLOSED" } },
  { binanceChainId: "1", tokenContractAddress: "0x000000000000000000000000000000000000beef", platformId: "ondo", tokenSymbol: "NVDAon", tokenPrice: "1" },
];

const rwa: RwaApi = {
  tokens: async () => tokens,
  prices: async () => [],
  search: async () => [],
  profile: async () => ({}),
  market: async () => ({}),
};

describe("loadMarketSnapshot", () => {
  it("indexes chain-56 RWA tokens by lowercase address", async () => {
    const snapshot = await loadMarketSnapshot(rwa, 123);
    expect(snapshot.at).toBe(123);
    expect(snapshot.tokens.size).toBe(2);
    expect(snapshot.tokens.get(NVDAB.address)?.tokenSymbol).toBe("NVDAB");
  });
});

describe("ratioToMultiplier", () => {
  it("parses ratios to 1e18 fixed point, defaulting to 1.0", () => {
    expect(ratioToMultiplier("1.000778")).toBe(1000778000000000000n);
    expect(ratioToMultiplier(null)).toBe(10n ** 18n);
    expect(ratioToMultiplier("garbage")).toBe(10n ** 18n);
    expect(ratioToMultiplier("0")).toBe(10n ** 18n);
  });
});

describe("loadHoldings", () => {
  it("reads balances from the Wallet API, multipliers on-chain for bStocks and from RWA for Ondo", async () => {
    const snapshot = await loadMarketSnapshot(rwa, 0);
    const wallet: WalletApi = {
      tokenBalances: async () => [
        { tokenContractAddress: NVDAB.address, rawBalance: "12300000000000000" },
        { tokenContractAddress: NVDAON.address, rawBalance: "5000000000000000" },
        { tokenContractAddress: TSLAB.address, rawBalance: "0" },
      ],
    };
    const holdings = await loadHoldings({ wallet, chain: { balanceOf: async () => 0n, uiMultiplier: async () => 1000778223752807865n } }, OWNER, snapshot);
    expect(holdings.map((h) => h.stock.symbol)).toEqual(["NVDAB", "NVDAon"]);
    expect(holdings[0]).toMatchObject({ balance: 12300000000000000n, priceUsd: "168.43", sharesPerToken: 1000778223752807865n });
    expect(holdings[0]?.status?.marketStatus).toBe("regular");
    expect(holdings[1]).toMatchObject({ balance: 5000000000000000n, priceUsd: "168.90", sharesPerToken: 1001715000000000000n });
  });

  it("falls back to RPC balances when the Wallet API fails, and to the RWA ratio when uiMultiplier fails", async () => {
    const snapshot = await loadMarketSnapshot(rwa, 0);
    const wallet: WalletApi = { tokenBalances: async () => { throw new Error("40304"); } };
    const holdings = await loadHoldings(
      {
        wallet,
        chain: {
          balanceOf: async (token) => (token === NVDAB.address ? 7n : 0n),
          uiMultiplier: async () => { throw new Error("rpc down"); },
        },
      },
      OWNER,
      snapshot,
    );
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ balance: 7n, sharesPerToken: 1000778000000000000n });
  });
});
