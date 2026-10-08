import { randomUUID } from "node:crypto";
import { runCheckout } from "@sharepay/buyer/checkout";
import { loadHoldings, loadMarketSnapshot, type MarketSnapshot } from "@sharepay/buyer/holdings";
import { createReceiptStore, type ReceiptStore } from "@sharepay/buyer/ledger";
import { fetchMerchantActivity } from "@sharepay/buyer/merchantFeed";
import { cmcDossierAdapter } from "@sharepay/buyer/merchants/cmcDossier";
import { sharepayReportAdapter } from "@sharepay/buyer/merchants/sharepayReport";
import { stockAnalystAdapter } from "@sharepay/buyer/merchants/stockAnalyst";
import { probeRoute, type ProbeParams } from "@sharepay/buyer/routeProbe";
import { createAgenticWallet } from "@sharepay/buyer/wallets/agenticWallet";
import { createApiSignerWallet } from "@sharepay/buyer/wallets/apiSigner";
import { createBawClient, nodeExec, type ExecFn } from "@sharepay/buyer/wallets/baw";
import type { PayerWallet } from "@sharepay/buyer/wallets/types";
import { BinanceApiError, createBinanceClient, type BinanceClient } from "@sharepay/core/binance/client";
import { createRwaApi } from "@sharepay/core/binance/rwa";
import { createTradingApi } from "@sharepay/core/binance/trading";
import { createTransactionApi } from "@sharepay/core/binance/transaction";
import { createWalletApi } from "@sharepay/core/binance/wallet";
import { createChainReader, type ChainReader } from "@sharepay/core/chain/rpc";
import { createWalletMutex } from "@sharepay/core/chain/txpipeline";
import { createJsonlSink } from "@sharepay/core/devex";
import type { ItemId, Receipt } from "@sharepay/core/dto";
import type { Express } from "express";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "./app.js";
import { createCatalog, type Catalog } from "./catalog.js";
import { createCheckoutRegistry } from "./checkouts.js";
import type { CheckoutConfig } from "./config.js";
import { createLedgerView } from "./ledgerView.js";
import { createLiveGate } from "./liveGate.js";
import { createPickerView } from "./pickerView.js";

export const OWN_ITEM: ItemId = "sharepay-nvda-report";

export interface ServiceIo {
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  exec?: ExecFn;
  chain?: ChainReader;
  binance?: BinanceClient;
}

export interface Services {
  app: Express;
  walletFor(itemId: ItemId): PayerWallet;
  catalog: Catalog;
  receipts: ReceiptStore;
}

export function memoize<T>(fn: () => Promise<T>, ttlMs: number, nowMs: () => number): () => Promise<T> {
  let cached: { at: number; value: Promise<T> } | null = null;
  return () => {
    if (cached && nowMs() - cached.at < ttlMs) return cached.value;
    const entry = { at: nowMs(), value: fn() };
    cached = entry;
    entry.value.catch(() => {
      if (cached === entry) cached = null;
    });
    return entry.value;
  };
}

export function receiptVerifier(chain: Pick<ChainReader, "waitForReceipt">): (receipt: Receipt) => Promise<boolean> {
  return async (receipt) => {
    const hash = receipt.settlementTxHash ?? receipt.swapTxHashes[0];
    if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return false;
    const mined = await chain.waitForReceipt(hash as Hex, 10_000);
    return mined.status === "success";
  };
}

function errorText(error: unknown): string {
  if (error instanceof BinanceApiError) return `${error.code ?? `http ${error.httpStatus}`} ${error.apiMsg}`;
  return error instanceof Error ? error.message : String(error);
}

async function healthCheck(check: () => Promise<string>): Promise<{ ok: boolean; detail: string }> {
  try {
    return { ok: true, detail: await check() };
  } catch (error) {
    return { ok: false, detail: errorText(error) };
  }
}

export async function createServices(config: CheckoutConfig, io: ServiceIo = {}): Promise<Services> {
  const fetchImpl = io.fetchImpl ?? fetch;
  const nowMs = io.nowMs ?? (() => Date.now());
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let client = io.binance ?? null;
  if (!client) {
    if (!config.binance) throw new Error("BINANCE_API_KEY and BINANCE_API_SECRET are required");
    client = createBinanceClient({
      credentials: config.binance,
      fetchImpl,
      telemetry: config.devexEventsPath ? createJsonlSink(config.devexEventsPath) : undefined,
    });
  }
  const rwa = createRwaApi(client);
  const trading = createTradingApi(client);
  const tx = createTransactionApi(client);
  const walletApi = createWalletApi(client);
  const chain = io.chain ?? createChainReader({ rpcUrl: config.rpcUrl });

  const apiSigner = config.buyerPrivateKey
    ? createApiSignerWallet({
        trading,
        tx,
        chain,
        account: privateKeyToAccount(config.buyerPrivateKey),
        mutex: createWalletMutex(),
        slippagePercent: "1",
        receiptTimeoutMs: 60_000,
      })
    : null;
  const agentic =
    config.walletMode === "agentic-wallet"
      ? createAgenticWallet({
          baw: createBawClient(io.exec ?? nodeExec, config.bawBin),
          sim: { trading, tx, chain, slippagePercent: "1" },
          chain,
          sleep,
          nowMs,
        })
      : null;
  const primary = agentic ?? apiSigner;
  if (!primary) throw new Error("the api-signer wallet needs BUYER_PRIVATE_KEY");
  const walletFor = (itemId: ItemId): PayerWallet =>
    agentic && (itemId !== OWN_ITEM || config.awPaysOwnMerchant) ? agentic : apiSigner ?? primary;

  const snapshot = memoize(() => loadMarketSnapshot(rwa, nowMs()), 30_000, nowMs);
  const holdings = (owner: Address, snap: MarketSnapshot) => loadHoldings({ wallet: walletApi, chain }, owner, snap);
  const probe = (params: ProbeParams) => probeRoute(trading, params);
  const receipts = await createReceiptStore({
    seedPath: config.receiptsSeedPath,
    runtimePath: config.receiptsRuntimePath,
    verify: receiptVerifier(chain),
  });
  const catalog = createCatalog({
    adapters: [sharepayReportAdapter(config.merchantUrl), stockAnalystAdapter(), cmcDossierAdapter()],
    ownItemId: OWN_ITEM,
    merchantUrl: config.merchantUrl,
    fetchImpl,
    nowMs,
    sleep,
  });
  const gate = createLiveGate({ passcode: config.livePasscode, maxCount: config.liveDailyMaxCount, maxUsd: config.liveDailyMaxUsd, nowMs });
  const checkouts = createCheckoutRegistry({
    nowMs,
    run: (request, onSaleBroadcast, emit) =>
      runCheckout(
        { walletFor, trading, snapshot, holdings, probe, fetchImpl, sleep, nowMs, receipts, merchantUrl: config.merchantUrl, onSaleBroadcast },
        request,
        emit,
      ),
  });

  let buyerAddress = "";
  try {
    buyerAddress = await primary.address();
  } catch {
    buyerAddress = "";
  }

  const app = createApp({
    health: () => ({ ok: true, walletMode: config.walletMode, buyerAddress, merchantUrl: config.merchantUrl, version: config.version }),
    deepHealth: async () => ({
      deep: {
        binance: await healthCheck(async () => `${(await rwa.tokens()).length} RWA tokens (code 0)`),
        rpc: await healthCheck(async () => {
          await chain.nativeBalance((buyerAddress || "0x0000000000000000000000000000000000000000") as Address);
          return "BSC RPC reachable";
        }),
        merchant: await healthCheck(async () => {
          const response = await fetchImpl(`${config.merchantUrl}/sharepay/health`, { signal: AbortSignal.timeout(90_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return `HTTP ${response.status}`;
        }),
      },
    }),
    catalog,
    picker: createPickerView({ catalog, walletFor, snapshot, holdings, probe, nowMs }),
    ledger: createLedgerView({
      wallet: primary,
      walletLabel: config.walletMode === "agentic-wallet" ? "Agentic Wallet · shares only" : "Demo wallet · shares only",
      snapshot,
      holdings,
      receipts,
    }),
    merchantActivity: () => fetchMerchantActivity(fetchImpl, config.merchantUrl, null),
    gate,
    checkouts,
    newId: () => randomUUID(),
    webDist: config.webDist,
  });

  return { app, walletFor, catalog, receipts };
}
