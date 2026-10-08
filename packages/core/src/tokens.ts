import type { Address } from "viem";

export type Platform = "bstock" | "ondo";

export interface StockToken {
  kind: "stock";
  symbol: string;
  name: string;
  underlyingTicker: string;
  platform: Platform;
  address: Address;
  decimals: 18;
}

export type StableSymbol = "U" | "USD1" | "USDT";

export interface StableToken {
  kind: "stable";
  symbol: StableSymbol;
  name: string;
  address: Address;
  decimals: 18;
  eip3009: { name: string; version: string } | null;
}

export const BINANCE_CHAIN_ID = "56";
export const X402_NETWORK = "eip155:56";
export const BSC_CHAIN_ID = 56;
export const AGGREGATION_ROUTER: Address = "0xb44446b0c8e56988c34f7ff73ae904982b5fdda5";

export const STOCKS: readonly StockToken[] = [
  { kind: "stock", symbol: "NVDAB", name: "NVIDIA", underlyingTicker: "NVDA", platform: "bstock", address: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", decimals: 18 },
  { kind: "stock", symbol: "TSLAB", name: "Tesla", underlyingTicker: "TSLA", platform: "bstock", address: "0x5b1910eaad6450e50f816082aa078c41f10c292f", decimals: 18 },
  { kind: "stock", symbol: "AAPLB", name: "Apple", underlyingTicker: "AAPL", platform: "bstock", address: "0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a", decimals: 18 },
  { kind: "stock", symbol: "SPYB", name: "S&P 500", underlyingTicker: "SPY", platform: "bstock", address: "0x7138b48df7d98d7e3cc221bfe7192d0a178182d8", decimals: 18 },
  { kind: "stock", symbol: "NVDAon", name: "NVIDIA (Ondo)", underlyingTicker: "NVDA", platform: "ondo", address: "0xa9ee28c80f960b889dfbd1902055218cba016f75", decimals: 18 },
  { kind: "stock", symbol: "TSLAon", name: "Tesla (Ondo)", underlyingTicker: "TSLA", platform: "ondo", address: "0x2494b603319d4d9f9715c9f4496d9e0364b59d93", decimals: 18 },
  { kind: "stock", symbol: "SPYon", name: "S&P 500 (Ondo)", underlyingTicker: "SPY", platform: "ondo", address: "0x6a708ead771238919d85930b5a0f10454e1c331a", decimals: 18 },
];

export const STABLES: readonly StableToken[] = [
  { kind: "stable", symbol: "U", name: "U", address: "0xce24439f2d9c6a2289f741120fe202248b666666", decimals: 18, eip3009: { name: "United Stables", version: "1" } },
  { kind: "stable", symbol: "USD1", name: "USD1", address: "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d", decimals: 18, eip3009: { name: "World Liberty Financial USD", version: "1" } },
  { kind: "stable", symbol: "USDT", name: "USDT", address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, eip3009: null },
];

export function normalizeAddress(address: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`invalid address: ${address}`);
  }
  return address.toLowerCase() as Address;
}

export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function getStock(symbol: string): StockToken {
  const stock = STOCKS.find((s) => s.symbol === symbol);
  if (!stock) {
    throw new Error(`unknown stock symbol: ${symbol}`);
  }
  return stock;
}

export function getStable(symbol: StableSymbol): StableToken {
  const stable = STABLES.find((s) => s.symbol === symbol);
  if (!stable) {
    throw new Error(`unknown stable symbol: ${symbol}`);
  }
  return stable;
}

export function findStockByAddress(address: string): StockToken | undefined {
  return STOCKS.find((s) => sameAddress(s.address, address));
}

export function findStableByAddress(address: string): StableToken | undefined {
  return STABLES.find((s) => sameAddress(s.address, address));
}
