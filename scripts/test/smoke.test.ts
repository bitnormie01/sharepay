import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BawClient, BawPaymentOption } from "@sharepay/buyer/wallets/baw";
import { BinanceApiError } from "@sharepay/core/binance/client";
import type { RwaApi, RwaToken } from "@sharepay/core/binance/rwa";
import type { TradingApi } from "@sharepay/core/binance/trading";
import { getStable, getStock } from "@sharepay/core/tokens";
import { encodeBase64Json } from "@sharepay/core/x402/codec";
import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import {
  IDENTITY_REGISTRY,
  checkAwPreview,
  checkCheckoutLive,
  checkErc8004,
  checkMerchantLive,
  checkOndo,
  checkRwa,
  checkThirdParty,
  readSmoke,
  verifySmoke,
  writeSmoke,
} from "../lib/smoke.js";

const AT = "2026-10-07T09:00:00.000Z";
const WALLET = "0x1111111111111111111111111111111111111111";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../packages/core/test/fixtures/${name}`, import.meta.url)), "utf8"));
}

function rwaApi(tokens: () => Promise<RwaToken[]>): RwaApi {
  return { tokens, prices: async () => [], search: async () => [], profile: async () => ({}), market: async () => ({}) };
}

function challengeResponse(body: unknown): Response {
  return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": encodeBase64Json(body) } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("checkRwa", () => {
  it("records code 0 with the token count", async () => {
    const record = await checkRwa(
      rwaApi(async () => [
        { binanceChainId: "56", tokenContractAddress: "0x1", platformId: "bstock", tokenSymbol: "NVDAB" },
        { binanceChainId: "1", tokenContractAddress: "0x2", platformId: "ondo", tokenSymbol: "NVDAon" },
      ]),
      AT,
    );
    expect(record).toEqual({ id: "rwa", at: AT, ok: true, summary: "code 0: 2 RWA tokens (1 on BSC)", detail: { tokens: 2, onBsc: 1 } });
  });

  it("flags a region block", async () => {
    const record = await checkRwa(
      rwaApi(async () => {
        throw new BinanceApiError("/api/v1/rwa/tokens", 200, 40304, "Access restricted");
      }),
      AT,
    );
    expect(record.ok).toBe(false);
    expect(record.summary).toBe("40304 Access restricted (this network is in a restricted region for the Binance Web3 API)");
    expect(record.detail).toEqual({ code: 40304, message: "40304 Access restricted" });
  });
});

describe("checkThirdParty", () => {
  it("parses the real captured stock-analyst and CMC 402s", async () => {
    const analyst = fixture("stock-analyst-402.json");
    const cmc = fixture("cmc-402.json");
    const fetchImpl = (async (input: string | URL | Request) => challengeResponse(String(input).includes("stock-agent") ? analyst : cmc)) as typeof fetch;
    const record = await checkThirdParty(fetchImpl, AT);
    expect(record.ok).toBe(true);
    expect(record.summary).toBe("BNB Chain stock analyst (Agent Studio) $0.10 in U; CoinMarketCap $0.01 in U");
    expect(record.detail["bnb-stock-analyst-nvda"]).toMatchObject({ amount: "100000000000000000", asset: "U", payTo: "0xd10bddc20e4dc42a1a19a9653e994991e25b8153", maxTimeoutSeconds: 600 });
    expect(record.detail["cmc-nvda-dossier"]).toMatchObject({ amount: "10000000000000000", asset: "U" });
  });

  it("fails when a merchant does not answer 402", async () => {
    const fetchImpl = (async () => json({ ok: true })) as typeof fetch;
    const record = await checkThirdParty(fetchImpl, AT);
    expect(record.ok).toBe(false);
    expect(record.summary).toContain("BNB Chain stock analyst (Agent Studio) failed: merchant answered HTTP 200 instead of 402");
  });
});

describe("checkAwPreview", () => {
  const accept = { scheme: "exact", network: "eip155:56", amount: "50000000000000000", asset: getStable("U").address, payTo: "0x9999999999999999999999999999999999999999", maxTimeoutSeconds: 300, extra: { name: "United Stables", version: "1", assetTransferMethod: "eip3009" } };
  const merchantFetch = (async () => challengeResponse({ x402Version: 2, resource: { url: "http://localhost:9000/x402/report?symbol=NVDA" }, accepts: [accept] })) as typeof fetch;
  const unused = async (): Promise<never> => {
    throw new Error("unused");
  };

  function baw(result: BawPaymentOption[] | Error, seen: string[] = []): BawClient {
    return {
      address: unused,
      walletStatus: unused,
      swap: unused,
      order: unused,
      x402Sign: unused,
      x402Preview: async (requirements) => {
        seen.push(requirements);
        if (result instanceof Error) throw result;
        return { paymentId: "p1", options: result };
      },
    };
  }

  it.each<[BawPaymentOption, boolean, string]>([
    [{ index: 1, status: "READY_TO_SIGN", reasons: [], originalAccept: accept }, true, "READY_TO_SIGN → AW_PAYS_OWN_MERCHANT=true"],
    [{ index: 1, status: "ACTION_REQUIRED", reasons: ["INSUFFICIENT_BALANCE"], originalAccept: accept }, true, "ACTION_REQUIRED (INSUFFICIENT_BALANCE) → AW_PAYS_OWN_MERCHANT=true"],
    [{ index: 1, status: "NOT_SIGNABLE", reasons: ["BLOCKED_BY_SECURITY_CHECK"], originalAccept: accept }, false, "NOT_SIGNABLE (BLOCKED_BY_SECURITY_CHECK) → AW_PAYS_OWN_MERCHANT=false"],
  ])("decides AW_PAYS_OWN_MERCHANT from %j", async (option, pays, summary) => {
    const seen: string[] = [];
    const record = await checkAwPreview(merchantFetch, baw([option], seen), "http://localhost:9000/", AT);
    expect(record).toMatchObject({ id: "aw-preview", ok: true, summary });
    expect(record.detail.awPaysOwnMerchant).toBe(pays);
    expect(seen).toHaveLength(1);
  });

  it("records a failed preview as not ok", async () => {
    const record = await checkAwPreview(merchantFetch, baw(new Error("baw x402-payment: Not signed in")), "http://localhost:9000", AT);
    expect(record.ok).toBe(false);
    expect(record.summary).toBe("preview failed: baw x402-payment: Not signed in");
  });
});

describe("checkOndo", () => {
  it("records the Ondo minimum and the SWAP route at a larger size", async () => {
    const nvdaon = getStock("NVDAon");
    const rwa = rwaApi(async () => [
      { binanceChainId: "56", tokenContractAddress: nvdaon.address, platformId: "ondo", tokenSymbol: "NVDAon", tokenPrice: "168.90", statusInfo: { openState: true, marketStatus: "regular", reasonCode: "TRADING" } },
    ]);
    const trading: TradingApi = {
      quote: async (params) => {
        if (params.amount < 10n ** 16n) throw new BinanceApiError("/api/v1/dex/aggregator/quote", 200, 40375, "ONDO_FROM_USD_AMOUNT_TOO_SMALL, minimum 5.5 USD");
        return [{ quoteId: "q", vendorName: "LiquidMesh", toTokenAmount: "9900000000000000000", executionMode: "SWAP", priceImpactPercent: "0.4" }];
      },
      swap: async () => {
        throw new Error("unused");
      },
      approveTransaction: async () => {
        throw new Error("unused");
      },
    };
    const record = await checkOndo(rwa, trading, WALLET, AT);
    expect(record.ok).toBe(true);
    expect(record.summary).toBe("NVDAon $0.05: below_min (min $5.5); $10: SWAP route (1 leg)");
    expect(record.detail.usd_10).toMatchObject({ kind: "swap", legs: 1, vendor: "LiquidMesh" });
  });

  it("fails without a live NVDAon price", async () => {
    const trading = {} as TradingApi;
    const record = await checkOndo(rwaApi(async () => []), trading, WALLET, AT);
    expect(record).toMatchObject({ ok: false, summary: "Ondo check failed: NVDAon has no live token price" });
  });
});

describe("deploy checks", () => {
  it("accepts a merchant whose host can make signed RWA calls", async () => {
    const ok = (async () => json({ ok: true, payTo: "0xabc", rwaCode: 0, rwaMessage: "ok" })) as typeof fetch;
    expect(await checkMerchantLive(ok, "https://merchant.example/", AT)).toMatchObject({
      ok: true,
      summary: "merchant up at https://merchant.example; signed RWA call from its host: code 0",
    });
    const blocked = (async () => json({ ok: true, payTo: "0xabc", rwaCode: 40304, rwaMessage: "Access restricted" })) as typeof fetch;
    expect(await checkMerchantLive(blocked, "https://merchant.example", AT)).toMatchObject({
      ok: false,
      summary: "merchant at https://merchant.example: HTTP 200, RWA 40304 Access restricted",
    });
  });

  it("confirms the deployed merchant's wallet owns its ERC-8004 agent", async () => {
    const merchantWallet: Address = "0x9999999999999999999999999999999999999999";
    const health = (async () => json({ ok: true, payTo: merchantWallet, network: "eip155:56", priceUsd: "0.05", sweepEnabled: true })) as typeof fetch;
    const ownerOf = async (agentId: bigint): Promise<Address> => {
      if (agentId === 42n) return merchantWallet;
      if (agentId === 7n) return WALLET;
      throw new Error("ERC721NonexistentToken(5)\nContract Call: ownerOf(5)");
    };
    expect(await checkErc8004(health, ownerOf, "https://merchant.example/", "42", AT)).toMatchObject({
      id: "erc8004",
      ok: true,
      summary: `agent 42 on the ERC-8004 IdentityRegistry is owned by the merchant wallet ${merchantWallet}`,
      detail: { registry: IDENTITY_REGISTRY, agentId: "42", owner: merchantWallet },
    });
    expect(await checkErc8004(health, ownerOf, "https://merchant.example", "7", AT)).toMatchObject({
      ok: false,
      summary: `agent 7 is owned by ${WALLET}, not the merchant wallet ${merchantWallet}`,
    });
    expect(await checkErc8004(health, ownerOf, "https://merchant.example", "5", AT)).toMatchObject({ ok: false, summary: "ERC-8004 check failed: ERC721NonexistentToken(5)" });
    expect(await checkErc8004(health, ownerOf, "https://merchant.example", "", AT)).toMatchObject({
      ok: false,
      summary: "ERC-8004 check failed: set MERCHANT_AGENT_ID in .env to the agent id that bag erc8004 register printed",
    });
  });

  it("accepts a checkout whose deep health is green and names what is not", async () => {
    const deep = (merchantOk: boolean) =>
      (async () =>
        json({
          ok: true,
          walletMode: "api-signer",
          deep: { binance: { ok: true, detail: "30 RWA tokens (code 0)" }, rpc: { ok: true, detail: "BSC RPC reachable" }, merchant: { ok: merchantOk, detail: merchantOk ? "HTTP 200" : "HTTP 503" } },
        })) as typeof fetch;
    expect(await checkCheckoutLive(deep(true), "https://checkout.example/", AT)).toMatchObject({
      ok: true,
      summary: "checkout up at https://checkout.example (api-signer): Binance, RPC and merchant reachable",
    });
    expect(await checkCheckoutLive(deep(false), "https://checkout.example", AT)).toMatchObject({
      ok: false,
      summary: "checkout at https://checkout.example: binance ok, rpc ok, merchant failed (HTTP 503)",
    });
  });
});

describe("smoke records", () => {
  it("writes, reads and verifies records", () => {
    const root = mkdtempSync(join(tmpdir(), "smoke-"));
    expect(verifySmoke(root, ["rwa"]).ok).toBe(false);
    writeSmoke(root, { id: "rwa", at: AT, ok: true, summary: "code 0: 30 RWA tokens (30 on BSC)", detail: {} });
    writeSmoke(root, { id: "ondo", at: AT, ok: false, summary: "Ondo check failed: timeout", detail: {} });
    expect(readSmoke(root, "rwa")?.summary).toBe("code 0: 30 RWA tokens (30 on BSC)");
    expect(verifySmoke(root, ["rwa"])).toEqual({ ok: true, lines: [`rwa: OK at ${AT}: code 0: 30 RWA tokens (30 on BSC)`] });
    expect(verifySmoke(root, ["rwa", "ondo"]).ok).toBe(false);
    expect(verifySmoke(root, ["rwa", "aw-preview"]).lines[1]).toBe("aw-preview: not recorded (run npm run smoke -- aw-preview)");
    expect(verifySmoke(root, []).ok).toBe(false);
  });
});
