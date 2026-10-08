import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { createApiSignerWallet } from "@sharepay/buyer/wallets/apiSigner";
import { createBawClient, nodeExec } from "@sharepay/buyer/wallets/baw";
import { createBinanceClient } from "@sharepay/core/binance/client";
import { createRwaApi } from "@sharepay/core/binance/rwa";
import { createTradingApi } from "@sharepay/core/binance/trading";
import { createTransactionApi } from "@sharepay/core/binance/transaction";
import { createWalletApi } from "@sharepay/core/binance/wallet";
import { createChainReader } from "@sharepay/core/chain/rpc";
import { createWalletMutex, viemTxSigner } from "@sharepay/core/chain/txpipeline";
import { createJsonlSink } from "@sharepay/core/devex";
import { formatAmount, formatSignificant } from "@sharepay/core/money";
import { STOCKS, getStock } from "@sharepay/core/tokens";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadDotEnv, parseArgs, repoRoot } from "./lib/env.js";
import { approveForSale, describeBalances, merchantAddressFromToml, newBurner, planBuy, verifyFunding, type FundingTarget } from "./lib/wallets.js";

const MIN_BNB_WEI = 500000000000000n;
const root = repoRoot();
loadDotEnv(root);
const args = parseArgs(process.argv.slice(2), new Set(["dry-run"]));

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} must be set in .env`);
  return value;
}

function flag(name: string): string | null {
  const value = args.flags[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function burner() {
  const raw = (process.env.BUYER_PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("BUYER_PRIVATE_KEY is not set: run npm run ops -- new-burner first");
  return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
}

function apis() {
  const devex = process.env.DEVEX_EVENTS_PATH;
  const client = createBinanceClient({
    credentials: { apiKey: required("BINANCE_API_KEY"), secretKey: required("BINANCE_API_SECRET") },
    telemetry: devex ? createJsonlSink(isAbsolute(devex) ? devex : join(root, devex)) : undefined,
  });
  return {
    rwa: createRwaApi(client),
    trading: createTradingApi(client),
    tx: createTransactionApi(client),
    walletApi: createWalletApi(client),
    chain: createChainReader({ rpcUrl: process.env.BSC_RPC_URL || undefined }),
  };
}

function merchantAddress(): Address | null {
  const path = join(root, "sharepaymerchant", "app", "agent", "studio.toml");
  return existsSync(path) ? merchantAddressFromToml(readFileSync(path, "utf8")) : null;
}

const commands: Record<string, () => Promise<boolean>> = {
  "new-burner": async () => {
    const result = newBurner(root);
    console.log(result.created ? `Demo wallet created: ${result.address} (private key written to .env, never printed)` : `Demo wallet already set: ${result.address} (kept the existing key)`);
    return true;
  },
  balances: async () => {
    const { rwa, walletApi, chain } = apis();
    const address = (flag("address") ?? burner().address) as Address;
    for (const line of await describeBalances({ rwa, walletApi, chain, nowMs: () => Date.now() }, address)) console.log(line);
    return true;
  },
  buy: async () => {
    const stock = flag("stock");
    const usdt = flag("usdt");
    if (!stock || !usdt) throw new Error("usage: npm run ops -- buy --stock NVDAB --usdt 2.50 [--dry-run]");
    const { trading, tx, chain } = apis();
    const account = burner();
    const wallet = createApiSignerWallet({ trading, tx, chain, account, mutex: createWalletMutex(), slippagePercent: "1", receiptTimeoutMs: 90_000 });
    const plan = await planBuy(trading, account.address, stock, usdt);
    console.log(`Buying ≈${formatSignificant(plan.expectedOut, 18, 4)} ${plan.stock.symbol} with ${usdt} USDT (${plan.legs.length} leg${plan.legs.length === 1 ? "" : "s"}, minimum ${formatSignificant(plan.priceAtomic, 18, 4)})`);
    if (args.flags["dry-run"] === true) {
      const simulation = await wallet.simulateSale(plan);
      console.log(`Dry-run (${simulation.mode}): ${simulation.ok ? "simulation OK" : `simulation FAILED: ${simulation.failReason ?? "unknown"}`}`);
      return simulation.ok;
    }
    const execution = await wallet.executeSale(plan);
    console.log(`Received ${formatAmount(execution.received, 18, 6)} ${plan.stock.symbol}`);
    for (const hash of execution.txHashes) console.log(`  https://bscscan.com/tx/${hash}`);
    return true;
  },
  approve: async () => {
    const { trading, tx, chain } = apis();
    const account = burner();
    const signer = viemTxSigner(account);
    const symbols = flag("stock") ? [getStock(flag("stock") ?? "").symbol] : STOCKS.map((s) => s.symbol);
    let ok = true;
    for (const symbol of symbols) {
      if ((await chain.balanceOf(getStock(symbol).address, account.address)) === 0n) {
        console.log(`${symbol}: not held, skipped`);
        continue;
      }
      try {
        const result = await approveForSale({ trading, tx, chain, signer, receiptTimeoutMs: 90_000 }, symbol);
        console.log(result.txHash ? `${symbol}: approved ${result.spender} (https://bscscan.com/tx/${result.txHash})` : `${symbol}: already approved for ${result.spender}`);
      } catch (error) {
        ok = false;
        console.log(`${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return ok;
  },
  "verify-funding": async () => {
    const { trading, chain } = apis();
    const targets: FundingTarget[] = [{ label: "Burner", address: burner().address, requireStock: true, requireApproval: true }];
    let ok = true;
    try {
      targets.push({ label: "Agentic Wallet", address: await createBawClient(nodeExec, process.env.BAW_BIN || "baw").address(), requireStock: true, requireApproval: false });
    } catch (error) {
      ok = false;
      console.log(`Agentic Wallet: not reachable (${error instanceof Error ? error.message : String(error)}); sign in with baw auth signin → FAIL`);
    }
    const merchant = merchantAddress();
    if (merchant) targets.push({ label: "Merchant", address: merchant, requireStock: false, requireApproval: false });
    else {
      ok = false;
      console.log("Merchant: no wallet address in sharepaymerchant/app/agent/studio.toml (run npx bag wallet new) → FAIL");
    }
    const result = await verifyFunding({ trading, chain }, targets, { stocks: ["NVDAB", "TSLAB"], minBnbWei: MIN_BNB_WEI });
    for (const line of result.lines) console.log(line);
    ok = ok && result.ok;
    console.log(ok ? "PASS" : "FAIL");
    return ok;
  },
};

const name = args.command ?? "";
const command = commands[name];
if (!command) {
  console.error(`usage: npm run ops -- <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}
try {
  process.exit((await command()) ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
