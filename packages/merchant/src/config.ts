import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DEFAULT_BSC_RPC_URL } from "@sharepay/core/chain/rpc";

export interface SweepConfig {
  enabled: boolean;
  minAtomic: bigint;
  floatAtomic: bigint;
  maxAtomic: bigint;
  maxPriceImpactPercent: number;
  slippagePercent: string;
  intervalMs: number;
}

export interface MerchantConfig {
  publicUrl: string;
  priceAtomic: bigint;
  maxTimeoutSeconds: number;
  acceptedAssets: Array<"U" | "USD1">;
  sweep: SweepConfig;
  activityPath: string | null;
  activitySeedPath: string | null;
  reportCacheMs: number;
  rpcUrl: string;
  binance: { apiKey: string; secretKey: string } | null;
  devexEventsPath: string | null;
}

export function findRepoRoot(start: string): string {
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

function bigintEnv(env: Record<string, string | undefined>, key: string, fallback: bigint): bigint {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be an integer string`);
  return BigInt(raw);
}

function numberEnv(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

function pathEnv(env: Record<string, string | undefined>, key: string, fallback: string, root: string): string | null {
  const raw = env[key] ?? fallback;
  if (raw === "") return null;
  return isAbsolute(raw) ? raw : join(root, raw);
}

export function loadMerchantConfig(env: Record<string, string | undefined>, cwd: string = process.cwd()): MerchantConfig {
  const publicUrl = (env.MERCHANT_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (!publicUrl) throw new Error("MERCHANT_PUBLIC_URL is required");
  const root = findRepoRoot(cwd);
  const apiKey = env.BINANCE_API_KEY ?? "";
  const secretKey = env.BINANCE_API_SECRET ?? "";
  const devex = env.DEVEX_EVENTS_PATH ?? "";
  return {
    publicUrl,
    priceAtomic: bigintEnv(env, "REPORT_PRICE_ATOMIC", 50000000000000000n),
    maxTimeoutSeconds: 300,
    acceptedAssets: ["U", "USD1"],
    sweep: {
      enabled: (env.SWEEP_ENABLED ?? "true") === "true",
      minAtomic: bigintEnv(env, "SWEEP_MIN_ATOMIC", 50000000000000000n),
      floatAtomic: bigintEnv(env, "SWEEP_FLOAT_ATOMIC", 0n),
      maxAtomic: bigintEnv(env, "SWEEP_MAX_ATOMIC", 5000000000000000000n),
      maxPriceImpactPercent: numberEnv(env, "SWEEP_MAX_PRICE_IMPACT", 2),
      slippagePercent: env.SWEEP_SLIPPAGE ?? "1",
      intervalMs: numberEnv(env, "SWEEP_INTERVAL_MS", 300000),
    },
    activityPath: pathEnv(env, "ACTIVITY_PATH", "data/runtime/merchant-activity.json", root),
    activitySeedPath: pathEnv(env, "ACTIVITY_SEED_PATH", "data/merchant-activity.seed.json", root),
    reportCacheMs: 60000,
    rpcUrl: env.BSC_RPC_URL ?? DEFAULT_BSC_RPC_URL,
    binance: apiKey && secretKey ? { apiKey, secretKey } : null,
    devexEventsPath: devex ? (isAbsolute(devex) ? devex : join(root, devex)) : null,
  };
}
