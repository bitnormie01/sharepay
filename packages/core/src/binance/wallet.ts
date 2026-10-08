import { z } from "zod";
import { BINANCE_CHAIN_ID } from "../tokens.js";
import type { BinanceClient } from "./client.js";
import { stringish } from "./listOf.js";

export interface TokenAsset {
  tokenContractAddress: string;
  symbol?: string | null;
  balance?: string | null;
  rawBalance?: string | null;
  tokenPrice?: string | null;
}

export interface WalletApi {
  tokenBalances(address: string, tokens: string[]): Promise<TokenAsset[]>;
}

const TokenAssetSchema: z.ZodType<TokenAsset, z.ZodTypeDef, unknown> = z
  .object({
    tokenContractAddress: z.string(),
    symbol: stringish.optional(),
    balance: stringish.optional(),
    rawBalance: stringish.optional(),
    tokenPrice: stringish.optional(),
  })
  .passthrough();

const BalancesSchema: z.ZodType<TokenAsset[], z.ZodTypeDef, unknown> = z.preprocess((value) => {
  const groups = Array.isArray(value) ? value : value !== null && typeof value === "object" ? [value] : [];
  const assets: unknown[] = [];
  for (const group of groups) {
    if (group !== null && typeof group === "object") {
      const list = (group as Record<string, unknown>).tokenAssets;
      if (Array.isArray(list)) assets.push(...list);
    }
  }
  return assets;
}, z.array(TokenAssetSchema));

export function createWalletApi(client: BinanceClient): WalletApi {
  return {
    tokenBalances: (address, tokens) =>
      client.post(
        "/api/v1/dex/balance/token-balances-by-address",
        {
          address,
          tokenContractAddresses: tokens.map((token) => ({ binanceChainId: BINANCE_CHAIN_ID, tokenContractAddress: token })),
        },
        BalancesSchema,
      ),
  };
}
