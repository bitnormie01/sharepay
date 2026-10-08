import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RwaApi } from "@sharepay/core/binance/rwa";
import type { QuoteRoute, TradingApi } from "@sharepay/core/binance/trading";
import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { WalletApi } from "@sharepay/core/binance/wallet";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { viemTxSigner } from "@sharepay/core/chain/txpipeline";
import { AGGREGATION_ROUTER, getStable, getStock } from "@sharepay/core/tokens";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { approveForSale, describeBalances, merchantAddressFromToml, newBurner, planBuy, verifyFunding } from "../lib/wallets.js";

const NVDAB = getStock("NVDAB");
const TSLAB = getStock("TSLAB");
const USDT = getStable("USDT").address;
const U = getStable("U").address;
const OWNER: Address = "0x1111111111111111111111111111111111111111";
const AW: Address = "0x2222222222222222222222222222222222222222";
const MERCHANT: Address = "0x3333333333333333333333333333333333333333";
const MAX = 2n ** 256n - 1n;

function route(toTokenAmount: string): QuoteRoute {
  return { quoteId: "q", vendorName: "LiquidMesh", toTokenAmount, executionMode: "SWAP", priceImpactPercent: "0.2", approveTarget: AGGREGATION_ROUTER };
}

function trading(overrides: Partial<TradingApi> = {}): TradingApi {
  return {
    quote: async () => [route("14000000000000000")],
    swap: async () => {
      throw new Error("unused");
    },
    approveTransaction: async () => ({ data: "0xa1", dexContractAddress: AGGREGATION_ROUTER }),
    ...overrides,
  };
}

function chain(options: { allowance?: bigint; stock?: Record<string, bigint>; tslab?: Record<string, bigint>; bnb?: Record<string, bigint> } = {}): ChainReader {
  return {
    balanceOf: async (token, owner) =>
      token === NVDAB.address ? (options.stock?.[owner] ?? 0n) : token === TSLAB.address ? (options.tslab?.[owner] ?? 0n) : token === U ? 51000000000000000n : 0n,
    allowance: async () => options.allowance ?? 0n,
    authorizationState: async () => false,
    uiMultiplier: async () => 10n ** 18n,
    nativeBalance: async (address) => options.bnb?.[address] ?? 1200000000000000n,
    pendingNonce: async () => 0,
    waitForReceipt: async () => ({ status: "success", blockNumber: 1n }),
  };
}

describe("newBurner", () => {
  it("creates .env from the example with a fresh key once, then keeps it", () => {
    const root = mkdtempSync(join(tmpdir(), "ops-"));
    writeFileSync(join(root, ".env.example"), "BINANCE_API_KEY=\nBUYER_PRIVATE_KEY=\nMERCHANT_URL=http://localhost:9000\n");
    const key = `0x${"22".repeat(32)}` as const;
    const first = newBurner(root, () => key);
    expect(first).toEqual({ address: privateKeyToAccount(key).address, created: true });
    const env = readFileSync(join(root, ".env"), "utf8");
    expect(env).toBe(`BINANCE_API_KEY=\nBUYER_PRIVATE_KEY=${key}\nMERCHANT_URL=http://localhost:9000\n`);
    const second = newBurner(root, () => {
      throw new Error("must not generate a second key");
    });
    expect(second).toEqual({ address: first.address, created: false });
  });
});

describe("describeBalances", () => {
  it("lists stocks in shares, stablecoins and BNB", async () => {
    const rwa: RwaApi = {
      tokens: async () => [{ binanceChainId: "56", tokenContractAddress: NVDAB.address, platformId: "bstock", tokenSymbol: "NVDAB", tokenPrice: "168.43" }],
      prices: async () => [],
      search: async () => [],
      profile: async () => ({}),
      market: async () => ({}),
    };
    const walletApi: WalletApi = { tokenBalances: async () => [{ tokenContractAddress: NVDAB.address, rawBalance: "12300000000000000" }] };
    const lines = await describeBalances({ rwa, walletApi, chain: chain(), nowMs: () => 0 }, OWNER);
    expect(lines).toEqual([`Wallet ${OWNER}`, "  NVIDIA (NVDAB): 0.0123 shares (~$2.07)", "  U: 0.051", "  USD1: 0", "  USDT: 0", "  BNB: 0.0012"]);
  });
});

describe("planBuy", () => {
  it("builds a SWAP-only USDT → stock plan with a 97% minimum", async () => {
    const plan = await planBuy(trading(), OWNER, "NVDAB", "2.50");
    expect(plan).toMatchObject({ payAsset: NVDAB.address, sellAmount: 2500000000000000000n, expectedOut: 14000000000000000n, priceAtomic: 13580000000000000n });
    expect(plan.stock.symbol).toBe("NVDAB");
    expect(plan.legs.map((leg) => [leg.from, leg.to])).toEqual([[USDT, NVDAB.address]]);
  });

  it("refuses when there is no SWAP route", async () => {
    await expect(planBuy(trading({ quote: async () => [] }), OWNER, "NVDAB", "1")).rejects.toThrow("no SWAP route to buy NVDAB");
  });
});

describe("approveForSale", () => {
  function deps(options: { allowance?: bigint; spender?: Address } = {}) {
    const broadcasts: string[] = [];
    const tx: TransactionApi = {
      simulate: async () => ({ ok: true, status: "SUCCESS", failReason: null, balanceChanges: [], allowanceChanges: [] }),
      gasPrice: async () => 100000000n,
      gasLimit: async () => 60000n,
      broadcast: async ({ signedTransaction }) => {
        broadcasts.push(signedTransaction);
        return { orderId: null, txHash: `0x${"ab".repeat(32)}` };
      },
    };
    const account = privateKeyToAccount(generatePrivateKey());
    return {
      broadcasts,
      deps: {
        trading: trading({ approveTransaction: async () => ({ data: "0xa1", dexContractAddress: options.spender ?? AGGREGATION_ROUTER }) }),
        tx,
        chain: chain({ allowance: options.allowance, stock: { [account.address]: 10n ** 16n } }),
        signer: viemTxSigner(account),
        receiptTimeoutMs: 1000,
      },
    };
  }

  it("approves the sale route's spender after a successful simulation", async () => {
    const d = deps();
    expect(await approveForSale(d.deps, "NVDAB")).toEqual({ spender: AGGREGATION_ROUTER, txHash: `0x${"ab".repeat(32)}` });
    expect(d.broadcasts).toHaveLength(1);
  });

  it("skips stocks that are already approved", async () => {
    const d = deps({ allowance: MAX });
    expect(await approveForSale(d.deps, "NVDAB")).toEqual({ spender: AGGREGATION_ROUTER, txHash: null });
    expect(d.broadcasts).toHaveLength(0);
  });

  it("refuses an approval for a different spender", async () => {
    const d = deps({ spender: "0x0000000000000000000000000000000000000bad" });
    await expect(approveForSale(d.deps, "NVDAB")).rejects.toThrow("does not match");
    expect(d.broadcasts).toHaveLength(0);
  });
});

describe("verifyFunding", () => {
  const targets = [
    { label: "Burner", address: OWNER, requireStock: true, requireApproval: true },
    { label: "Agentic Wallet", address: AW, requireStock: true, requireApproval: false },
    { label: "Merchant", address: MERCHANT, requireStock: false, requireApproval: false },
  ];

  it("passes when every wallet holds what the demo needs", async () => {
    const result = await verifyFunding(
      { trading: trading(), chain: chain({ allowance: MAX, stock: { [OWNER]: 10n ** 16n, [AW]: 2n * 10n ** 16n }, tslab: { [OWNER]: 3n * 10n ** 15n, [AW]: 3n * 10n ** 15n } }) },
      targets,
      { stocks: ["NVDAB", "TSLAB"], minBnbWei: 500000000000000n },
    );
    expect(result).toEqual({
      ok: true,
      lines: [
        `Burner ${OWNER}: NVDAB 0.01 · approved for ${AGGREGATION_ROUTER} · TSLAB 0.003 · approved for ${AGGREGATION_ROUTER} · BNB 0.0012 → OK`,
        `Agentic Wallet ${AW}: NVDAB 0.02 · TSLAB 0.003 · BNB 0.0012 → OK`,
        `Merchant ${MERCHANT}: BNB 0.0012 → OK`,
      ],
    });
  });

  it("names what is missing, stock by stock", async () => {
    const result = await verifyFunding(
      { trading: trading(), chain: chain({ allowance: 0n, stock: { [OWNER]: 10n ** 16n }, bnb: { [MERCHANT]: 0n } }) },
      targets,
      { stocks: ["NVDAB", "TSLAB"], minBnbWei: 500000000000000n },
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      `Burner ${OWNER}: NVDAB 0.01 · not approved for ${AGGREGATION_ROUTER} · TSLAB 0 · BNB 0.0012 → FAIL (run npm run ops -- approve; holds no TSLAB)`,
      `Agentic Wallet ${AW}: NVDAB 0 · TSLAB 0 · BNB 0.0012 → FAIL (holds no NVDAB; holds no TSLAB)`,
      `Merchant ${MERCHANT}: BNB 0 → FAIL (needs at least 0.0005 BNB for gas)`,
    ]);
  });
});

describe("merchantAddressFromToml", () => {
  it("reads the address bag wallet new writes, ignoring the commented template line", () => {
    expect(merchantAddressFromToml('[wallet]\n# address = "0x..."   # filled by `bag wallet new`\n')).toBeNull();
    expect(merchantAddressFromToml(`[wallet]\nkind = "evm-local"\naddress = "${MERCHANT}"\n`)).toBe(MERCHANT);
  });
});
