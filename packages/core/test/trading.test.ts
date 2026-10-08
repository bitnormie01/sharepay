import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { BinanceClient } from "../src/binance/client.js";
import { bestSwapRoute, createTradingApi, hasRfqRoute, type QuoteRoute } from "../src/binance/trading.js";

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
const U = "0xce24439f2d9c6a2289f741120fe202248b666666";
const WALLET = "0x1111111111111111111111111111111111111111";

describe("createTradingApi", () => {
  it("quotes with base-unit amounts and optional vendor / wallet", async () => {
    const calls: Recorded[] = [];
    const api = createTradingApi(
      fakeClient(
        {
          "/api/v1/dex/aggregator/quote": [
            { quoteId: "q1", vendorName: "LiquidMesh", toTokenAmount: "51000000000000000", priceImpactPercent: "0.12", executionMode: "SWAP", approveTarget: "0xb44446b0c8e56988c34f7ff73ae904982b5fdda5" },
            { quoteId: "q2", vendorName: "PcsXRfq", toTokenAmount: "52000000000000000", executionMode: "RFQ" },
          ],
        },
        calls,
      ),
    );
    const routes = await api.quote({ amount: 300000000000000n, fromTokenAddress: NVDAB, toTokenAddress: U, vendor: "LiquidMesh" });
    expect(calls[0]).toEqual({
      path: "/api/v1/dex/aggregator/quote",
      query: { binanceChainId: "56", amount: "300000000000000", fromTokenAddress: NVDAB, toTokenAddress: U, userWalletAddress: undefined, vendor: "LiquidMesh" },
    });
    expect(routes).toHaveLength(2);
    expect(bestSwapRoute(routes)?.quoteId).toBe("q1");
    expect(hasRfqRoute(routes)).toBe(true);
  });

  it("builds swaps with quoteId, slippage and wallet", async () => {
    const calls: Recorded[] = [];
    const api = createTradingApi(
      fakeClient(
        {
          "/api/v1/dex/aggregator/swap": {
            executionMode: "SWAP",
            tx: { from: WALLET, to: "0xb44446b0c8e56988c34f7ff73ae904982b5fdda5", data: "0xabcdef", value: "0", gas: "250000", gasPrice: "100000000", minReceiveAmount: "50500000000000000" },
            routerResult: { vendorName: "LiquidMesh", toTokenAmount: "51000000000000000", priceImpactPercent: "0.12" },
          },
        },
        calls,
      ),
    );
    const build = await api.swap({ amount: 300000000000000n, fromTokenAddress: NVDAB, toTokenAddress: U, userWalletAddress: WALLET, quoteId: "q1", slippagePercent: "1" });
    expect(calls[0]?.query).toEqual({
      binanceChainId: "56",
      amount: "300000000000000",
      fromTokenAddress: NVDAB,
      toTokenAddress: U,
      slippagePercent: "1",
      userWalletAddress: WALLET,
      quoteId: "q1",
    });
    expect(build.tx?.minReceiveAmount).toBe("50500000000000000");
    expect(build.executionMode).toBe("SWAP");
  });

  it("builds approve transactions with an optional equity vendor", async () => {
    const calls: Recorded[] = [];
    const api = createTradingApi(
      fakeClient(
        { "/api/v1/dex/aggregator/approve-transaction": { data: "0x095ea7b3", dexContractAddress: "0xb44446b0c8e56988c34f7ff73ae904982b5fdda5", gasLimit: "60000", gasPrice: "100000000" } },
        calls,
      ),
    );
    const approve = await api.approveTransaction({ tokenContractAddress: NVDAB, approveAmount: 10n ** 30n, vendor: "LiquidMesh" });
    expect(calls[0]?.query).toEqual({ binanceChainId: "56", tokenContractAddress: NVDAB, approveAmount: "1000000000000000000000000000000", vendor: "LiquidMesh" });
    expect(approve.dexContractAddress).toBe("0xb44446b0c8e56988c34f7ff73ae904982b5fdda5");
  });
});

describe("route helpers", () => {
  const routes: QuoteRoute[] = [
    { quoteId: "a", toTokenAmount: "100", executionMode: "swap" },
    { quoteId: "b", toTokenAmount: "300", executionMode: "SWAP" },
    { quoteId: "c", toTokenAmount: "900", executionMode: "RFQ" },
  ];
  it("picks the SWAP route with the highest output, case-insensitively", () => {
    expect(bestSwapRoute(routes)?.quoteId).toBe("b");
    expect(bestSwapRoute([{ quoteId: "r", toTokenAmount: "1", executionMode: "RFQ" }])).toBeNull();
    expect(bestSwapRoute([])).toBeNull();
  });
  it("detects RFQ routes", () => {
    expect(hasRfqRoute(routes)).toBe(true);
    expect(hasRfqRoute([routes[0] as QuoteRoute])).toBe(false);
  });
});
