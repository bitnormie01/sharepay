import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DEFAULT_BSC_RPC_URL } from "@sharepay/core/chain/rpc";
import type { WalletMode } from "@sharepay/core/dto";
import { toUnits } from "@sharepay/core/money";
import type { Hex } from "viem";

export const CHECKOUT_VERSION = "0.1.0";

export interface CheckoutConfig {
  walletMode: WalletMode;
  buyerPrivateKey: Hex | null;
  bawBin: string;
  awPaysOwnMerchant: boolean;
  merchantUrl: string;
  livePasscode: string | null;
  liveDailyMaxCount: number;
  liveDailyMaxUsd: string;
  receiptsSeedPath: string | null;
  receiptsRuntimePath: string | null;
  webDist: string | null;
  port: number;
  rpcUrl: string;
  binance: { apiKey: string; secretKey: string } | null;
  devexEventsPath: string | null;
  version: string;
}

function repoRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string };
        if (pkg.name === "sharepay") return dir;
      } catch {
        // unreadable package.json: keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

function pathEnv(env: Record<string, string | undefined>, key: string, fallback: string, root: string): string | null {
  const raw = env[key] ?? fallback;
  if (raw === "") return null;
  return isAbsolute(raw) ? raw : join(root, raw);
}

export function loadCheckoutConfig(env: Record<string, string | undefined>, cwd: string = process.cwd()): CheckoutConfig {
  const walletMode = (env.WALLET_MODE ?? "api-signer").trim();
  if (walletMode !== "api-signer" && walletMode !== "agentic-wallet") {
    throw new Error("WALLET_MODE must be api-signer or agentic-wallet");
  }
  const awPaysOwnMerchant = (env.AW_PAYS_OWN_MERCHANT ?? "true").trim() !== "false";
  const rawKey = (env.BUYER_PRIVATE_KEY ?? "").trim();
  let buyerPrivateKey: Hex | null = null;
  if (rawKey) {
    const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("BUYER_PRIVATE_KEY must be 32 bytes of hex");
    buyerPrivateKey = key as Hex;
  }
  if ((walletMode === "api-signer" || !awPaysOwnMerchant) && !buyerPrivateKey) {
    throw new Error("BUYER_PRIVATE_KEY is required for the api-signer wallet");
  }
  const merchantUrl = (env.MERCHANT_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/\S+$/.test(merchantUrl)) throw new Error("MERCHANT_URL must be an http(s) URL");
  const passcode = env.LIVE_PASSCODE ?? "";
  if (passcode !== "" && passcode.length < 8) throw new Error("LIVE_PASSCODE must be at least 8 characters");
  const maxCount = Number(env.LIVE_DAILY_MAX_COUNT ?? "10");
  if (!Number.isInteger(maxCount) || maxCount < 0) throw new Error("LIVE_DAILY_MAX_COUNT must be a whole number");
  const maxUsd = (env.LIVE_DAILY_MAX_USD ?? "1.50").trim();
  try {
    toUnits(maxUsd, 6);
  } catch {
    throw new Error("LIVE_DAILY_MAX_USD must be a decimal amount such as 1.50");
  }
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("PORT must be a TCP port number");
  const root = repoRoot(cwd);
  const apiKey = env.BINANCE_API_KEY ?? "";
  const secretKey = env.BINANCE_API_SECRET ?? "";
  const commit = (env.RENDER_GIT_COMMIT ?? "").trim();
  return {
    walletMode,
    buyerPrivateKey,
    bawBin: (env.BAW_BIN ?? "").trim() || "baw",
    awPaysOwnMerchant,
    merchantUrl,
    livePasscode: passcode === "" ? null : passcode,
    liveDailyMaxCount: maxCount,
    liveDailyMaxUsd: maxUsd,
    receiptsSeedPath: pathEnv(env, "RECEIPTS_SEED_PATH", "data/receipts.seed.json", root),
    receiptsRuntimePath: pathEnv(env, "RECEIPTS_RUNTIME_PATH", "data/runtime/receipts.json", root),
    webDist: pathEnv(env, "WEB_DIST", "packages/web/dist", root),
    port,
    rpcUrl: env.BSC_RPC_URL ?? DEFAULT_BSC_RPC_URL,
    binance: apiKey && secretKey ? { apiKey, secretKey } : null,
    devexEventsPath: pathEnv(env, "DEVEX_EVENTS_PATH", "", root),
    version: commit ? `${CHECKOUT_VERSION}+${commit.slice(0, 7)}` : CHECKOUT_VERSION,
  };
}
