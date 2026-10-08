import type { QuoteRoute, TradingApi } from "@sharepay/core/binance/trading";
import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { createWalletMutex } from "@sharepay/core/chain/txpipeline";
import { AGGREGATION_ROUTER, getStable, getStock } from "@sharepay/core/tokens";
import { decodePaymentPayload, parseChallenge, selectEip3009Accept } from "@sharepay/core/x402/codec";
import { domainForStable, recoverAuthorizationSigner } from "@sharepay/core/x402/eip3009";
import { parseTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { SalePlan } from "../src/planner.js";
import { createApiSignerWallet } from "../src/wallets/apiSigner.js";
import { simulateFirstLeg } from "../src/wallets/simulate.js";
import { SaleError } from "../src/wallets/types.js";

const NVDAB = getStock("NVDAB");
const U = getStable("U").address;
const USDT = getStable("USDT").address;
const PRICE = 50000000000000000n;

function route(toTokenAmount = "51000000000000000"): QuoteRoute {
  return { quoteId: "q", vendorName: "LiquidMesh", toTokenAmount, executionMode: "SWAP", priceImpactPercent: "0.1", approveTarget: AGGREGATION_ROUTER };
}

function plan(legs: 1 | 2 = 1): SalePlan {
  const first = { from: NVDAB.address, to: legs === 2 ? USDT : U, amountIn: 305765006234045n, route: route() };
  const second = { from: USDT, to: U, amountIn: 51000000000000000n, route: route() };
  return { stock: NVDAB, payAsset: U, priceAtomic: PRICE, legs: legs === 2 ? [first, second] : [first], sellAmount: 305765006234045n, expectedOut: 51000000000000000n, priceImpactPercent: "0.1" };
}

function world(options: { allowance?: bigint; minReceive?: string; approveSpender?: string; simulateOk?: boolean } = {}) {
  const account = privateKeyToAccount(generatePrivateKey());
  const balances = new Map<string, bigint>();
  let allowance = options.allowance ?? 10n ** 30n;
  const broadcasts: string[] = [];
  const simulated: string[] = [];
  const swapsBuilt: string[] = [];
  const chain: ChainReader = {
    balanceOf: async (token) => balances.get(token.toLowerCase()) ?? 0n,
    allowance: async () => allowance,
    authorizationState: async () => false,
    uiMultiplier: async () => 10n ** 18n,
    nativeBalance: async () => 0n,
    pendingNonce: async () => 0,
    waitForReceipt: async () => ({ status: "success", blockNumber: 1n }),
  };
  const tx: TransactionApi = {
    simulate: async (input) => {
      simulated.push(input.data);
      const ok = options.simulateOk ?? true;
      return { ok, status: ok ? "SUCCESS" : "FAILED", failReason: ok ? null : "ERC20: transfer amount exceeds balance", balanceChanges: [{ contractAddress: NVDAB.address, change: "-305765006234045", owner: account.address }], allowanceChanges: [] };
    },
    gasPrice: async () => 100000000n,
    gasLimit: async () => 200000n,
    broadcast: async ({ signedTransaction }) => {
      const parsed = parseTransaction(signedTransaction as `0x${string}`);
      broadcasts.push(parsed.data ?? "0x");
      if (parsed.data === "0x5a01") balances.set(U, (balances.get(U) ?? 0n) + 51000000000000000n);
      if (parsed.data === "0x5a02") balances.set(USDT, (balances.get(USDT) ?? 0n) + 51000000000000000n);
      if (parsed.data === "0xa1") allowance = 10n ** 30n;
      return { orderId: "o", txHash: `0x${broadcasts.length.toString(16).padStart(64, "0")}` };
    },
  };
  const trading: TradingApi = {
    quote: async () => [route()],
    swap: async (params) => {
      swapsBuilt.push(`${params.fromTokenAddress}->${params.toTokenAddress}:${params.amount}`);
      return {
        executionMode: "SWAP",
        tx: { to: AGGREGATION_ROUTER, data: params.toTokenAddress.toLowerCase() === U ? "0x5a01" : "0x5a02", value: "0", minReceiveAmount: options.minReceive ?? "50500000000000000" },
      };
    },
    approveTransaction: async () => ({ data: "0xa1", dexContractAddress: options.approveSpender ?? AGGREGATION_ROUTER }),
  };
  const wallet = createApiSignerWallet({ trading, tx, chain, account, mutex: createWalletMutex(), slippagePercent: "1", receiptTimeoutMs: 1000 });
  return { account, wallet, broadcasts, simulated, swapsBuilt, trading, tx, chain };
}

describe("simulateFirstLeg", () => {
  it("simulates the real swap when the allowance is in place", async () => {
    const w = world();
    const result = await simulateFirstLeg({ trading: w.trading, tx: w.tx, chain: w.chain, slippagePercent: "1" }, w.account.address, plan());
    expect(result).toMatchObject({ ok: true, mode: "swap", failReason: null });
    expect(result.detail.balanceChanges).toContain("-305765006234045");
    expect(w.simulated).toEqual(["0x5a01"]);
  });

  it("simulates only the approval when the allowance is short", async () => {
    const w = world({ allowance: 0n });
    const result = await simulateFirstLeg({ trading: w.trading, tx: w.tx, chain: w.chain, slippagePercent: "1" }, w.account.address, plan());
    expect(result).toMatchObject({ ok: true, mode: "approve_only" });
    expect(result.detail.note).toBe("The swap can be simulated after the approval lands");
    expect(w.simulated).toEqual(["0xa1"]);
  });

  it("refuses an approval for a different spender", async () => {
    const w = world({ allowance: 0n, approveSpender: "0x0000000000000000000000000000000000000bad" });
    const result = await simulateFirstLeg({ trading: w.trading, tx: w.tx, chain: w.chain, slippagePercent: "1" }, w.account.address, plan());
    expect(result.ok).toBe(false);
    expect(result.failReason).toContain("does not match route spender");
  });
});

describe("createApiSignerWallet", () => {
  it("sells through one SWAP leg and reports the stablecoin received", async () => {
    const w = world();
    expect(await w.wallet.address()).toBe(w.account.address);
    const hooks: number[] = [];
    const execution = await w.wallet.executeSale(plan(), () => hooks.push(w.broadcasts.length));
    expect(w.broadcasts).toEqual(["0x5a01"]);
    expect(hooks).toEqual([0]);
    expect(execution.received).toBe(51000000000000000n);
    expect(execution.txHashes).toHaveLength(1);
  });

  it("approves first when needed and runs both legs of a two-leg plan", async () => {
    const w = world({ allowance: 0n });
    const hooks: number[] = [];
    const execution = await w.wallet.executeSale(plan(2), () => hooks.push(w.broadcasts.length));
    expect(w.broadcasts).toEqual(["0xa1", "0x5a02", "0x5a01"]);
    expect(hooks).toEqual([0, 1, 2]);
    expect(w.swapsBuilt[1]).toBe(`${USDT}->${U}:51000000000000000`);
    expect(execution.txHashes).toHaveLength(3);
  });

  it("refuses a final leg whose minimum receive is below the price", async () => {
    const w = world({ minReceive: "40000000000000000" });
    const hooks: number[] = [];
    const error = await w.wallet.executeSale(plan(), () => hooks.push(w.broadcasts.length)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaleError);
    expect((error as SaleError).code).toBe("price_moved");
    expect(w.broadcasts).toEqual([]);
    expect(hooks).toEqual([]);
  });

  it("refuses to broadcast a swap whose simulation fails", async () => {
    const w = world({ simulateOk: false });
    const hooks: number[] = [];
    const error = await w.wallet.executeSale(plan(), () => hooks.push(w.broadcasts.length)).catch((e: unknown) => e);
    expect((error as SaleError).code).toBe("simulation_failed");
    expect(w.broadcasts).toEqual([]);
    expect(hooks).toEqual([]);
  });

  it("signs an EIP-3009 payment header with the registry domain", async () => {
    const w = world();
    const challenge = parseChallenge(null, {
      x402Version: 2,
      resource: { url: "https://m/x" },
      accepts: [{ scheme: "exact", network: "eip155:56", amount: "50000000000000000", asset: U, payTo: "0x9999999999999999999999999999999999999999", maxTimeoutSeconds: 300, extra: { name: "United Stables", version: "1", assetTransferMethod: "eip3009" } }],
    });
    const selected = selectEip3009Accept(challenge, { network: "eip155:56", preferredAssets: [U], maxAmount: 10n ** 18n });
    const header = await w.wallet.signPayment(challenge, selected, 1_800_000_000);
    expect(header.name).toBe("PAYMENT-SIGNATURE");
    const payload = decodePaymentPayload(header.value);
    expect(payload.payload.authorization).toMatchObject({ from: w.account.address, to: "0x9999999999999999999999999999999999999999", value: "50000000000000000", validAfter: "1799999400", validBefore: "1800000300" });
    const signer = await recoverAuthorizationSigner(domainForStable(getStable("U")), payload.payload.authorization, payload.payload.signature as `0x${string}`);
    expect(signer).toBe(w.account.address);
    expect(payload.resource?.url).toBe("https://m/x");
  });
});
