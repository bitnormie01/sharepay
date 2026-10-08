import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { BinanceClient } from "../src/binance/client.js";
import { createRwaApi, protectionLinks } from "../src/binance/rwa.js";

type Recorded = { path: string; query: Record<string, string | undefined> };

function fakeClient(dataByPath: Record<string, unknown>, calls: Recorded[]): BinanceClient {
  return {
    async get<T>(path: string, query: Record<string, string | undefined>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
      calls.push({ path, query });
      return schema.parse(dataByPath[path]);
    },
    async post<T>(): Promise<T> {
      throw new Error("not used");
    },
  };
}

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";

describe("createRwaApi", () => {
  it("lists RWA tokens on chain 56 with statusInfo and ratios (array or wrapped list)", async () => {
    const calls: Recorded[] = [];
    const api = createRwaApi(
      fakeClient(
        {
          "/api/v1/dex/market/rwa/tokens": {
            list: [
              {
                binanceChainId: "56",
                tokenContractAddress: NVDAB,
                platformId: "bstock",
                tokenSymbol: "NVDAB",
                tokenToShareRatio: "1.000778",
                tokenPrice: "168.43",
                statusInfo: { openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: "1791206400000" },
                extraField: 1,
              },
            ],
          },
        },
        calls,
      ),
    );
    const tokens = await api.tokens({ platformId: "bstock" });
    expect(calls[0]).toEqual({ path: "/api/v1/dex/market/rwa/tokens", query: { binanceChainId: "56", platformId: "bstock" } });
    expect(tokens[0]?.tokenSymbol).toBe("NVDAB");
    expect(tokens[0]?.statusInfo?.nextOpenTime).toBe(1791206400000);
    expect(tokens[0]?.statusInfo?.reasonMsg).toBe("Weekend or Holiday");
  });

  it("batches prices, rejecting more than 100 addresses and skipping empty input", async () => {
    const calls: Recorded[] = [];
    const api = createRwaApi(
      fakeClient({ "/api/v1/dex/market/rwa/price": [{ tokenContractAddress: NVDAB, tokenPrice: "168.43", referencePrice: "168.30" }] }, calls),
    );
    expect(await api.prices([])).toEqual([]);
    const prices = await api.prices([NVDAB, "0xa9ee28c80f960b889dfbd1902055218cba016f75"]);
    expect(calls[0]?.query.tokenContractAddresses).toBe(`${NVDAB},0xa9ee28c80f960b889dfbd1902055218cba016f75`);
    expect(prices[0]?.tokenPrice).toBe("168.43");
    await expect(api.prices(Array.from({ length: 101 }, () => NVDAB))).rejects.toThrow("at most 100");
  });

  it("parses search, underlying profile and underlying market", async () => {
    const calls: Recorded[] = [];
    const api = createRwaApi(
      fakeClient(
        {
          "/api/v1/dex/market/rwa/search": [
            { ticker: "NVDA", companyName: "NVIDIA Corp", assets: [{ platformId: "bstock", binanceChainId: "56", tokenContractAddress: NVDAB, tokenSymbol: "NVDAB", assetType: 1 }] },
          ],
          "/api/v1/dex/market/rwa/underlying-profile": {
            tokenContractAddress: NVDAB,
            underlyingTicker: "NVDA",
            tokenToShareRatio: "1.000778",
            protections: { dailyAttestationReport: { supported: true, url: "https://example.com/daily.pdf" } },
            companyInfo: { ceo: "Jensen Huang", website: "https://www.nvidia.com", industry: "Semiconductors", conceptsEn: ["AI Chips"], descriptionEn: "GPUs." },
          },
          "/api/v1/dex/market/rwa/underlying-market": {
            statusInfo: { openState: true, marketStatus: "regular", reasonCode: "TRADING" },
            marketData: { referencePrice: "168.30", high52W: "212.19", low52W: "86.62", marketCap: "4100000000000", peRatioTTM: "48.2" },
          },
        },
        calls,
      ),
    );
    const results = await api.search("NVDA");
    expect(results[0]?.assets[0]?.tokenSymbol).toBe("NVDAB");
    const profile = await api.profile(NVDAB);
    expect(profile.companyInfo?.ceo).toBe("Jensen Huang");
    const market = await api.market(NVDAB);
    expect(market.marketData?.high52W).toBe("212.19");
    expect(calls.map((c) => c.path)).toEqual([
      "/api/v1/dex/market/rwa/search",
      "/api/v1/dex/market/rwa/underlying-profile",
      "/api/v1/dex/market/rwa/underlying-market",
    ]);
    expect(calls[1]?.query).toEqual({ binanceChainId: "56", tokenContractAddress: NVDAB });
  });

  it("extracts supported protection report links", () => {
    expect(
      protectionLinks({
        dailyAttestationReport: { supported: true, url: "https://a/daily" },
        monthlyAttestationReport: { supported: false, url: "https://a/monthly" },
        collateralReport: { supported: true, link: "https://a/collateral" },
        weird: "not-an-object",
      }),
    ).toEqual([
      { name: "Daily attestation report", url: "https://a/daily" },
      { name: "Collateral report", url: "https://a/collateral" },
    ]);
    expect(protectionLinks(null)).toEqual([]);
  });
});
