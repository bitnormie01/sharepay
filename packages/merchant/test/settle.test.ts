import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { createWalletMutex } from "@sharepay/core/chain/txpipeline";
import { describe, expect, it } from "vitest";
import { settlePayment } from "../src/settle.js";
import { studioTxSigner, type StudioWalletLike } from "../src/studioSigner.js";

const MERCHANT = "0x9999999999999999999999999999999999999999";
const U = "0xce24439f2d9c6a2289f741120fe202248b666666";
const HASH = `0x${"ab".repeat(32)}` as const;

function txApi(log: string[]): TransactionApi {
  return {
    simulate: async () => ({ ok: true, status: "SUCCESS", failReason: null, balanceChanges: [], allowanceChanges: [] }),
    gasPrice: async () => 100000000n,
    gasLimit: async () => 90000n,
    broadcast: async (params) => {
      log.push(`broadcast mev=${params.enableMevProtection} from=${params.address} raw=${params.signedTransaction}`);
      return { orderId: "o", txHash: HASH };
    },
  };
}

const chain: ChainReader = {
  balanceOf: async () => 0n,
  allowance: async () => 0n,
  authorizationState: async () => false,
  uiMultiplier: async () => 10n ** 18n,
  nativeBalance: async () => 0n,
  pendingNonce: async () => 3,
  waitForReceipt: async () => ({ status: "success", blockNumber: 1n }),
};

describe("studioTxSigner", () => {
  it("adapts a Studio wallet's signTransaction to the core TxSigner", async () => {
    const seen: unknown[] = [];
    const wallet: StudioWalletLike = {
      address: MERCHANT,
      signTransaction: async (tx) => {
        seen.push(tx);
        return { rawTransaction: "0xf86b01" };
      },
    };
    const signer = studioTxSigner(wallet);
    expect(signer.address).toBe(MERCHANT);
    const raw = await signer.signLegacyTx({ to: U, data: "0xe3ee160e", value: 0n, gas: 108000n, gasPrice: 100000000n, nonce: 3, chainId: 56 });
    expect(raw).toBe("0xf86b01");
    expect(seen[0]).toEqual({ to: U, data: "0xe3ee160e", value: 0n, gas: 108000n, gasPrice: 100000000n, nonce: 3, chainId: 56, type: "legacy" });
  });
});

describe("settlePayment", () => {
  it("sends transferWithAuthorization to the token without MEV protection and returns the tx hash", async () => {
    const log: string[] = [];
    const signer = studioTxSigner({ address: MERCHANT, signTransaction: async () => ({ rawTransaction: "0xf86b02" }) });
    const result = await settlePayment(
      { pipeline: { tx: txApi(log), chain, signer }, mutex: createWalletMutex(), receiptTimeoutMs: 1000 },
      U,
      "0xe3ee160e0000",
    );
    expect(result).toEqual({ txHash: HASH });
    expect(log).toEqual([`broadcast mev=false from=${MERCHANT} raw=0xf86b02`]);
  });

  it("runs settlements one at a time through the wallet mutex", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const signer = studioTxSigner({
      address: MERCHANT,
      signTransaction: async () => {
        calls += 1;
        const mine = calls;
        order.push(`sign-${mine}`);
        if (mine === 1) await gate;
        return { rawTransaction: "0xf86b03" };
      },
    });
    const deps = { pipeline: { tx: txApi([]), chain, signer }, mutex: createWalletMutex(), receiptTimeoutMs: 1000 };
    const first = settlePayment(deps, U, "0x01");
    const second = settlePayment(deps, U, "0x02");
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(["sign-1"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["sign-1", "sign-2"]);
  });
});
