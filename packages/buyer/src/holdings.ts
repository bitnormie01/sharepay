import type { RwaApi, RwaToken, StatusInfo } from "@sharepay/core/binance/rwa";
import type { WalletApi } from "@sharepay/core/binance/wallet";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { ONE, toUnits } from "@sharepay/core/money";
import { STOCKS, type StockToken } from "@sharepay/core/tokens";
import type { Address } from "viem";

export interface Holding {
  stock: StockToken;
  balance: bigint;
  priceUsd: string | null;
  sharesPerToken: bigint;
  status: StatusInfo | null;
}

export interface MarketSnapshot {
  tokens: Map<string, RwaToken>;
  at: number;
}

export async function loadMarketSnapshot(rwa: RwaApi, nowMs: number): Promise<MarketSnapshot> {
  const list = await rwa.tokens();
  const tokens = new Map<string, RwaToken>();
  for (const token of list) {
    if (token.binanceChainId === "56") tokens.set(token.tokenContractAddress.toLowerCase(), token);
  }
  return { tokens, at: nowMs };
}

export function ratioToMultiplier(ratio: string | null | undefined): bigint {
  if (!ratio) return ONE;
  try {
    const value = toUnits(ratio, 18);
    return value > 0n ? value : ONE;
  } catch {
    return ONE;
  }
}

export async function loadHoldings(
  deps: { wallet: WalletApi; chain: Pick<ChainReader, "balanceOf" | "uiMultiplier"> },
  owner: Address,
  snapshot: MarketSnapshot,
  stocks: readonly StockToken[] = STOCKS,
): Promise<Holding[]> {
  const balances = new Map<string, bigint>();
  try {
    const assets = await deps.wallet.tokenBalances(owner, stocks.map((s) => s.address));
    for (const asset of assets) {
      if (asset.rawBalance && /^\d+$/.test(asset.rawBalance)) {
        balances.set(asset.tokenContractAddress.toLowerCase(), BigInt(asset.rawBalance));
      }
    }
  } catch {
    for (const stock of stocks) {
      balances.set(stock.address, await deps.chain.balanceOf(stock.address, owner));
    }
  }
  const holdings: Holding[] = [];
  for (const stock of stocks) {
    const balance = balances.get(stock.address) ?? 0n;
    if (balance === 0n) continue;
    const token = snapshot.tokens.get(stock.address) ?? null;
    let sharesPerToken = ratioToMultiplier(token?.tokenToShareRatio);
    if (stock.platform === "bstock") {
      try {
        sharesPerToken = await deps.chain.uiMultiplier(stock.address);
      } catch {
        // keep the RWA tokenToShareRatio
      }
    }
    holdings.push({ stock, balance, priceUsd: token?.tokenPrice ?? null, sharesPerToken, status: token?.statusInfo ?? null });
  }
  return holdings;
}
