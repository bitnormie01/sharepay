import { BinanceApiError } from "@sharepay/core/binance/client";
import { bestSwapRoute, type QuoteRoute, type TradingApi } from "@sharepay/core/binance/trading";
import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { sendPrepared, simulatePrepared, type TxSigner, type WalletMutex } from "@sharepay/core/chain/txpipeline";
import { formatAmount, formatSignificant, sharesFromTokens } from "@sharepay/core/money";
import { AGGREGATION_ROUTER, getStable, getStock, sameAddress } from "@sharepay/core/tokens";
import type { Address, Hex } from "viem";
import type { ActivityStore } from "./activity.js";
import type { SweepConfig } from "./config.js";

export interface SweepDeps {
  trading: TradingApi;
  tx: TransactionApi;
  chain: ChainReader;
  signer: TxSigner;
  mutex: WalletMutex;
  activity: ActivityStore;
  config: SweepConfig;
  receiptTimeoutMs: number;
  nowMs: () => number;
}

export interface SweepState {
  lastSkipAt: Map<string, number>;
}

const MAX_UINT256 = 2n ** 256n - 1n;
const REROUTE_CODES = new Set([40368, 40370, 40374]);
const SKIP_DEDUPE_MS = 10 * 60 * 1000;

class SweepSkip extends Error {}

async function bestRoute(deps: SweepDeps, from: Address, to: Address, amount: bigint): Promise<QuoteRoute | null> {
  const routes = await deps.trading.quote({
    amount,
    fromTokenAddress: from,
    toTokenAddress: to,
    userWalletAddress: deps.signer.address,
    vendor: "LiquidMesh",
  });
  return bestSwapRoute(routes);
}

async function swapLeg(deps: SweepDeps, from: Address, to: Address, amount: bigint, done: Hex[]): Promise<bigint> {
  const first = await bestRoute(deps, from, to, amount);
  if (!first) throw new SweepSkip(`no SWAP route from ${from} to ${to}`);
  const impact = Number(first.priceImpactPercent ?? "0");
  if (Number.isFinite(impact) && impact > deps.config.maxPriceImpactPercent) {
    throw new SweepSkip(`price impact ${impact}% is above ${deps.config.maxPriceImpactPercent}%`);
  }
  const pipeline = { tx: deps.tx, chain: deps.chain, signer: deps.signer };
  const spender = (first.approveTarget ?? AGGREGATION_ROUTER) as Address;
  let route: QuoteRoute | null = first;
  const allowance = await deps.chain.allowance(from, deps.signer.address, spender);
  if (allowance < amount) {
    const approve = await deps.trading.approveTransaction({ tokenContractAddress: from, approveAmount: MAX_UINT256 });
    if (!sameAddress(approve.dexContractAddress, spender)) {
      throw new SweepSkip(`approve spender ${approve.dexContractAddress} does not match route spender ${spender}`);
    }
    const approval = { to: from, data: approve.data as Hex, value: 0n };
    const simulation = await simulatePrepared(deps.tx, deps.signer.address, approval);
    if (!simulation.ok) throw new SweepSkip(`approve simulation failed: ${simulation.failReason ?? simulation.status}`);
    const sent = await deps.mutex(() =>
      sendPrepared(pipeline, approval, { mevProtection: false, receiptTimeoutMs: deps.receiptTimeoutMs, gasFallback: 80_000n }),
    );
    done.push(sent.txHash);
    route = await bestRoute(deps, from, to, amount);
    if (!route) throw new SweepSkip(`no SWAP route from ${from} to ${to} after approval`);
  }
  const build = await deps.trading.swap({
    amount,
    fromTokenAddress: from,
    toTokenAddress: to,
    userWalletAddress: deps.signer.address,
    quoteId: route.quoteId,
    slippagePercent: deps.config.slippagePercent,
  });
  if ((build.executionMode ?? "").toUpperCase() !== "SWAP" || !build.tx) {
    throw new SweepSkip("swap build is not a SWAP transaction");
  }
  const swap = { to: build.tx.to as Address, data: build.tx.data as Hex, value: BigInt(build.tx.value ?? "0") };
  const simulation = await simulatePrepared(deps.tx, deps.signer.address, swap);
  if (!simulation.ok) throw new SweepSkip(`swap simulation failed: ${simulation.failReason ?? simulation.status}`);
  const before = await deps.chain.balanceOf(to, deps.signer.address);
  const sent = await deps.mutex(() =>
    sendPrepared(pipeline, swap, { mevProtection: true, receiptTimeoutMs: deps.receiptTimeoutMs, gasFallback: 400_000n }),
  );
  done.push(sent.txHash);
  const after = await deps.chain.balanceOf(to, deps.signer.address);
  return after > before ? after - before : 0n;
}

export async function runSweepOnce(
  deps: SweepDeps,
  triggeredBy: string | null,
  state: SweepState = { lastSkipAt: new Map<string, number>() },
): Promise<void> {
  const spyb = getStock("SPYB");
  const usdt = getStable("USDT");
  for (const symbol of ["U", "USD1"] as const) {
    const stable = getStable(symbol);
    const balance = await deps.chain.balanceOf(stable.address, deps.signer.address);
    const available = balance > deps.config.floatAtomic ? balance - deps.config.floatAtomic : 0n;
    const amount = available < deps.config.maxAtomic ? available : deps.config.maxAtomic;
    if (amount === 0n || amount < deps.config.minAtomic) continue;
    const amountUsd = formatAmount(amount, 18, 2);
    const done: Hex[] = [];
    try {
      let direct = true;
      try {
        if (!(await bestRoute(deps, stable.address, spyb.address, amount))) direct = false;
      } catch (error) {
        if (error instanceof BinanceApiError && error.code !== null && REROUTE_CODES.has(error.code)) direct = false;
        else throw error;
      }
      let received: bigint;
      if (direct) {
        received = await swapLeg(deps, stable.address, spyb.address, amount, done);
      } else {
        const usdtReceived = await swapLeg(deps, stable.address, usdt.address, amount, done);
        if (usdtReceived === 0n) throw new SweepSkip("first leg returned no USDT");
        received = await swapLeg(deps, usdt.address, spyb.address, usdtReceived, done);
      }
      const multiplier = await deps.chain.uiMultiplier(spyb.address);
      const shares = formatSignificant(sharesFromTokens(received, multiplier), 18, 3);
      deps.activity.add({
        kind: "sweep",
        summary: `Reinvested $${amountUsd} into ${shares} S&P 500 shares (SPYB)`,
        amountUsd,
        txHashes: done,
        payer: null,
        triggeredBy,
        spyShares: shares,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const now = deps.nowMs();
      const last = state.lastSkipAt.get(reason);
      if (last === undefined || now - last >= SKIP_DEDUPE_MS || done.length > 0) {
        state.lastSkipAt.set(reason, now);
        deps.activity.add({
          kind: "sweep_skipped",
          summary: `Reinvest postponed: ${reason}`,
          amountUsd,
          txHashes: done,
          payer: null,
          triggeredBy,
          spyShares: null,
        });
      }
    }
  }
}

export function createSweeper(deps: SweepDeps): {
  trigger(triggeredBy: string | null): void;
  start(): void;
  stop(): void;
  idle(): Promise<void>;
} {
  const state: SweepState = { lastSkipAt: new Map<string, number>() };
  let running: Promise<void> | null = null;
  let pending = false;
  let pendingTrigger: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function trigger(triggeredBy: string | null): void {
    if (!deps.config.enabled) return;
    if (running) {
      pending = true;
      pendingTrigger = triggeredBy;
      return;
    }
    running = (async () => {
      let current: string | null = triggeredBy;
      for (;;) {
        try {
          await runSweepOnce(deps, current, state);
        } catch {
          // runSweepOnce records its own skips; a failed read must not kill the loop
        }
        if (!pending) break;
        pending = false;
        current = pendingTrigger;
        pendingTrigger = null;
      }
    })().finally(() => {
      running = null;
    });
  }

  return {
    trigger,
    start() {
      if (!deps.config.enabled || timer) return;
      timer = setInterval(() => trigger(null), deps.config.intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    async idle() {
      while (running) await running;
    },
  };
}
