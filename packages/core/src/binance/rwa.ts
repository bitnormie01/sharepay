import { z } from "zod";
import { BINANCE_CHAIN_ID, type Platform } from "../tokens.js";
import type { BinanceClient } from "./client.js";
import { listOf, numberish, stringish } from "./listOf.js";

export interface StatusInfo {
  openState?: boolean | null;
  marketStatus?: string | null;
  reasonCode?: string | null;
  reasonMsg?: string | null;
  nextOpenTime?: number | null;
  nextCloseTime?: number | null;
}

export interface RwaToken {
  binanceChainId: string;
  tokenContractAddress: string;
  platformId: string;
  tokenSymbol: string;
  tokenName?: string | null;
  underlyingTicker?: string | null;
  underlyingName?: string | null;
  tokenToShareRatio?: string | null;
  statusInfo?: StatusInfo | null;
  tokenPrice?: string | null;
  referencePrice?: string | null;
}

export interface RwaPrice {
  tokenContractAddress: string;
  platformId?: string | null;
  tokenPrice?: string | null;
  referencePrice?: string | null;
  tokenPriceUpdatedAt?: number | null;
}

export interface RwaSearchResult {
  ticker: string;
  companyName?: string | null;
  assets: Array<{
    platformId: string;
    binanceChainId: string | null;
    tokenContractAddress: string;
    tokenSymbol: string;
    assetType?: number | null;
  }>;
}

export interface UnderlyingProfile {
  tokenContractAddress?: string;
  platformId?: string | null;
  underlyingTicker?: string | null;
  underlyingFullName?: string | null;
  tokenToShareRatio?: string | null;
  protections?: Record<string, unknown> | null;
  companyInfo?: {
    ceo?: string | null;
    website?: string | null;
    industry?: string | null;
    conceptsEn?: string[] | null;
    descriptionEn?: string | null;
  } | null;
}

export interface UnderlyingMarket {
  statusInfo?: StatusInfo | null;
  marketData?: {
    referencePrice?: string | null;
    high52W?: string | null;
    low52W?: string | null;
    volumeShares24H?: string | null;
    marketCap?: string | null;
    peRatioTTM?: string | null;
    pbRatio?: string | null;
    dividendYield?: string | null;
  } | null;
}

export interface RwaApi {
  tokens(filter?: { platformId?: Platform }): Promise<RwaToken[]>;
  prices(addresses: string[]): Promise<RwaPrice[]>;
  search(keyword: string): Promise<RwaSearchResult[]>;
  profile(address: string): Promise<UnderlyingProfile>;
  market(address: string): Promise<UnderlyingMarket>;
}

const StatusInfoSchema = z
  .object({
    openState: z.boolean().nullable().optional(),
    marketStatus: stringish.optional(),
    reasonCode: stringish.optional(),
    reasonMsg: stringish.optional(),
    nextOpenTime: numberish.optional(),
    nextCloseTime: numberish.optional(),
  })
  .passthrough();

const RwaTokenSchema: z.ZodType<RwaToken, z.ZodTypeDef, unknown> = z
  .object({
    binanceChainId: z.coerce.string(),
    tokenContractAddress: z.string(),
    platformId: z.string(),
    tokenSymbol: z.string(),
    tokenName: stringish.optional(),
    underlyingTicker: stringish.optional(),
    underlyingName: stringish.optional(),
    tokenToShareRatio: stringish.optional(),
    statusInfo: StatusInfoSchema.nullable().optional(),
    tokenPrice: stringish.optional(),
    referencePrice: stringish.optional(),
  })
  .passthrough();

const RwaPriceSchema: z.ZodType<RwaPrice, z.ZodTypeDef, unknown> = z
  .object({
    tokenContractAddress: z.string(),
    platformId: stringish.optional(),
    tokenPrice: stringish.optional(),
    referencePrice: stringish.optional(),
    tokenPriceUpdatedAt: numberish.optional(),
  })
  .passthrough();

const RwaSearchSchema: z.ZodType<RwaSearchResult, z.ZodTypeDef, unknown> = z
  .object({
    ticker: z.string(),
    companyName: stringish.optional(),
    assets: z
      .array(
        z
          .object({
            platformId: z.string(),
            binanceChainId: stringish,
            tokenContractAddress: z.string(),
            tokenSymbol: z.string(),
            assetType: numberish.optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

const UnderlyingProfileSchema: z.ZodType<UnderlyingProfile, z.ZodTypeDef, unknown> = z
  .object({
    tokenContractAddress: z.string().optional(),
    platformId: stringish.optional(),
    underlyingTicker: stringish.optional(),
    underlyingFullName: stringish.optional(),
    tokenToShareRatio: stringish.optional(),
    protections: z.record(z.unknown()).nullable().optional(),
    companyInfo: z
      .object({
        ceo: stringish.optional(),
        website: stringish.optional(),
        industry: stringish.optional(),
        conceptsEn: z.array(z.string()).nullable().optional(),
        descriptionEn: stringish.optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const UnderlyingMarketSchema: z.ZodType<UnderlyingMarket, z.ZodTypeDef, unknown> = z
  .object({
    statusInfo: StatusInfoSchema.nullable().optional(),
    marketData: z
      .object({
        referencePrice: stringish.optional(),
        high52W: stringish.optional(),
        low52W: stringish.optional(),
        volumeShares24H: stringish.optional(),
        marketCap: stringish.optional(),
        peRatioTTM: stringish.optional(),
        pbRatio: stringish.optional(),
        dividendYield: stringish.optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export function createRwaApi(client: BinanceClient): RwaApi {
  return {
    tokens: (filter) =>
      client.get(
        "/api/v1/dex/market/rwa/tokens",
        { binanceChainId: BINANCE_CHAIN_ID, platformId: filter?.platformId },
        listOf(RwaTokenSchema),
      ),
    prices: async (addresses) => {
      if (addresses.length === 0) return [];
      if (addresses.length > 100) {
        throw new Error("rwa/price accepts at most 100 addresses per call");
      }
      return client.get(
        "/api/v1/dex/market/rwa/price",
        { binanceChainId: BINANCE_CHAIN_ID, tokenContractAddresses: addresses.join(",") },
        listOf(RwaPriceSchema),
      );
    },
    search: (keyword) => client.get("/api/v1/dex/market/rwa/search", { keyword }, listOf(RwaSearchSchema)),
    profile: (address) =>
      client.get(
        "/api/v1/dex/market/rwa/underlying-profile",
        { binanceChainId: BINANCE_CHAIN_ID, tokenContractAddress: address },
        UnderlyingProfileSchema,
      ),
    market: (address) =>
      client.get(
        "/api/v1/dex/market/rwa/underlying-market",
        { binanceChainId: BINANCE_CHAIN_ID, tokenContractAddress: address },
        UnderlyingMarketSchema,
      ),
  };
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function protectionLinks(
  protections: Record<string, unknown> | null | undefined,
): Array<{ name: string; url: string }> {
  if (!protections) return [];
  const links: Array<{ name: string; url: string }> = [];
  for (const [key, value] of Object.entries(protections)) {
    if (value === null || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    if (entry.supported === false) continue;
    const url = [entry.url, entry.link, entry.reportUrl].find((v): v is string => typeof v === "string" && v.length > 0);
    if (url) links.push({ name: humanize(key), url });
  }
  return links;
}
