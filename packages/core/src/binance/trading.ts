import { z } from "zod";
import { BINANCE_CHAIN_ID } from "../tokens.js";
import type { BinanceClient } from "./client.js";
import { listOf, stringish } from "./listOf.js";

export interface QuoteRoute {
  quoteId: string;
  vendorName?: string | null;
  fromTokenAmount?: string | null;
  toTokenAmount: string;
  priceImpactPercent?: string | null;
  executionMode?: string | null;
  approveTarget?: string | null;
  isBest?: boolean | null;
}

export interface SwapBuild {
  executionMode?: string | null;
  tx?: {
    from?: string;
    to: string;
    data: string;
    value?: string | null;
    gas?: string | null;
    gasPrice?: string | null;
    minReceiveAmount?: string | null;
  } | null;
  rfq?: unknown;
  routerResult?: { vendorName?: string | null; toTokenAmount?: string | null; priceImpactPercent?: string | null } | null;
}

export interface ApproveTx {
  data: string;
  dexContractAddress: string;
  gasLimit?: string | null;
  gasPrice?: string | null;
}

export interface QuoteParams {
  amount: bigint;
  fromTokenAddress: string;
  toTokenAddress: string;
  userWalletAddress?: string;
  vendor?: "LiquidMesh";
}

export interface SwapParams {
  amount: bigint;
  fromTokenAddress: string;
  toTokenAddress: string;
  userWalletAddress: string;
  quoteId: string;
  slippagePercent: string;
}

export interface ApproveParams {
  tokenContractAddress: string;
  approveAmount: bigint;
  vendor?: string;
}

export interface TradingApi {
  quote(params: QuoteParams): Promise<QuoteRoute[]>;
  swap(params: SwapParams): Promise<SwapBuild>;
  approveTransaction(params: ApproveParams): Promise<ApproveTx>;
}

const QuoteRouteSchema: z.ZodType<QuoteRoute, z.ZodTypeDef, unknown> = z
  .object({
    quoteId: z.string(),
    vendorName: stringish.optional(),
    fromTokenAmount: stringish.optional(),
    toTokenAmount: z.coerce.string(),
    priceImpactPercent: stringish.optional(),
    executionMode: stringish.optional(),
    approveTarget: stringish.optional(),
    isBest: z.boolean().nullable().optional(),
  })
  .passthrough();

const SwapBuildSchema: z.ZodType<SwapBuild, z.ZodTypeDef, unknown> = z
  .object({
    executionMode: stringish.optional(),
    tx: z
      .object({
        from: z.string().optional(),
        to: z.string(),
        data: z.string(),
        value: stringish.optional(),
        gas: stringish.optional(),
        gasPrice: stringish.optional(),
        minReceiveAmount: stringish.optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    rfq: z.unknown().optional(),
    routerResult: z
      .object({
        vendorName: stringish.optional(),
        toTokenAmount: stringish.optional(),
        priceImpactPercent: stringish.optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const ApproveTxObjectSchema = z
  .object({
    data: z.string(),
    dexContractAddress: z.string(),
    gasLimit: stringish.optional(),
    gasPrice: stringish.optional(),
  })
  .passthrough();

// The docs show an object; the live API (2026-10-10) answers with a one-element array. Accept both.
const ApproveTxSchema: z.ZodType<ApproveTx, z.ZodTypeDef, unknown> = z.union([
  ApproveTxObjectSchema,
  z
    .array(ApproveTxObjectSchema)
    .nonempty()
    .transform((items) => items[0]),
]);

export function createTradingApi(client: BinanceClient): TradingApi {
  return {
    quote: (params) =>
      client.get(
        "/api/v1/dex/aggregator/quote",
        {
          binanceChainId: BINANCE_CHAIN_ID,
          amount: params.amount.toString(),
          fromTokenAddress: params.fromTokenAddress,
          toTokenAddress: params.toTokenAddress,
          userWalletAddress: params.userWalletAddress,
          vendor: params.vendor,
        },
        listOf(QuoteRouteSchema),
      ),
    swap: (params) =>
      client.get(
        "/api/v1/dex/aggregator/swap",
        {
          binanceChainId: BINANCE_CHAIN_ID,
          amount: params.amount.toString(),
          fromTokenAddress: params.fromTokenAddress,
          toTokenAddress: params.toTokenAddress,
          slippagePercent: params.slippagePercent,
          userWalletAddress: params.userWalletAddress,
          quoteId: params.quoteId,
        },
        SwapBuildSchema,
      ),
    approveTransaction: (params) =>
      client.get(
        "/api/v1/dex/aggregator/approve-transaction",
        {
          binanceChainId: BINANCE_CHAIN_ID,
          tokenContractAddress: params.tokenContractAddress,
          approveAmount: params.approveAmount.toString(),
          vendor: params.vendor,
        },
        ApproveTxSchema,
      ),
  };
}

function isMode(route: QuoteRoute, mode: "SWAP" | "RFQ"): boolean {
  return (route.executionMode ?? "").toUpperCase() === mode;
}

export function bestSwapRoute(routes: QuoteRoute[]): QuoteRoute | null {
  let best: QuoteRoute | null = null;
  for (const route of routes) {
    if (!isMode(route, "SWAP")) continue;
    if (best === null || BigInt(route.toTokenAmount) > BigInt(best.toTokenAmount)) {
      best = route;
    }
  }
  return best;
}

export function hasRfqRoute(routes: QuoteRoute[]): boolean {
  return routes.some((route) => isMode(route, "RFQ"));
}
