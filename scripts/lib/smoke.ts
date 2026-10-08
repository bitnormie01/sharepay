import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MAX_PAYMENT_ATOMIC, formatPriceUsd } from "@sharepay/buyer/checkout";
import { cmcDossierAdapter } from "@sharepay/buyer/merchants/cmcDossier";
import { sharepayReportAdapter } from "@sharepay/buyer/merchants/sharepayReport";
import { stockAnalystAdapter } from "@sharepay/buyer/merchants/stockAnalyst";
import type { MerchantAdapter } from "@sharepay/buyer/merchants/types";
import { estimateSale } from "@sharepay/buyer/planner";
import { probeRoute } from "@sharepay/buyer/routeProbe";
import { matchOption, type BawClient } from "@sharepay/buyer/wallets/baw";
import { fetchChallenge } from "@sharepay/buyer/x402client";
import { BinanceApiError } from "@sharepay/core/binance/client";
import type { RwaApi } from "@sharepay/core/binance/rwa";
import type { TradingApi } from "@sharepay/core/binance/trading";
import { ONE, toUnits } from "@sharepay/core/money";
import { getStable, getStock } from "@sharepay/core/tokens";
import { challengeHeaderValue } from "@sharepay/core/x402/codec";
import type { Address } from "viem";

export type SmokeId = "rwa" | "third-party" | "aw-preview" | "ondo" | "merchant-live" | "erc8004" | "checkout-live";

export const SMOKE_IDS: readonly SmokeId[] = ["rwa", "third-party", "aw-preview", "ondo", "merchant-live", "erc8004", "checkout-live"];

/** The ERC-8004 IdentityRegistry on BSC mainnet: an ERC-721 with one token per registered agent. */
export const IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

export interface SmokeRecord {
  id: SmokeId;
  at: string;
  ok: boolean;
  summary: string;
  detail: Record<string, unknown>;
}

export function isSmokeId(value: string): value is SmokeId {
  return (SMOKE_IDS as readonly string[]).includes(value);
}

export function smokePath(root: string, id: SmokeId): string {
  return join(root, "docs", "gates", "smoke", `${id}.json`);
}

export function writeSmoke(root: string, record: SmokeRecord): string {
  const path = smokePath(root, record.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}

export function readSmoke(root: string, id: SmokeId): SmokeRecord | null {
  const path = smokePath(root, id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SmokeRecord;
  } catch {
    return null;
  }
}

export function verifySmoke(root: string, ids: SmokeId[]): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = ids.length > 0;
  for (const id of ids) {
    const record = readSmoke(root, id);
    if (!record) {
      ok = false;
      lines.push(`${id}: not recorded (run npm run smoke -- ${id})`);
      continue;
    }
    if (!record.ok) ok = false;
    lines.push(`${id}: ${record.ok ? "OK" : "FAIL"} at ${record.at}: ${record.summary}`);
  }
  return { ok, lines };
}

function errorText(error: unknown): string {
  if (error instanceof BinanceApiError) return `${error.code ?? `http ${error.httpStatus}`} ${error.apiMsg}`;
  return error instanceof Error ? error.message : String(error);
}

function base(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function liveChallenge(fetchImpl: typeof fetch, adapter: MerchantAdapter, timeoutMs: number) {
  return fetchChallenge(fetchImpl, { ...adapter.request(), timeoutMs }, { maxAmount: MAX_PAYMENT_ATOMIC, preferredAssets: [getStable("U").address, getStable("USD1").address] });
}

export async function checkRwa(rwa: RwaApi, at: string): Promise<SmokeRecord> {
  try {
    const tokens = await rwa.tokens();
    const onBsc = tokens.filter((t) => t.binanceChainId === "56").length;
    return { id: "rwa", at, ok: true, summary: `code 0: ${tokens.length} RWA tokens (${onBsc} on BSC)`, detail: { tokens: tokens.length, onBsc } };
  } catch (error) {
    const code = error instanceof BinanceApiError ? error.code : null;
    const hint = code === 40304 ? " (this network is in a restricted region for the Binance Web3 API)" : "";
    return { id: "rwa", at, ok: false, summary: `${errorText(error)}${hint}`, detail: { code, message: errorText(error) } };
  }
}

export async function checkThirdParty(fetchImpl: typeof fetch, at: string, adapters: MerchantAdapter[] = [stockAnalystAdapter(), cmcDossierAdapter()]): Promise<SmokeRecord> {
  const detail: Record<string, unknown> = {};
  const parts: string[] = [];
  let ok = true;
  for (const adapter of adapters) {
    try {
      const { selected } = await liveChallenge(fetchImpl, adapter, 45_000);
      detail[adapter.id] = {
        amount: selected.accept.amount,
        asset: selected.stable.symbol,
        payTo: selected.accept.payTo,
        maxTimeoutSeconds: selected.accept.maxTimeoutSeconds ?? null,
        method: "eip3009",
      };
      parts.push(`${adapter.merchantName} $${formatPriceUsd(BigInt(selected.accept.amount))} in ${selected.stable.symbol}`);
    } catch (error) {
      ok = false;
      detail[adapter.id] = { error: errorText(error) };
      parts.push(`${adapter.merchantName} failed: ${errorText(error)}`);
    }
  }
  return { id: "third-party", at, ok, summary: parts.join("; "), detail };
}

export async function checkAwPreview(fetchImpl: typeof fetch, baw: BawClient, merchantUrl: string, at: string): Promise<SmokeRecord> {
  try {
    const { challenge, selected } = await liveChallenge(fetchImpl, sharepayReportAdapter(base(merchantUrl)), 90_000);
    const preview = await baw.x402Preview(challengeHeaderValue(challenge));
    const option = matchOption(preview.options, selected);
    const pays = option !== null && option.status !== "NOT_SIGNABLE";
    const state = option ? `${option.status}${option.reasons.length > 0 ? ` (${option.reasons.join(", ")})` : ""}` : "no matching option";
    return {
      id: "aw-preview",
      at,
      ok: true,
      summary: `${state} → AW_PAYS_OWN_MERCHANT=${pays}`,
      detail: {
        awPaysOwnMerchant: pays,
        merchantUrl: base(merchantUrl),
        payTo: selected.accept.payTo,
        options: preview.options.map((o) => ({ index: o.index, status: o.status, reasons: o.reasons })),
      },
    };
  } catch (error) {
    return { id: "aw-preview", at, ok: false, summary: `preview failed: ${errorText(error)}`, detail: { error: errorText(error) } };
  }
}

export async function checkOndo(rwa: RwaApi, trading: TradingApi, wallet: Address, at: string): Promise<SmokeRecord> {
  const stock = getStock("NVDAon");
  try {
    const tokens = await rwa.tokens({ platformId: "ondo" });
    const token = tokens.find((t) => t.tokenContractAddress.toLowerCase() === stock.address);
    if (!token?.tokenPrice) throw new Error("NVDAon has no live token price");
    const detail: Record<string, unknown> = { tokenPrice: token.tokenPrice, status: token.statusInfo ?? null };
    const parts: string[] = [];
    for (const usd of ["0.05", "10"]) {
      const { sellAmount } = estimateSale({ priceAtomic: toUnits(usd, 18), tokenPriceUsd: token.tokenPrice, sharesPerToken: ONE });
      const outcome = await probeRoute(trading, { stock: stock.address, payAsset: getStable("U").address, sellAmount, wallet });
      if (outcome.kind === "swap") {
        detail[`usd_${usd}`] = { kind: "swap", legs: outcome.legs.length, vendor: outcome.legs[0]?.route.vendorName ?? null, expectedOut: outcome.expectedOut.toString() };
        parts.push(`$${usd}: SWAP route (${outcome.legs.length} leg${outcome.legs.length === 1 ? "" : "s"})`);
      } else {
        detail[`usd_${usd}`] = { kind: outcome.kind, code: outcome.code, message: outcome.message, minUsd: outcome.minUsd };
        parts.push(`$${usd}: ${outcome.kind}${outcome.minUsd ? ` (min $${outcome.minUsd})` : ""}`);
      }
    }
    return { id: "ondo", at, ok: true, summary: `NVDAon ${parts.join("; ")}`, detail };
  } catch (error) {
    return { id: "ondo", at, ok: false, summary: `Ondo check failed: ${errorText(error)}`, detail: { error: errorText(error) } };
  }
}

export async function checkMerchantLive(fetchImpl: typeof fetch, merchantUrl: string, at: string): Promise<SmokeRecord> {
  const url = base(merchantUrl);
  try {
    const response = await fetchImpl(`${url}/sharepay/health?deep=1`, { signal: AbortSignal.timeout(120_000) });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; payTo?: string; rwaCode?: number | null; rwaMessage?: string | null };
    const ok = response.ok && body.ok === true && body.rwaCode === 0;
    const summary = ok
      ? `merchant up at ${url}; signed RWA call from its host: code 0`
      : `merchant at ${url}: HTTP ${response.status}, RWA ${body.rwaCode ?? "n/a"} ${body.rwaMessage ?? ""}`.trim();
    return { id: "merchant-live", at, ok, summary, detail: { url, status: response.status, payTo: body.payTo ?? null, rwaCode: body.rwaCode ?? null, rwaMessage: body.rwaMessage ?? null } };
  } catch (error) {
    return { id: "merchant-live", at, ok: false, summary: `merchant unreachable at ${url}: ${errorText(error)}`, detail: { url, error: errorText(error) } };
  }
}

export async function checkErc8004(fetchImpl: typeof fetch, ownerOf: (agentId: bigint) => Promise<Address>, merchantUrl: string, agentId: string, at: string): Promise<SmokeRecord> {
  const url = base(merchantUrl);
  try {
    if (!/^\d+$/.test(agentId.trim())) throw new Error("set MERCHANT_AGENT_ID in .env to the agent id that bag erc8004 register printed");
    const id = BigInt(agentId.trim());
    const response = await fetchImpl(`${url}/sharepay/health`, { signal: AbortSignal.timeout(120_000) });
    const body = (await response.json().catch(() => ({}))) as { payTo?: string };
    if (!response.ok || !body.payTo) throw new Error(`merchant at ${url} reported no payTo (HTTP ${response.status})`);
    const owner = await ownerOf(id);
    const ok = owner.toLowerCase() === body.payTo.toLowerCase();
    const summary = ok
      ? `agent ${id} on the ERC-8004 IdentityRegistry is owned by the merchant wallet ${body.payTo}`
      : `agent ${id} is owned by ${owner}, not the merchant wallet ${body.payTo}`;
    return { id: "erc8004", at, ok, summary, detail: { registry: IDENTITY_REGISTRY, agentId: id.toString(), owner, merchantWallet: body.payTo, url } };
  } catch (error) {
    const message = errorText(error).split("\n")[0] ?? "";
    return { id: "erc8004", at, ok: false, summary: `ERC-8004 check failed: ${message}`, detail: { url, agentId, error: message } };
  }
}

export async function checkCheckoutLive(fetchImpl: typeof fetch, checkoutUrl: string, at: string): Promise<SmokeRecord> {
  const url = base(checkoutUrl);
  try {
    const response = await fetchImpl(`${url}/api/health?deep=1`, { signal: AbortSignal.timeout(120_000) });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; walletMode?: string; deep?: Record<string, { ok?: boolean; detail?: string } | undefined> };
    const checks = (["binance", "rpc", "merchant"] as const).map((key) => ({ key, result: body.deep?.[key] }));
    const ok = response.ok && body.ok === true && checks.every((c) => c.result?.ok === true);
    const summary = ok
      ? `checkout up at ${url} (${body.walletMode ?? "unknown wallet"}): Binance, RPC and merchant reachable`
      : `checkout at ${url}: ${checks.map((c) => `${c.key} ${c.result?.ok ? "ok" : `failed (${c.result?.detail ?? `HTTP ${response.status}`})`}`).join(", ")}`;
    return { id: "checkout-live", at, ok, summary, detail: { url, status: response.status, walletMode: body.walletMode ?? null, deep: body.deep ?? null } };
  } catch (error) {
    return { id: "checkout-live", at, ok: false, summary: `checkout unreachable at ${url}: ${errorText(error)}`, detail: { url, error: errorText(error) } };
  }
}
