import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecFn } from "@sharepay/buyer/wallets/baw";
import type { BinanceClient } from "@sharepay/core/binance/client";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import type { Receipt } from "@sharepay/core/dto";
import request from "supertest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { CheckoutConfig } from "../src/config.js";
import { createServices, memoize, receiptVerifier } from "../src/services.js";

const GOOD = `0x${"aa".repeat(32)}` as const;
const BAD = `0x${"bb".repeat(32)}` as const;
const AW = "0x2222222222222222222222222222222222222222";

const offline: BinanceClient = {
  get: async () => {
    throw new Error("offline");
  },
  post: async () => {
    throw new Error("offline");
  },
};

const chain: ChainReader = {
  balanceOf: async () => 0n,
  allowance: async () => 0n,
  authorizationState: async () => false,
  uiMultiplier: async () => 10n ** 18n,
  nativeBalance: async () => 0n,
  pendingNonce: async () => 0,
  waitForReceipt: async (hash) => {
    if (hash === GOOD) return { status: "success", blockNumber: 1n };
    throw new Error("receipt not found");
  },
};

function receipt(id: string, settlementTxHash: string | null, swapTxHashes: string[] = []): Receipt {
  return {
    id, itemId: "sharepay-nvda-report", itemTitle: "NVDA research report", merchantName: "SharePay", paidUsd: "0.05", paidAmount: "0.05", paidAsset: "U",
    stockSymbol: "NVDAB", stockName: "NVIDIA", sharesSold: "0.000306", tokensSold: "0.0003057", swapTxHashes, settlementTxHash, reinvestTxHash: null,
    createdAt: "2026-10-08T10:00:00.000Z", wallet: "api-signer",
  };
}

function config(overrides: Partial<CheckoutConfig> = {}): CheckoutConfig {
  const dir = mkdtempSync(join(tmpdir(), "services-"));
  const seed = join(dir, "receipts.seed.json");
  writeFileSync(seed, JSON.stringify([receipt("verified", GOOD), receipt("forged", BAD)]));
  return {
    walletMode: "api-signer", buyerPrivateKey: generatePrivateKey(), bawBin: "baw", awPaysOwnMerchant: true, merchantUrl: "https://merchant.example",
    livePasscode: "correct horse battery", liveDailyMaxCount: 10, liveDailyMaxUsd: "1.50", receiptsSeedPath: seed, receiptsRuntimePath: null,
    webDist: null, port: 0, rpcUrl: "http://127.0.0.1:9", binance: null, devexEventsPath: null, version: "0.1.0", ...overrides,
  };
}

const bawExec: ExecFn = async (_file, args) => ({
  stdout: JSON.stringify(
    args[0] === "wallet" ? { success: true, data: { addresses: [{ binanceChainId: "56", chainName: "BSC", address: AW }] } } : { success: false, error: "unexpected" },
  ),
  stderr: "",
  code: 0,
});

describe("createServices", () => {
  it("wires the api-signer wallet, health and the live budget", async () => {
    const cfg = config();
    const services = await createServices(cfg, { binance: offline, chain });
    const address = privateKeyToAccount(cfg.buyerPrivateKey ?? GOOD).address;
    const health = await request(services.app).get("/api/health");
    expect(health.body).toEqual({ ok: true, walletMode: "api-signer", buyerAddress: address, merchantUrl: "https://merchant.example", version: "0.1.0" });
    expect(services.walletFor("sharepay-nvda-report").kind).toBe("api-signer");
    expect(services.walletFor("cmc-nvda-dossier").kind).toBe("api-signer");
    expect((await request(services.app).get("/api/budget")).body).toEqual({ liveAvailable: true, remainingCount: 10, remainingUsd: "1.50" });
  });

  it("only shows seed receipts whose transactions are on-chain", async () => {
    const services = await createServices(config(), { binance: offline, chain });
    const ledger = await request(services.app).get("/api/ledger");
    expect(ledger.body.walletLabel).toBe("Demo wallet · shares only");
    expect(ledger.body.holdings).toEqual([]);
    expect((ledger.body.receipts as Receipt[]).map((r) => r.id)).toEqual(["verified"]);
  });

  it("routes our own item to the api-signer when the Agentic Wallet may not pay it", async () => {
    const services = await createServices(config({ walletMode: "agentic-wallet", awPaysOwnMerchant: false }), { binance: offline, chain, exec: bawExec });
    expect(services.walletFor("sharepay-nvda-report").kind).toBe("api-signer");
    expect(services.walletFor("bnb-stock-analyst-nvda").kind).toBe("agentic-wallet");
    expect((await request(services.app).get("/api/health")).body).toMatchObject({ walletMode: "agentic-wallet", buyerAddress: AW });
    expect((await request(services.app).get("/api/ledger")).body.walletLabel).toBe("Agentic Wallet · shares only");
  });

  it("uses the Agentic Wallet for everything when it may pay our own merchant", async () => {
    const services = await createServices(config({ walletMode: "agentic-wallet", awPaysOwnMerchant: true, buyerPrivateKey: null }), { binance: offline, chain, exec: bawExec });
    expect(services.walletFor("sharepay-nvda-report").kind).toBe("agentic-wallet");
  });

  it("requires Binance credentials", async () => {
    await expect(createServices(config(), { chain })).rejects.toThrow("BINANCE_API_KEY");
  });
});

describe("helpers", () => {
  it("memoize reuses a value within its lifetime and retries after a failure", async () => {
    let calls = 0;
    const clock = { now: 0 };
    const get = memoize(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("first");
        return calls;
      },
      30_000,
      () => clock.now,
    );
    await expect(get()).rejects.toThrow("first");
    expect(await get()).toBe(2);
    expect(await get()).toBe(2);
    clock.now += 30_000;
    expect(await get()).toBe(3);
  });

  it("receiptVerifier falls back to the first sale transaction", async () => {
    const verify = receiptVerifier(chain);
    expect(await verify(receipt("a", null, [GOOD]))).toBe(true);
    expect(await verify(receipt("b", null, []))).toBe(false);
    expect(await verify(receipt("c", "0xnothex"))).toBe(false);
  });
});
