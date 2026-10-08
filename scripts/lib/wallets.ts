import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadHoldings, loadMarketSnapshot } from "@sharepay/buyer/holdings";
import type { SalePlan } from "@sharepay/buyer/planner";
import { probeRoute } from "@sharepay/buyer/routeProbe";
import { MAX_UINT256 } from "@sharepay/buyer/wallets/simulate";
import type { RwaApi } from "@sharepay/core/binance/rwa";
import type { TradingApi } from "@sharepay/core/binance/trading";
import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { WalletApi } from "@sharepay/core/binance/wallet";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { sendPrepared, simulatePrepared, type TxSigner } from "@sharepay/core/chain/txpipeline";
import { formatAmount, formatSignificant, sharesFromTokens, toUnits, usdValue } from "@sharepay/core/money";
import { AGGREGATION_ROUTER, STABLES, getStable, getStock, sameAddress } from "@sharepay/core/tokens";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { envValue, upsertEnvLine } from "./env.js";

function normalizeKey(raw: string): Hex {
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

export function newBurner(root: string, generate: () => Hex = generatePrivateKey): { address: Address; created: boolean } {
  const envPath = join(root, ".env");
  const examplePath = join(root, ".env.example");
  const text = existsSync(envPath) ? readFileSync(envPath, "utf8") : existsSync(examplePath) ? readFileSync(examplePath, "utf8") : "";
  const existing = envValue(text, "BUYER_PRIVATE_KEY");
  if (existing) return { address: privateKeyToAccount(normalizeKey(existing)).address, created: false };
  const key = generate();
  writeFileSync(envPath, upsertEnvLine(text, "BUYER_PRIVATE_KEY", key), "utf8");
  return { address: privateKeyToAccount(key).address, created: true };
}

export interface WalletReadDeps {
  rwa: RwaApi;
  walletApi: WalletApi;
  chain: ChainReader;
  nowMs: () => number;
}

export async function describeBalances(deps: WalletReadDeps, owner: Address): Promise<string[]> {
  const snapshot = await loadMarketSnapshot(deps.rwa, deps.nowMs());
  const holdings = await loadHoldings({ wallet: deps.walletApi, chain: deps.chain }, owner, snapshot);
  const lines = [`Wallet ${owner}`];
  for (const holding of holdings) {
    const shares = formatSignificant(sharesFromTokens(holding.balance, holding.sharesPerToken), 18, 4);
    const value = holding.priceUsd ? ` (~$${usdValue(holding.balance, holding.priceUsd)})` : "";
    lines.push(`  ${holding.stock.name} (${holding.stock.symbol}): ${shares} shares${value}`);
  }
  if (holdings.length === 0) lines.push("  no tokenized stocks");
  for (const stable of STABLES) lines.push(`  ${stable.symbol}: ${formatAmount(await deps.chain.balanceOf(stable.address, owner), 18, 6)}`);
  lines.push(`  BNB: ${formatAmount(await deps.chain.nativeBalance(owner), 18, 6)}`);
  return lines;
}

export async function planBuy(trading: TradingApi, owner: Address, stockSymbol: string, usdt: string): Promise<SalePlan> {
  const stock = getStock(stockSymbol);
  const amount = toUnits(usdt, 18);
  const outcome = await probeRoute(trading, { stock: getStable("USDT").address, payAsset: stock.address, sellAmount: amount, wallet: owner });
  if (outcome.kind !== "swap") throw new Error(`no SWAP route to buy ${stock.symbol}: ${outcome.message}`);
  return {
    stock,
    payAsset: stock.address,
    priceAtomic: (outcome.expectedOut * 97n) / 100n,
    legs: outcome.legs,
    sellAmount: amount,
    expectedOut: outcome.expectedOut,
    priceImpactPercent: outcome.priceImpactPercent,
  };
}

export async function saleRoute(trading: TradingApi, stock: Address, owner: Address, balance: bigint): Promise<{ spender: Address; vendor: string | undefined }> {
  const amount = balance >= 10n ? balance / 10n : 10n ** 14n;
  const outcome = await probeRoute(trading, { stock, payAsset: getStable("U").address, sellAmount: amount, wallet: owner });
  if (outcome.kind !== "swap") return { spender: AGGREGATION_ROUTER, vendor: undefined };
  const first = outcome.legs[0];
  return { spender: (first?.route.approveTarget ?? AGGREGATION_ROUTER) as Address, vendor: first?.route.vendorName ?? undefined };
}

export interface ApproveDeps {
  trading: TradingApi;
  tx: TransactionApi;
  chain: ChainReader;
  signer: TxSigner;
  receiptTimeoutMs: number;
}

export async function approveForSale(deps: ApproveDeps, stockSymbol: string): Promise<{ spender: Address; txHash: Hex | null }> {
  const stock = getStock(stockSymbol);
  const owner = deps.signer.address;
  const balance = await deps.chain.balanceOf(stock.address, owner);
  const { spender, vendor } = await saleRoute(deps.trading, stock.address, owner, balance);
  if ((await deps.chain.allowance(stock.address, owner, spender)) >= MAX_UINT256 / 2n) return { spender, txHash: null };
  const approve = await deps.trading.approveTransaction({ tokenContractAddress: stock.address, approveAmount: MAX_UINT256, vendor });
  if (!sameAddress(approve.dexContractAddress, spender)) {
    throw new Error(`approve spender ${approve.dexContractAddress} does not match the sale route's spender ${spender}`);
  }
  const prepared = { to: stock.address, data: approve.data as Hex, value: 0n };
  const simulation = await simulatePrepared(deps.tx, owner, prepared);
  if (!simulation.ok) throw new Error(`approve simulation failed: ${simulation.failReason ?? simulation.status}`);
  const { txHash } = await sendPrepared({ tx: deps.tx, chain: deps.chain, signer: deps.signer }, prepared, {
    mevProtection: false,
    receiptTimeoutMs: deps.receiptTimeoutMs,
    gasFallback: 80_000n,
  });
  return { spender, txHash };
}

export interface FundingTarget {
  label: string;
  address: Address;
  requireStock: boolean;
  requireApproval: boolean;
}

export async function verifyFunding(
  deps: { trading: TradingApi; chain: ChainReader },
  targets: FundingTarget[],
  options: { stocks: readonly string[]; minBnbWei: bigint },
): Promise<{ ok: boolean; lines: string[] }> {
  const stocks = options.stocks.map((symbol) => getStock(symbol));
  const lines: string[] = [];
  let ok = targets.length > 0 && stocks.length > 0;
  for (const target of targets) {
    const parts: string[] = [];
    const problems: string[] = [];
    if (target.requireStock) {
      for (const stock of stocks) {
        const balance = await deps.chain.balanceOf(stock.address, target.address);
        parts.push(`${stock.symbol} ${formatAmount(balance, 18, 6)}`);
        if (balance === 0n) problems.push(`holds no ${stock.symbol}`);
        if (target.requireApproval && balance > 0n) {
          const { spender } = await saleRoute(deps.trading, stock.address, target.address, balance);
          const approved = (await deps.chain.allowance(stock.address, target.address, spender)) >= balance;
          parts.push(`${approved ? "approved" : "not approved"} for ${spender}`);
          if (!approved && !problems.includes("run npm run ops -- approve")) problems.push("run npm run ops -- approve");
        }
      }
    }
    const bnb = await deps.chain.nativeBalance(target.address);
    parts.push(`BNB ${formatAmount(bnb, 18, 6)}`);
    if (bnb < options.minBnbWei) problems.push(`needs at least ${formatAmount(options.minBnbWei, 18, 6)} BNB for gas`);
    if (problems.length > 0) ok = false;
    lines.push(`${target.label} ${target.address}: ${parts.join(" · ")} → ${problems.length === 0 ? "OK" : `FAIL (${problems.join("; ")})`}`);
  }
  return { ok, lines };
}

export function merchantAddressFromToml(text: string): Address | null {
  const match = text.match(/^\s*address\s*=\s*"(0x[0-9a-fA-F]{40})"/m);
  return match?.[1] ? (match[1] as Address) : null;
}
