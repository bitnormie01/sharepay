import { isAbsolute, join } from "node:path";
import { createBawClient, nodeExec } from "@sharepay/buyer/wallets/baw";
import { createBinanceClient } from "@sharepay/core/binance/client";
import { createRwaApi } from "@sharepay/core/binance/rwa";
import { createTradingApi } from "@sharepay/core/binance/trading";
import { DEFAULT_BSC_RPC_URL } from "@sharepay/core/chain/rpc";
import { createJsonlSink } from "@sharepay/core/devex";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import { loadDotEnv, parseArgs, repoRoot } from "./lib/env.js";
import {
  IDENTITY_REGISTRY,
  SMOKE_IDS,
  checkAwPreview,
  checkCheckoutLive,
  checkErc8004,
  checkMerchantLive,
  checkOndo,
  checkRwa,
  checkThirdParty,
  isSmokeId,
  verifySmoke,
  writeSmoke,
  type SmokeId,
  type SmokeRecord,
} from "./lib/smoke.js";

const DEAD: Address = "0x000000000000000000000000000000000000dEaD";
const root = repoRoot();
loadDotEnv(root);
const args = parseArgs(process.argv.slice(2));
const usage = `usage: npm run smoke -- <${SMOKE_IDS.join("|")}>  |  npm run smoke -- verify <check...>`;

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} must be set in .env`);
  return value;
}

function binance() {
  const devex = process.env.DEVEX_EVENTS_PATH;
  return createBinanceClient({
    credentials: { apiKey: required("BINANCE_API_KEY"), secretKey: required("BINANCE_API_SECRET") },
    telemetry: devex ? createJsonlSink(isAbsolute(devex) ? devex : join(root, devex)) : undefined,
  });
}

function quoteWallet(): Address {
  const raw = (process.env.BUYER_PRIVATE_KEY ?? "").trim();
  if (!raw) return DEAD;
  try {
    return privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex).address;
  } catch {
    return DEAD;
  }
}

function registryOwnerOf(): (agentId: bigint) => Promise<Address> {
  const client = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || DEFAULT_BSC_RPC_URL) });
  const abi = parseAbi(["function ownerOf(uint256 agentId) view returns (address)"]);
  return (agentId) => client.readContract({ address: IDENTITY_REGISTRY, abi, functionName: "ownerOf", args: [agentId] });
}

async function run(id: SmokeId, at: string): Promise<SmokeRecord> {
  switch (id) {
    case "rwa":
      return checkRwa(createRwaApi(binance()), at);
    case "third-party":
      return checkThirdParty(fetch, at);
    case "aw-preview":
      return checkAwPreview(fetch, createBawClient(nodeExec, process.env.BAW_BIN || "baw"), required("MERCHANT_URL"), at);
    case "ondo": {
      const client = binance();
      return checkOndo(createRwaApi(client), createTradingApi(client), quoteWallet(), at);
    }
    case "merchant-live":
      return checkMerchantLive(fetch, required("MERCHANT_URL"), at);
    case "erc8004":
      return checkErc8004(fetch, registryOwnerOf(), required("MERCHANT_URL"), process.env.MERCHANT_AGENT_ID ?? "", at);
    case "checkout-live":
      return checkCheckoutLive(fetch, required("CHECKOUT_URL"), at);
  }
}

try {
  if (args.command === "verify") {
    const ids = args.positionals.filter(isSmokeId);
    if (ids.length === 0 || ids.length !== args.positionals.length) throw new Error(usage);
    const result = verifySmoke(root, ids);
    for (const line of result.lines) console.log(line);
    console.log(result.ok ? "PASS" : "FAIL");
    process.exit(result.ok ? 0 : 1);
  }
  if (!args.command || !isSmokeId(args.command)) throw new Error(usage);
  const record = await run(args.command, new Date().toISOString());
  const path = writeSmoke(root, record);
  console.log(`[smoke] ${record.id}: ${record.ok ? "OK" : "FAIL"} — ${record.summary}`);
  console.log(`recorded in ${path}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
