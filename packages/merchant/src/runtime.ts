import { BinanceApiError, createBinanceClient } from "@sharepay/core/binance/client";
import { createRwaApi } from "@sharepay/core/binance/rwa";
import { createTradingApi } from "@sharepay/core/binance/trading";
import { createTransactionApi } from "@sharepay/core/binance/transaction";
import { createChainReader } from "@sharepay/core/chain/rpc";
import { createWalletMutex, type TxSigner } from "@sharepay/core/chain/txpipeline";
import { createJsonlSink } from "@sharepay/core/devex";
import { createActivityStore } from "./activity.js";
import { loadMerchantConfig } from "./config.js";
import { buildResearchReport, createReportCache } from "./report.js";
import type { MerchantRuntime } from "./routes.js";
import { settlePayment } from "./settle.js";
import { createSweeper } from "./sweeper.js";
import { verifyPayment } from "./verify.js";

export async function createMerchantRuntime(options: {
  env: Record<string, string | undefined>;
  signer: TxSigner;
  fetchImpl?: typeof fetch;
}): Promise<MerchantRuntime> {
  const config = loadMerchantConfig(options.env);
  if (!config.binance) {
    throw new Error("BINANCE_API_KEY and BINANCE_API_SECRET are required for the merchant agent");
  }
  const client = createBinanceClient({
    credentials: config.binance,
    fetchImpl: options.fetchImpl,
    telemetry: config.devexEventsPath ? createJsonlSink(config.devexEventsPath) : undefined,
  });
  const rwa = createRwaApi(client);
  const trading = createTradingApi(client);
  const tx = createTransactionApi(client);
  const chain = createChainReader({ rpcUrl: config.rpcUrl });
  const mutex = createWalletMutex();
  const inFlight = new Set<string>();
  const activity = createActivityStore({ path: config.activityPath, seedPath: config.activitySeedPath, now: () => new Date() });
  const getReport = createReportCache((symbol) => buildResearchReport({ rwa, now: () => new Date() }, symbol), config.reportCacheMs, Date.now);
  const sweeper = createSweeper({
    trading,
    tx,
    chain,
    signer: options.signer,
    mutex,
    activity,
    config: config.sweep,
    receiptTimeoutMs: 90_000,
    nowMs: Date.now,
  });
  sweeper.start();
  return {
    config,
    payTo: options.signer.address,
    getReport,
    verify: (required, headerValue) =>
      verifyPayment(
        {
          chain,
          simulate: (input) => tx.simulate(input),
          settlerAddress: options.signer.address,
          nowSec: () => Math.floor(Date.now() / 1000),
          inFlight,
        },
        required,
        headerValue,
      ),
    settle: (asset, calldata) => settlePayment({ pipeline: { tx, chain, signer: options.signer }, mutex, receiptTimeoutMs: 60_000 }, asset, calldata),
    activity,
    sweeper,
    inFlight,
    deepHealth: async () => {
      try {
        await rwa.tokens({ platformId: "bstock" });
        return { rwaCode: 0, rwaMessage: "ok" };
      } catch (error) {
        if (error instanceof BinanceApiError) return { rwaCode: error.code, rwaMessage: error.apiMsg };
        return { rwaCode: null, rwaMessage: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
