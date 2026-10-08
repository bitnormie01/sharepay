import { custom, encodeAbiParameters, parseTransaction, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { SimulationResult, TransactionApi } from "../src/binance/transaction.js";
import { createChainReader } from "../src/chain/rpc.js";
import {
  TxFailedError,
  createWalletMutex,
  sendPrepared,
  simulatePrepared,
  viemTxSigner,
  type TxSigner,
} from "../src/chain/txpipeline.js";

const TOKEN = "0xce24439f2d9c6a2289f741120fe202248b666666";
const OWNER = "0x1111111111111111111111111111111111111111";

function uint(value: bigint): Hex {
  return encodeAbiParameters([{ type: "uint256" }], [value]);
}

describe("createChainReader", () => {
  it("reads balances, allowance, authorization state, multiplier, nonce and receipts", async () => {
    let receiptPolls = 0;
    const transport = custom({
      async request({ method, params }: { method: string; params?: unknown }) {
        const list = (params ?? []) as Array<Record<string, string> | string>;
        if (method === "eth_chainId") return "0x38";
        if (method === "eth_call") {
          const call = list[0] as Record<string, string>;
          const selector = (call.data ?? "").slice(0, 10);
          if (selector === "0x70a08231") return uint(50000000000000000n); // balanceOf
          if (selector === "0xdd62ed3e") return uint(123n); // allowance
          if (selector === "0xe94a0102") return uint(1n); // authorizationState -> true
          if (selector === "0xa60bf13d") return uint(1000778223752807865n); // uiMultiplier
          throw new Error(`unexpected selector ${selector}`);
        }
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        if (method === "eth_getTransactionCount") {
          expect(list[1]).toBe("pending");
          return "0x7";
        }
        if (method === "eth_getTransactionReceipt") {
          receiptPolls += 1;
          if (receiptPolls < 2) return null;
          return { status: "0x1", blockNumber: "0x10" };
        }
        throw new Error(`unexpected method ${method}`);
      },
    });
    const chain = createChainReader({ transport, pollMs: 1 });
    expect(await chain.balanceOf(TOKEN, OWNER)).toBe(50000000000000000n);
    expect(await chain.allowance(TOKEN, OWNER, OWNER)).toBe(123n);
    expect(await chain.authorizationState(TOKEN, OWNER, `0x${"00".repeat(32)}`)).toBe(true);
    expect(await chain.uiMultiplier(TOKEN)).toBe(1000778223752807865n);
    expect(await chain.nativeBalance(OWNER)).toBe(10n ** 18n);
    expect(await chain.pendingNonce(OWNER)).toBe(7);
    expect(await chain.waitForReceipt(`0x${"ab".repeat(32)}`, 1000)).toEqual({ status: "success", blockNumber: 16n });
    expect(receiptPolls).toBe(2);
  });

  it("times out when no receipt appears", async () => {
    const transport = custom({
      async request({ method }: { method: string }) {
        if (method === "eth_chainId") return "0x38";
        if (method === "eth_getTransactionReceipt") return null;
        throw new Error(method);
      },
    });
    const chain = createChainReader({ transport, pollMs: 1 });
    await expect(chain.waitForReceipt(`0x${"cd".repeat(32)}`, 5)).rejects.toThrow("receipt timeout");
  });
});

function fakeTxApi(overrides: Partial<TransactionApi>, log: string[]): TransactionApi {
  const ok: SimulationResult = { ok: true, status: "SUCCESS", failReason: null, balanceChanges: [], allowanceChanges: [] };
  return {
    simulate: async () => {
      log.push("simulate");
      return ok;
    },
    gasPrice: async () => {
      log.push("gasPrice");
      return 100000000n;
    },
    gasLimit: async () => {
      log.push("gasLimit");
      return 100000n;
    },
    broadcast: async (params) => {
      log.push(`broadcast:${params.enableMevProtection}`);
      return { orderId: "o1", txHash: `0x${"ee".repeat(32)}` };
    },
    ...overrides,
  };
}

function fakeChain(status: "success" | "reverted") {
  return {
    balanceOf: async () => 0n,
    allowance: async () => 0n,
    authorizationState: async () => false,
    uiMultiplier: async () => 10n ** 18n,
    nativeBalance: async () => 0n,
    pendingNonce: async () => 4,
    waitForReceipt: async () => ({ status, blockNumber: 1n }),
  };
}

describe("tx pipeline", () => {
  it("simulates from the given address", async () => {
    const seen: unknown[] = [];
    const api = fakeTxApi({ simulate: async (tx) => { seen.push(tx); return { ok: false, status: "FAILED", failReason: "x", balanceChanges: [], allowanceChanges: [] }; } }, []);
    const result = await simulatePrepared(api, OWNER, { to: TOKEN, data: "0x1234", value: 0n });
    expect(result.ok).toBe(false);
    expect(seen[0]).toEqual({ from: OWNER, to: TOKEN, value: 0n, data: "0x1234" });
  });

  it("signs a legacy tx with buffered gas and the pending nonce, then broadcasts and waits", async () => {
    const log: string[] = [];
    const signed: unknown[] = [];
    const signer: TxSigner = {
      address: OWNER,
      signLegacyTx: async (tx) => {
        signed.push(tx);
        return "0xf86b";
      },
    };
    const result = await sendPrepared(
      { tx: fakeTxApi({}, log), chain: fakeChain("success"), signer },
      { to: TOKEN, data: "0xabcd", value: 0n },
      { mevProtection: true, receiptTimeoutMs: 1000, gasFallback: 150000n },
    );
    expect(result.txHash).toBe(`0x${"ee".repeat(32)}`);
    expect(signed[0]).toEqual({ to: TOKEN, data: "0xabcd", value: 0n, gas: 120000n, gasPrice: 100000000n, nonce: 4, chainId: 56 });
    expect(log).toEqual(["gasPrice", "gasLimit", "broadcast:true"]);
  });

  it("falls back to the configured gas when estimation fails, and throws on revert", async () => {
    const signed: Array<{ gas: bigint }> = [];
    const signer: TxSigner = {
      address: OWNER,
      signLegacyTx: async (tx) => {
        signed.push(tx);
        return "0xf86b";
      },
    };
    const api = fakeTxApi({ gasLimit: async () => { throw new Error("estimate failed"); } }, []);
    const error = await sendPrepared(
      { tx: api, chain: fakeChain("reverted"), signer },
      { to: TOKEN, data: "0x", value: 0n },
      { mevProtection: false, receiptTimeoutMs: 1000, gasFallback: 150000n },
    ).catch((e: unknown) => e);
    expect(signed[0]?.gas).toBe(150000n);
    expect(error).toBeInstanceOf(TxFailedError);
    expect((error as TxFailedError).stage).toBe("receipt");
    expect((error as TxFailedError).txHash).toBe(`0x${"ee".repeat(32)}`);
  });

  it("serializes work through the wallet mutex", async () => {
    const mutex = createWalletMutex();
    const order: string[] = [];
    const slow = mutex(async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a-end");
      return 1;
    });
    const fast = mutex(async () => {
      order.push("b");
      return 2;
    });
    await expect(Promise.all([slow, fast])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
    await expect(mutex(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(mutex(async () => 3)).resolves.toBe(3);
  });

  it("signs legacy BSC transactions with a viem account", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signer = viemTxSigner(account);
    const raw = await signer.signLegacyTx({ to: TOKEN, data: "0x", value: 0n, gas: 21000n, gasPrice: 100000000n, nonce: 0, chainId: 56 });
    const parsed = parseTransaction(raw);
    expect(parsed.type).toBe("legacy");
    expect(parsed.chainId).toBe(56);
    expect(signer.address).toBe(account.address);
  });
});
