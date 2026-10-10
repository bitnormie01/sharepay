import type { QuoteRoute } from "@sharepay/core/binance/trading";
import { getStable, getStock } from "@sharepay/core/tokens";
import { encodePaymentPayload, parseChallenge, selectEip3009Accept } from "@sharepay/core/x402/codec";
import { describe, expect, it } from "vitest";
import type { SalePlan } from "../src/planner.js";
import { createAgenticWallet } from "../src/wallets/agenticWallet.js";
import { BawError, bawCommand, createBawClient, matchOption, type ExecFn } from "../src/wallets/baw.js";
import { SaleError } from "../src/wallets/types.js";

const AW = "0x2222222222222222222222222222222222222222";
const NVDAB = getStock("NVDAB");
const U = getStable("U").address;
const PRICE = 50000000000000000n;

const accept = { scheme: "exact", network: "eip155:56", amount: "100000000000000000", asset: "0xcE24439F2D9C6a2289F741120FE202248B666666", payTo: "0xd10bddc20e4dc42a1a19a9653e994991e25b8153", maxTimeoutSeconds: 600, extra: { name: "United Stables", version: "1", assetTransferMethod: "eip3009", signerAddress: "0x34F7a661160780Ce1346e6D7B96D2bE244590899" } };
const challenge = parseChallenge(null, { x402Version: 2, accepts: [accept], resource: { url: "https://stock-agent.bnbchain.org/x402/analyze/async" } });
const selected = selectEip3009Accept(challenge, { network: "eip155:56", preferredAssets: [U], maxAmount: 10n ** 18n });

function signedHeader(validAfter: string, validBefore: string): string {
  return encodePaymentPayload({
    x402Version: 2,
    accepted: selected.accept,
    payload: { signature: `0x${"aa".repeat(65)}`, authorization: { from: AW, to: accept.payTo, value: accept.amount, validAfter, validBefore, nonce: `0x${"00".repeat(32)}` } },
  });
}

function scriptedExec(handlers: Array<(args: string[]) => unknown>, calls: string[][]): ExecFn {
  let i = 0;
  return async (_file, args) => {
    calls.push(args);
    const handler = handlers[Math.min(i, handlers.length - 1)];
    i += 1;
    if (!handler) throw new Error("no handler");
    return { stdout: JSON.stringify(handler(args), null, 2), stderr: "", code: 0 };
  };
}

describe("bawCommand", () => {
  it("runs JavaScript entries through node and plain binaries directly", () => {
    expect(bawCommand("C:/npm/node_modules/@binance/agentic-wallet/dist/cli.js")).toEqual({ file: process.execPath, prefix: ["C:/npm/node_modules/@binance/agentic-wallet/dist/cli.js"] });
    expect(bawCommand("baw")).toEqual({ file: "baw", prefix: [] });
  });
});

describe("createBawClient", () => {
  it("parses wallet, swap, order and x402 responses", async () => {
    const calls: string[][] = [];
    const client = createBawClient(
      scriptedExec(
        [
          () => ({ success: true, data: { addresses: [{ binanceChainId: "CT_501", chainName: "Solana", address: "So1" }, { binanceChainId: "56", chainName: "BSC", address: AW }] } }),
          () => ({ success: true, data: { status: "CONNECTED" } }),
          () => ({ success: true, data: { orderId: "777" } }),
          () => ({ success: true, data: { total: 1, list: [{ orderId: "777", status: "FINISHED", txHash: "0xabc" }] } }),
          () => ({ success: true, data: { paymentId: "pid", options: [{ index: 1, status: "READY_TO_SIGN", reasons: [], originalAccept: accept }] } }),
          () => ({ success: true, data: { paymentHeaderName: "PAYMENT-SIGNATURE", paymentHeaderValue: "hdr", approveTxHash: null, binanceChainId: null, signatureExpiresAt: 1747900800 } }),
        ],
        calls,
      ),
      "baw",
    );
    expect(await client.address()).toBe(AW);
    expect(await client.walletStatus()).toBe("CONNECTED");
    expect(await client.swap({ fromToken: NVDAB.address, toToken: U, fromTokenQty: "0.000305765006234045" })).toBe("777");
    expect(await client.order("777")).toEqual({ status: "FINISHED", txHash: "0xabc" });
    expect((await client.x402Preview("b64")).options[0]?.status).toBe("READY_TO_SIGN");
    expect(await client.x402Sign("pid", 1)).toEqual({ headerName: "PAYMENT-SIGNATURE", headerValue: "hdr", signatureExpiresAt: 1747900800 });
    expect(calls[2]).toEqual(["market-order", "swap", "--fromTokenQty", "0.000305765006234045", "--fromToken", NVDAB.address, "--toToken", U, "--binanceChainId", "56", "--slippage", "auto", "--mev", "true", "--json"]);
    expect(calls[4]).toEqual(["x402-payment", "preview", "--paymentRequirements", "b64", "--json"]);
    expect(calls[5]).toEqual(["x402-payment", "sign", "--paymentId", "pid", "--selectedIndex", "1", "--json"]);
  });

  it("surfaces CLI failures and non-JSON output as BawError", async () => {
    const failing = createBawClient(scriptedExec([() => ({ success: false, error: "Not signed in" })], []), "baw");
    await expect(failing.walletStatus()).rejects.toThrow("Not signed in");
    const garbage: ExecFn = async () => ({ stdout: "Usage: baw ...", stderr: "", code: 1 });
    await expect(createBawClient(garbage, "baw").address()).rejects.toBeInstanceOf(BawError);
  });

  it("falls back to the recent-orders list when the printed orderId is not listed (live 2026-10-10)", async () => {
    const calls: string[][] = [];
    const listed = {
      orderType: "market",
      orderId: "26101000001955689415",
      chain: "56",
      fromToken: "0x55d398326f99059fF775485246999027B3197955",
      fromTokenName: "USDT",
      fromTokenQty: "2.500000000000000000",
      toToken: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
      toTokenName: "NVDAB",
      toTokenActualQty: "0.010844824172183502",
      status: "FINISHED",
      slippage: "1.0000",
      txHash: "0xcb9a2955dd82873467b5d97125be9e078ce486d64c4e8372cab9bac9172e2a20",
      bookTime: "2026-10-10T23:42:49+05:30",
      updatedTime: "2026-10-10T23:42:50+05:30",
    };
    const tslab = { ...listed, orderId: "26101000001955689591", fromTokenQty: "0.500000000000000000", toToken: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f", toTokenName: "TSLAB" };
    const older = { ...listed, orderId: "26101000001955600000", bookTime: "2026-10-10T22:00:00+05:30", txHash: "0xold" };
    const client = createBawClient(
      scriptedExec(
        [
          () => ({ success: true, data: { orderId: "26101000001955689740" } }),
          () => ({ success: true, data: { total: 0, page: 1, pageSize: 1, list: [] } }),
          () => ({ success: true, data: { total: 3, list: [tslab, listed, older] } }),
          () => ({ success: true, data: { total: 1, list: [listed] } }),
        ],
        calls,
      ),
      "baw",
      { nowMs: () => Date.parse("2026-10-10T18:12:48Z") },
    );
    const id = await client.swap({ fromToken: getStable("USDT").address, toToken: NVDAB.address, fromTokenQty: "2.5" });
    expect(id).toBe("26101000001955689740");
    expect(await client.order(id)).toEqual({ status: "FINISHED", txHash: listed.txHash });
    expect(calls[1]).toEqual(["market-order", "list", "--orderId", "26101000001955689740", "--json"]);
    expect(calls[2]).toEqual(["market-order", "list", "--json"]);
    expect(await client.order(id)).toEqual({ status: "FINISHED", txHash: listed.txHash });
    expect(calls[3]).toEqual(["market-order", "list", "--orderId", "26101000001955689415", "--json"]);
  });

  it("keeps an unlisted order PENDING when nothing in the recent list matches it", async () => {
    const client = createBawClient(
      scriptedExec(
        [
          () => ({ success: true, data: { orderId: "1" } }),
          () => ({ success: true, data: { list: [] } }),
          () => ({ success: true, data: { list: [{ orderId: "2", fromToken: NVDAB.address, toToken: U, fromTokenQty: "9", status: "FINISHED", txHash: "0xother", bookTime: "2026-10-10T18:20:00Z" }] } }),
        ],
        [],
      ),
      "baw",
      { nowMs: () => Date.parse("2026-10-10T18:12:48Z") },
    );
    const id = await client.swap({ fromToken: NVDAB.address, toToken: U, fromTokenQty: "0.000305765006234045" });
    expect(await client.order(id)).toEqual({ status: "PENDING", txHash: null });
  });
});

describe("matchOption", () => {
  it("matches by deep equality first, then by asset + method + amount", () => {
    const options = [
      { index: 1, status: "READY_TO_SIGN", reasons: [], originalAccept: { ...accept, extra: { ...accept.extra, assetTransferMethod: "permit2-exact" } } },
      { index: 2, status: "READY_TO_SIGN", reasons: [], originalAccept: accept },
    ];
    expect(matchOption(options, selected)?.index).toBe(2);
    const loose = [{ index: 3, status: "READY_TO_SIGN", reasons: [], originalAccept: { asset: accept.asset.toLowerCase(), amount: accept.amount, extra: { assetTransferMethod: "eip3009" } } }];
    expect(matchOption(loose, selected)?.index).toBe(3);
    expect(matchOption([{ index: 4, status: "NOT_SIGNABLE", reasons: ["UNSUPPORTED_NETWORK"], originalAccept: null }], selected)).toBeNull();
  });
});

function plan(): SalePlan {
  const route: QuoteRoute = { quoteId: "q", vendorName: "LiquidMesh", toTokenAmount: "51000000000000000", executionMode: "SWAP" };
  return { stock: NVDAB, payAsset: U, priceAtomic: PRICE, legs: [{ from: NVDAB.address, to: U, amountIn: 305765006234045n, route }], sellAmount: 305765006234045n, expectedOut: 51000000000000000n, priceImpactPercent: null };
}

function awWallet(handlers: Array<(args: string[]) => unknown>, calls: string[][], balances: bigint[] = [0n, 51000000000000000n]) {
  let read = 0;
  const sleeps: number[] = [];
  const wallet = createAgenticWallet({
    baw: createBawClient(scriptedExec(handlers, calls), "baw"),
    sim: {
      trading: { quote: async () => [], swap: async () => { throw new Error("unused"); }, approveTransaction: async () => { throw new Error("unused"); } },
      tx: { simulate: async () => { throw new Error("unused"); }, gasPrice: async () => 1n, gasLimit: async () => 1n, broadcast: async () => ({ orderId: null, txHash: "0x" }) },
      chain: { allowance: async () => 0n },
      slippagePercent: "1",
    },
    chain: {
      allowance: async () => 0n,
      balanceOf: async () => {
        const value = balances[Math.min(read, balances.length - 1)] ?? 0n;
        read += 1;
        return value;
      },
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    nowMs: () => 1_800_000_000_000,
    pollMs: 10,
    swapTimeoutMs: 100,
  });
  return { wallet, sleeps };
}

const addressReply = () => ({ success: true, data: { addresses: [{ binanceChainId: "56", chainName: "BSC", address: AW }] } });

describe("createAgenticWallet", () => {
  it("sells through baw market-order swap and polls until FINISHED", async () => {
    const calls: string[][] = [];
    const { wallet } = awWallet(
      [
        addressReply,
        () => ({ success: true, data: { orderId: "9" } }),
        () => ({ success: true, data: { list: [{ orderId: "9", status: "PENDING", txHash: null }] } }),
        () => ({ success: true, data: { list: [{ orderId: "9", status: "FINISHED", txHash: "0xfeed" }] } }),
      ],
      calls,
    );
    const hooks: number[] = [];
    const execution = await wallet.executeSale(plan(), () => hooks.push(calls.length));
    expect(execution).toEqual({ txHashes: ["0xfeed"], received: 51000000000000000n });
    expect(calls[1]?.slice(0, 4)).toEqual(["market-order", "swap", "--fromTokenQty", "0.000305765006234045"]);
    expect(hooks).toEqual([1]);
  });

  it("reports a FAILED AW order as a SaleError", async () => {
    const { wallet } = awWallet(
      [addressReply, () => ({ success: true, data: { orderId: "9" } }), () => ({ success: true, data: { list: [{ orderId: "9", status: "FAILED", txHash: null }] } })],
      [],
    );
    const error = await wallet.executeSale(plan()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaleError);
    expect((error as SaleError).code).toBe("aw_swap_failed");
  });

  it("previews until the matching option is READY_TO_SIGN, signs, and checks the window", async () => {
    const calls: string[][] = [];
    const header = signedHeader("1799999400", "1800000600");
    const { wallet, sleeps } = awWallet(
      [
        () => ({ success: true, data: { paymentId: "p1", options: [{ index: 1, status: "ACTION_REQUIRED", reasons: ["INSUFFICIENT_BALANCE"], originalAccept: accept }] } }),
        () => ({ success: true, data: { paymentId: "p2", options: [{ index: 1, status: "READY_TO_SIGN", reasons: [], originalAccept: accept }] } }),
        () => ({ success: true, data: { paymentHeaderName: "PAYMENT-SIGNATURE", paymentHeaderValue: header, signatureExpiresAt: 1800000600 } }),
      ],
      calls,
    );
    const result = await wallet.signPayment(challenge, selected, 1_800_000_000);
    expect(result).toEqual({ name: "PAYMENT-SIGNATURE", value: header });
    expect(sleeps).toEqual([3000]);
    expect(calls[2]).toEqual(["x402-payment", "sign", "--paymentId", "p2", "--selectedIndex", "1", "--json"]);
  });

  it("stops on NOT_SIGNABLE reasons such as the daily limit", async () => {
    const { wallet } = awWallet([() => ({ success: true, data: { paymentId: "p", options: [{ index: 1, status: "NOT_SIGNABLE", reasons: ["BLOCKED_DAILY_LIMIT_REACHED"], originalAccept: accept }] } })], []);
    const error = await wallet.signPayment(challenge, selected, 1_800_000_000).catch((e: unknown) => e);
    expect((error as SaleError).code).toBe("aw_not_signable");
    expect((error as SaleError).message).toContain("BLOCKED_DAILY_LIMIT_REACHED");
  });
});
