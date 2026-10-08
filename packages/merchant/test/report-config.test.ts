import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RwaApi } from "@sharepay/core/binance/rwa";
import type { ResearchReportDto } from "@sharepay/core/dto";
import { describe, expect, it } from "vitest";
import { findRepoRoot, loadMerchantConfig } from "../src/config.js";
import { buildResearchReport, createReportCache, formatUtcShort } from "../src/report.js";

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const NVDAON = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const NEXT_OPEN = Date.UTC(2026, 9, 12, 13, 30);

function fakeRwa(overrides: Partial<RwaApi> = {}): RwaApi {
  return {
    tokens: async () => [],
    search: async () => [
      {
        ticker: "NVDA",
        companyName: "NVIDIA Corporation",
        assets: [
          { platformId: "bstock", binanceChainId: "56", tokenContractAddress: NVDAB, tokenSymbol: "NVDAB", assetType: 1 },
          { platformId: "ondo", binanceChainId: "56", tokenContractAddress: NVDAON, tokenSymbol: "NVDAon", assetType: 1 },
          { platformId: "ondo", binanceChainId: "1", tokenContractAddress: "0x000000000000000000000000000000000000dead", tokenSymbol: "NVDAon", assetType: 1 },
        ],
      },
    ],
    profile: async (address) =>
      address === NVDAB
        ? {
            tokenToShareRatio: "1.000778",
            protections: { dailyAttestationReport: { supported: true, url: "https://bstocks.example/daily" } },
            companyInfo: { ceo: "Jensen Huang", website: "https://www.nvidia.com", industry: "Semiconductors", conceptsEn: ["AI Chips", "Magnificent 7"], descriptionEn: "Designs GPUs." },
          }
        : { tokenToShareRatio: "1.001715", protections: { monthlyAttestationReport: { supported: true, url: "https://ondo.example/monthly" } }, companyInfo: null },
    market: async (address) => ({
      statusInfo:
        address === NVDAB
          ? { openState: true, marketStatus: "regular", reasonCode: "TRADING" }
          : { openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: NEXT_OPEN },
      marketData: { referencePrice: "168.30", high52W: "212.19", low52W: "86.62", marketCap: "4100000000000", peRatioTTM: "48.2", pbRatio: "40.1", dividendYield: "0.02", volumeShares24H: "151000000" },
    }),
    prices: async () => [
      { tokenContractAddress: NVDAB, tokenPrice: "168.43" },
      { tokenContractAddress: NVDAON, tokenPrice: "168.90" },
    ],
    ...overrides,
  };
}

const now = () => new Date("2026-10-07T10:00:00.000Z");

describe("buildResearchReport", () => {
  it("assembles a deterministic report from RWA Data responses", async () => {
    const report = await buildResearchReport({ rwa: fakeRwa(), now }, "NVDA");
    expect(report.symbol).toBe("NVDA");
    expect(report.companyName).toBe("NVIDIA Corporation");
    expect(report.generatedAt).toBe("2026-10-07T10:00:00.000Z");
    expect(report.issuers).toEqual([
      { platform: "bStocks", tokenSymbol: "NVDAB", tokenAddress: NVDAB, tokenPriceUsd: "168.43", sharesPerToken: "1.000778", impliedSharePriceUsd: "168.30", status: "Open (regular)", attestations: [{ name: "Daily attestation report", url: "https://bstocks.example/daily" }] },
      { platform: "Ondo", tokenSymbol: "NVDAon", tokenAddress: NVDAON, tokenPriceUsd: "168.90", sharesPerToken: "1.001715", impliedSharePriceUsd: "168.61", status: "Closed (Weekend or Holiday) · reopens Mon 13:30 UTC", attestations: [{ name: "Monthly attestation report", url: "https://ondo.example/monthly" }] },
    ]);
    expect(report.crossIssuerSpreadBps).toBe("18.5");
    expect(report.status).toEqual({ open: true, label: "Open (regular)", nextOpenTime: null });
    expect(report.company).toEqual([
      { label: "CEO", value: "Jensen Huang" },
      { label: "Website", value: "https://www.nvidia.com" },
      { label: "Industry", value: "Semiconductors" },
      { label: "Themes", value: "AI Chips, Magnificent 7" },
      { label: "About", value: "Designs GPUs." },
    ]);
    expect(report.market).toEqual([
      { label: "Reference price (USD)", value: "168.30" },
      { label: "52-week range (USD)", value: "86.62 – 212.19" },
      { label: "Market cap (USD)", value: "4.10T" },
      { label: "P/E (TTM)", value: "48.2" },
      { label: "P/B", value: "40.1" },
      { label: "Dividend yield (%)", value: "0.02" },
      { label: "24h volume (shares)", value: "151.00M" },
    ]);
    expect(report.summary).toEqual([
      "NVIDIA Corporation (NVDA): Semiconductors.",
      "Underlying market: Open (regular).",
      "Tokenized on BSC by 2 issuers: NVDAB (bStocks), NVDAon (Ondo).",
      "Lowest on-chain implied share price: NVDAB at $168.30; cross-issuer spread 18.5 bps.",
      "Reference price $168.30; 52-week range $86.62–$212.19.",
    ]);
    expect(report.disclaimer).toBe(
      "Generated deterministically from Binance Web3 RWA Data API responses at 2026-10-07T10:00:00.000Z. On-chain implied per-share prices are derived from on-chain token prices, not exchange quotes. Not investment advice.",
    );
    expect(report.sources).toContain("GET /api/v1/dex/market/rwa/underlying-market");
    expect(report.markdown).toContain("# NVIDIA Corporation (NVDA): research report");
    expect(report.markdown).toContain("| NVDAB | bStocks | 168.43 | 1.000778 | 168.30 | Open (regular) |");
    expect(report.markdown).toContain("Cross-issuer spread: 18.5 bps");
    expect(report.markdown).toContain("[Daily attestation report](https://bstocks.example/daily)");
  });

  it("falls back to the token registry when search fails and rejects unknown symbols", async () => {
    const report = await buildResearchReport(
      { rwa: fakeRwa({ search: async () => { throw new Error("40304"); } }), now },
      "NVDA",
    );
    expect(report.issuers.map((i) => i.tokenSymbol)).toEqual(["NVDAB", "NVDAon"]);
    expect(report.companyName).toBe("NVDA");
    await expect(
      buildResearchReport({ rwa: fakeRwa({ search: async () => [] }), now }, "ZZZZ"),
    ).rejects.toThrow("unknown symbol ZZZZ");
  });

  it("formats UTC times compactly", () => {
    expect(formatUtcShort(NEXT_OPEN)).toBe("Mon 13:30 UTC");
  });
});

describe("createReportCache", () => {
  it("is single-flight per symbol, expires after the TTL and never caches failures", async () => {
    let clock = 0;
    let builds = 0;
    let fail = false;
    const cache = createReportCache(
      async (symbol) => {
        builds += 1;
        if (fail) throw new Error("boom");
        return { symbol } as unknown as ResearchReportDto;
      },
      60_000,
      () => clock,
    );
    await Promise.all([cache("NVDA"), cache("NVDA")]);
    expect(builds).toBe(1);
    clock = 59_999;
    await cache("NVDA");
    expect(builds).toBe(1);
    clock = 60_000;
    await cache("NVDA");
    expect(builds).toBe(2);
    fail = true;
    clock = 200_000;
    await expect(cache("NVDA")).rejects.toThrow("boom");
    fail = false;
    await cache("NVDA");
    expect(builds).toBe(4);
  });
});

describe("loadMerchantConfig", () => {
  it("applies defaults and resolves data paths against the repo root", () => {
    const root = mkdtempSync(join(tmpdir(), "sharepay-root-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "sharepay" }));
    const nested = join(root, "sharepaymerchant", "app", "agent");
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
    const config = loadMerchantConfig({ MERCHANT_PUBLIC_URL: "https://merchant.example/" }, nested);
    expect(config.publicUrl).toBe("https://merchant.example");
    expect(config.priceAtomic).toBe(50000000000000000n);
    expect(config.maxTimeoutSeconds).toBe(300);
    expect(config.acceptedAssets).toEqual(["U", "USD1"]);
    expect(config.sweep).toEqual({
      enabled: true,
      minAtomic: 50000000000000000n,
      floatAtomic: 0n,
      maxAtomic: 5000000000000000000n,
      maxPriceImpactPercent: 2,
      slippagePercent: "1",
      intervalMs: 300000,
    });
    expect(config.activityPath).toBe(join(root, "data/runtime/merchant-activity.json"));
    expect(config.activitySeedPath).toBe(join(root, "data/merchant-activity.seed.json"));
    expect(config.rpcUrl).toBe("https://bsc-dataseed.bnbchain.org");
    expect(config.binance).toBeNull();
    expect(config.devexEventsPath).toBeNull();
  });

  it("reads overrides and rejects bad values", () => {
    const config = loadMerchantConfig(
      {
        MERCHANT_PUBLIC_URL: "https://m.example",
        BINANCE_API_KEY: "k",
        BINANCE_API_SECRET: "s",
        SWEEP_ENABLED: "false",
        ACTIVITY_PATH: "",
        REPORT_PRICE_ATOMIC: "10000000000000000",
      },
      process.cwd(),
    );
    expect(config.binance).toEqual({ apiKey: "k", secretKey: "s" });
    expect(config.sweep.enabled).toBe(false);
    expect(config.activityPath).toBeNull();
    expect(config.priceAtomic).toBe(10000000000000000n);
    expect(() => loadMerchantConfig({}, process.cwd())).toThrow("MERCHANT_PUBLIC_URL is required");
    expect(() => loadMerchantConfig({ MERCHANT_PUBLIC_URL: "https://x", REPORT_PRICE_ATOMIC: "0.05" }, process.cwd())).toThrow(
      "REPORT_PRICE_ATOMIC must be an integer string",
    );
  });
});
