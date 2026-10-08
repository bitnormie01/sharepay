import type { TradingApi } from "@sharepay/core/binance/trading";
import {
  bscscanTx,
  initialSteps,
  type CheckoutMode,
  type CheckoutState,
  type CheckoutStep,
  type ItemId,
  type Receipt,
  type StepId,
} from "@sharepay/core/dto";
import { ONE, formatAmount, formatSignificant, mulDivUp, sharesFromTokens } from "@sharepay/core/money";
import { getStable, sameAddress } from "@sharepay/core/tokens";
import type { Address } from "viem";
import type { Holding, MarketSnapshot } from "./holdings.js";
import type { ReceiptStore } from "./ledger.js";
import { waitForReinvest } from "./merchantFeed.js";
import type { MerchantAdapter } from "./merchants/types.js";
import { estimateSale, planSale } from "./planner.js";
import type { ProbeParams, RouteOutcome } from "./routeProbe.js";
import { classifyStatus } from "./status.js";
import type { PayerWallet } from "./wallets/types.js";
import { fetchChallenge, replayWithPayment } from "./x402client.js";

export interface CheckoutDeps {
  walletFor: (itemId: ItemId) => PayerWallet;
  trading: TradingApi;
  snapshot: () => Promise<MarketSnapshot>;
  holdings: (owner: Address, snapshot: MarketSnapshot) => Promise<Holding[]>;
  probe: (params: ProbeParams) => Promise<RouteOutcome>;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  nowMs: () => number;
  receipts: ReceiptStore;
  merchantUrl: string;
  onSaleBroadcast?: () => void;
}

export interface CheckoutRequest {
  id: string;
  adapter: MerchantAdapter;
  tokenAddress: Address;
  mode: CheckoutMode;
}

export const MAX_PAYMENT_ATOMIC = 250000000000000000n;

export function formatPriceUsd(amount: bigint): string {
  const cents = mulDivUp(amount, 100n, ONE);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

class StepFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function codeOf(error: unknown): string {
  if (error instanceof StepFailure) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "unexpected_error";
}

export async function runCheckout(deps: CheckoutDeps, request: CheckoutRequest, emit: (state: CheckoutState) => void): Promise<CheckoutState> {
  const iso = () => new Date(deps.nowMs()).toISOString();
  const state: CheckoutState = {
    id: request.id,
    itemId: request.adapter.id,
    mode: request.mode,
    tokenAddress: request.tokenAddress,
    status: "running",
    steps: initialSteps(iso()),
    receipt: null,
    deliverable: null,
    error: null,
    etaSec: null,
    jobStartedAt: null,
    lastPolledAt: null,
    startedAt: iso(),
    finishedAt: null,
  };
  const publish = () => emit(structuredClone(state));
  const step = (id: StepId): CheckoutStep => {
    const found = state.steps.find((s) => s.id === id);
    if (!found) throw new Error(`unknown step ${id}`);
    return found;
  };
  const set = (id: StepId, patch: Partial<CheckoutStep>) => {
    Object.assign(step(id), patch, { updatedAt: iso() });
    publish();
  };
  let current: StepId = "challenge";
  const begin = (id: StepId) => {
    current = id;
    set(id, { status: "running" });
  };

  publish();
  const wallet = deps.walletFor(request.adapter.id);
  try {
    begin("challenge");
    const paid = request.adapter.request();
    const { challenge, selected } = await fetchChallenge(deps.fetchImpl, paid, {
      maxAmount: MAX_PAYMENT_ATOMIC,
      preferredAssets: [getStable("U").address, getStable("USD1").address],
    });
    const priceAtomic = BigInt(selected.accept.amount);
    const paidUsd = formatPriceUsd(priceAtomic);
    set("challenge", {
      status: "done",
      summary: `${request.adapter.title} costs $${paidUsd}`,
      detail: { merchant: request.adapter.merchantName, asset: selected.stable.symbol, amount: selected.accept.amount, payTo: selected.accept.payTo, network: selected.accept.network },
    });

    begin("quote");
    const owner = await wallet.address();
    const snapshot = await deps.snapshot();
    const holdings = await deps.holdings(owner, snapshot);
    const holding = holdings.find((h) => sameAddress(h.stock.address, request.tokenAddress));
    if (!holding) throw new StepFailure("not_held", "This wallet holds none of the selected stock");
    const status = classifyStatus(holding.status);
    if (status.cls === "hard") throw new StepFailure(status.code, status.message);
    const estimate = estimateSale({ priceAtomic, tokenPriceUsd: holding.priceUsd, sharesPerToken: holding.sharesPerToken });
    const outcome = await deps.probe({ stock: holding.stock.address, payAsset: selected.stable.address, sellAmount: estimate.sellAmount, wallet: owner });
    if (outcome.kind !== "swap") throw new StepFailure(outcome.kind, outcome.message);
    const plan = await planSale(deps.trading, { stock: holding.stock, payAsset: selected.stable.address, priceAtomic, estimate, outcome, wallet: owner, balance: holding.balance });
    const sharesSold = formatSignificant(sharesFromTokens(plan.sellAmount, holding.sharesPerToken), 18, 3);
    const tokensSold = formatSignificant(plan.sellAmount, 18, 4);
    set("quote", {
      status: "done",
      summary: `Sell ≈${sharesSold} ${holding.stock.name} shares for $${paidUsd}`,
      detail: { token: holding.stock.symbol, tokensSold, expectedOut: formatAmount(plan.expectedOut, 18, 6), legs: String(plan.legs.length), priceImpactPercent: plan.priceImpactPercent ?? "n/a", marketStatus: status.message },
    });

    begin("simulate");
    const simulation = await wallet.simulateSale(plan);
    if (!simulation.ok) throw new StepFailure("simulation_failed", simulation.failReason ?? "simulation failed");
    set("simulate", {
      status: "done",
      summary: simulation.mode === "swap" ? "The sale was simulated on BSC and succeeds" : "The approval was simulated; the swap can be simulated after it lands",
      detail: { ...simulation.detail, mode: simulation.mode, wallet: wallet.kind },
    });

    if (request.mode === "simulate") {
      for (const id of ["sell", "authorize", "settle", "deliver", "reinvest"] as const) {
        Object.assign(step(id), { status: "skipped", summary: "Simulate mode: nothing signed or broadcast", updatedAt: iso() });
      }
      state.status = "succeeded";
      state.finishedAt = iso();
      publish();
      return structuredClone(state);
    }

    begin("sell");
    // The live slot is consumed by the sale's first broadcast; a check that fails before it releases the slot.
    let slotTaken = false;
    const execution = await wallet.executeSale(plan, () => {
      if (slotTaken) return;
      slotTaken = true;
      deps.onSaleBroadcast?.();
    });
    set("sell", {
      status: "done",
      summary: `Sold ${sharesSold} ${holding.stock.name} shares`,
      detail: { received: formatAmount(execution.received, 18, 6), asset: selected.stable.symbol },
      links: execution.txHashes.map((hash, i) => ({ label: `Sale tx ${i + 1}`, href: bscscanTx(hash) })),
    });

    begin("authorize");
    const header = await wallet.signPayment(challenge, selected, Math.floor(deps.nowMs() / 1000));
    set("authorize", { status: "done", summary: `Payment of $${paidUsd} approved`, detail: { method: "EIP-3009 transferWithAuthorization", header: header.name } });

    begin("settle");
    if (request.adapter.kind === "async") {
      state.status = "awaiting_delivery";
      state.etaSec = request.adapter.etaSec;
      publish();
    }
    let replay: Awaited<ReturnType<typeof replayWithPayment>>;
    try {
      replay = await replayWithPayment(deps.fetchImpl, paid, header);
    } catch (error) {
      throw new StepFailure("delivery_unknown", `The payment was signed but the merchant did not answer: ${error instanceof Error ? error.message : String(error)}`);
    }
    const accepted = replay.response.status < 400 && (replay.settlement === null || replay.settlement.success);
    if (!accepted) {
      const reason = replay.settlement?.errorReason ?? `HTTP ${replay.response.status}`;
      throw new StepFailure("settle_failed", `The merchant refused the payment: ${reason}`);
    }
    const settlementTx = replay.settlement?.transaction ? replay.settlement.transaction : null;
    set("settle", {
      status: "done",
      summary: settlementTx ? "The merchant settled the payment on BSC" : "Settled by the merchant's facilitator",
      detail: { network: replay.settlement?.network ?? selected.accept.network, payer: replay.settlement?.payer ?? owner },
      links: settlementTx ? [{ label: "Settlement tx", href: bscscanTx(settlementTx) }] : [],
    });
    const receipt: Receipt = {
      id: request.id,
      itemId: request.adapter.id,
      itemTitle: request.adapter.title,
      merchantName: request.adapter.merchantName,
      paidUsd,
      paidAmount: formatAmount(priceAtomic, 18, 6),
      paidAsset: selected.stable.symbol,
      stockSymbol: holding.stock.symbol,
      stockName: holding.stock.name,
      sharesSold,
      tokensSold,
      swapTxHashes: execution.txHashes,
      settlementTxHash: settlementTx,
      reinvestTxHash: null,
      createdAt: iso(),
      wallet: wallet.kind,
    };
    state.receipt = receipt;
    deps.receipts.add(receipt);
    publish();

    begin("deliver");
    state.deliverable = await request.adapter.deliver(replay.response, {
      fetchImpl: deps.fetchImpl,
      sleep: deps.sleep,
      nowMs: deps.nowMs,
      onProgress: (update) => {
        state.status = "awaiting_delivery";
        state.etaSec = update.etaSec;
        state.jobStartedAt = update.jobStartedAt;
        state.lastPolledAt = update.lastPolledAt;
        set("deliver", { status: "running", summary: update.note });
      },
    });
    state.status = "running";
    state.etaSec = null;
    set("deliver", { status: "done", summary: `${request.adapter.title} delivered` });

    begin("reinvest");
    if (request.adapter.id !== "sharepay-nvda-report" || !settlementTx) {
      set("reinvest", { status: "skipped", summary: "Only SharePay's own merchant reinvests" });
    } else {
      const sweep = await waitForReinvest(deps.fetchImpl, deps.merchantUrl, settlementTx, { timeoutMs: 120_000, pollMs: 5_000, sleep: deps.sleep, nowMs: deps.nowMs });
      if (sweep && sweep.kind === "sweep") {
        const reinvestTx = sweep.txHashes[sweep.txHashes.length - 1] ?? null;
        receipt.reinvestTxHash = reinvestTx;
        deps.receipts.update(receipt.id, { reinvestTxHash: reinvestTx });
        set("reinvest", { status: "done", summary: sweep.summary, links: sweep.txHashes.map((hash, i) => ({ label: `Reinvest tx ${i + 1}`, href: bscscanTx(hash) })) });
      } else if (sweep) {
        set("reinvest", { status: "skipped", summary: sweep.summary });
      } else {
        set("reinvest", { status: "skipped", summary: "Reinvest pending on the merchant agent" });
      }
    }

    state.status = "succeeded";
    state.finishedAt = iso();
    publish();
    return structuredClone(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Object.assign(step(current), { status: "failed", summary: message, updatedAt: iso() });
    state.status = "failed";
    state.etaSec = null;
    state.error = { code: codeOf(error), message };
    state.finishedAt = iso();
    publish();
    return structuredClone(state);
  }
}
