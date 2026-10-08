import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { BinanceClient } from "../src/binance/client.js";
import { createTransactionApi, isSimulationOk } from "../src/binance/transaction.js";
import { createWalletApi } from "../src/binance/wallet.js";

type Recorded = { method: "GET" | "POST"; path: string; payload: unknown };

function fakeClient(dataByPath: Record<string, unknown>, calls: Recorded[]): BinanceClient {
  return {
    async get<T>(path: string, query: Record<string, string | undefined>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
      calls.push({ method: "GET", path, payload: query });
      return schema.parse(dataByPath[path]);
    },
    async post<T>(path: string, body: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
      calls.push({ method: "POST", path, payload: body });
      return schema.parse(dataByPath[path]);
    },
  };
}

const FROM = "0x1111111111111111111111111111111111111111";
const TO = "0xce24439f2d9c6a2289f741120fe202248b666666";

describe("createTransactionApi", () => {
  it("simulates an EVM tx and reports balance/allowance changes", async () => {
    const calls: Recorded[] = [];
    const api = createTransactionApi(
      fakeClient(
        {
          "/api/v1/dex/pre-transaction/simulate": {
            status: "SUCCESS",
            failReason: null,
            balanceChanges: [{ contractAddress: TO, tokenType: "ERC20", change: "-50000000000000000", owner: FROM }],
            allowanceChanges: [],
          },
        },
        calls,
      ),
    );
    const result = await api.simulate({ from: FROM, to: TO, value: 0n, data: "0xe3ee160e" });
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/v1/dex/pre-transaction/simulate",
      payload: { binanceChainId: "56", evmTx: { from: FROM, to: TO, value: "0", data: "0xe3ee160e" } },
    });
    expect(result).toEqual({
      ok: true,
      status: "SUCCESS",
      failReason: null,
      balanceChanges: [{ contractAddress: TO, tokenType: "ERC20", change: "-50000000000000000", owner: FROM }],
      allowanceChanges: [],
    });
  });

  it("treats FAILED or a non-empty failReason as a failed simulation", async () => {
    const api = createTransactionApi(
      fakeClient({ "/api/v1/dex/pre-transaction/simulate": { status: "FAILED", failReason: "ERC20: insufficient allowance" } }, []),
    );
    const result = await api.simulate({ from: FROM, to: TO, value: 0n, data: "0x" });
    expect(result.ok).toBe(false);
    expect(result.failReason).toBe("ERC20: insufficient allowance");
    expect(result.balanceChanges).toEqual([]);
    expect(isSimulationOk("success", null)).toBe(true);
    expect(isSimulationOk(undefined, "reverted")).toBe(false);
    expect(isSimulationOk("FAILED", null)).toBe(false);
  });

  it("reads the medium legacy gas price and the gas limit as bigints", async () => {
    const calls: Recorded[] = [];
    const api = createTransactionApi(
      fakeClient(
        {
          "/api/v1/dex/pre-transaction/gas-price": { evmLegacyGasPrice: { lowGasPrice: "50000000", mediumGasPrice: "100000000", highGasPrice: "150000000" } },
          "/api/v1/dex/pre-transaction/gas-limit": { gasLimit: "84000" },
        },
        calls,
      ),
    );
    expect(await api.gasPrice()).toBe(100000000n);
    expect(await api.gasLimit({ from: FROM, to: TO, value: 0n, data: "0x" })).toBe(84000n);
    expect(calls[0]).toEqual({ method: "GET", path: "/api/v1/dex/pre-transaction/gas-price", payload: { binanceChainId: "56" } });
    expect(calls[1]?.payload).toEqual({ binanceChainId: "56", evmTx: { from: FROM, to: TO, value: "0", data: "0x" } });
  });

  it("broadcasts a signed transaction", async () => {
    const calls: Recorded[] = [];
    const api = createTransactionApi(
      fakeClient({ "/api/v1/dex/pre-transaction/broadcast-transaction": { orderId: "o-1", txHash: "0xhash" } }, calls),
    );
    const result = await api.broadcast({ signedTransaction: "0xf86b", address: FROM, enableMevProtection: true });
    expect(result).toEqual({ orderId: "o-1", txHash: "0xhash" });
    expect(calls[0]?.payload).toEqual({ binanceChainId: "56", signedTransaction: "0xf86b", address: FROM, enableMevProtection: true });
  });
});

describe("createWalletApi", () => {
  it("fetches token balances and flattens tokenAssets", async () => {
    const calls: Recorded[] = [];
    const api = createWalletApi(
      fakeClient(
        {
          "/api/v1/dex/balance/token-balances-by-address": [
            {
              tokenAssets: [
                { binanceChainId: "56", tokenContractAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", symbol: "NVDAB", balance: "0.0123", rawBalance: "12300000000000000", tokenPrice: "168.31", isRiskToken: false },
              ],
            },
          ],
        },
        calls,
      ),
    );
    const assets = await api.tokenBalances(FROM, ["0x02fca66c1d1afb4e2a7884261eb00f63598a7436"]);
    expect(calls[0]?.payload).toEqual({
      address: FROM,
      tokenContractAddresses: [{ binanceChainId: "56", tokenContractAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436" }],
    });
    expect(assets).toEqual([
      { binanceChainId: "56", tokenContractAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", symbol: "NVDAB", balance: "0.0123", rawBalance: "12300000000000000", tokenPrice: "168.31", isRiskToken: false },
    ]);
  });

  it("accepts a single object with tokenAssets and an empty response", async () => {
    const api = createWalletApi(
      fakeClient({ "/api/v1/dex/balance/token-balances-by-address": { tokenAssets: [{ tokenContractAddress: "0xa", rawBalance: "1" }] } }, []),
    );
    expect(await api.tokenBalances(FROM, ["0xa"])).toEqual([{ tokenContractAddress: "0xa", rawBalance: "1" }]);
    const empty = createWalletApi(fakeClient({ "/api/v1/dex/balance/token-balances-by-address": null }, []));
    expect(await empty.tokenBalances(FROM, ["0xa"])).toEqual([]);
  });
});
