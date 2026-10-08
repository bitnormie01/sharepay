import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import type { ItemId, MerchantActivity, Receipt } from "@sharepay/core/dto";
import type { Hex } from "viem";

export const RECEIPTS_SEED = "data/receipts.seed.json";
export const ACTIVITY_SEED = "data/merchant-activity.seed.json";
const ITEM_IDS: readonly ItemId[] = ["sharepay-nvda-report", "bnb-stock-analyst-nvda", "cmc-nvda-dossier"];

export interface SeedDeps {
  fetchImpl: typeof fetch;
  verifyReceipt: (receipt: Receipt) => Promise<boolean>;
  verifyTx: (hash: string) => Promise<boolean>;
}

export function txVerifier(chain: Pick<ChainReader, "waitForReceipt">): (hash: string) => Promise<boolean> {
  return async (hash) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return false;
    try {
      return (await chain.waitForReceipt(hash as Hex, 10_000)).status === "success";
    } catch {
      return false;
    }
  };
}

function readList<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function mergeById<T extends { id: string }>(existing: T[], fresh: T[]): T[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of fresh) byId.set(item.id, item);
  return [...byId.values()];
}

async function allVerified(verifyTx: (hash: string) => Promise<boolean>, hashes: string[]): Promise<boolean> {
  if (hashes.length === 0) return false;
  for (const hash of hashes) {
    if (!(await verifyTx(hash).catch(() => false))) return false;
  }
  return true;
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response.json();
}

export async function exportSeeds(
  deps: SeedDeps,
  root: string,
  urls: { checkoutUrl: string; merchantUrl: string },
): Promise<{ receipts: number; activity: number; skipped: string[] }> {
  const skipped: string[] = [];
  const ledger = (await getJson(deps.fetchImpl, `${urls.checkoutUrl.replace(/\/+$/, "")}/api/ledger`)) as { receipts?: Receipt[] };
  const freshReceipts: Receipt[] = [];
  for (const receipt of ledger.receipts ?? []) {
    if (await deps.verifyReceipt(receipt).catch(() => false)) freshReceipts.push(receipt);
    else skipped.push(`receipt ${receipt.id}`);
  }
  const receiptsPath = join(root, RECEIPTS_SEED);
  const receipts = mergeById(readList<Receipt>(receiptsPath), freshReceipts).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  writeFileSync(receiptsPath, `${JSON.stringify(receipts, null, 2)}\n`, "utf8");

  const feed = (await getJson(deps.fetchImpl, `${urls.merchantUrl.replace(/\/+$/, "")}/sharepay/activity`)) as { items?: MerchantActivity[] };
  const freshActivity: MerchantActivity[] = [];
  for (const item of feed.items ?? []) {
    if (await allVerified(deps.verifyTx, item.txHashes)) freshActivity.push(item);
    else skipped.push(`activity ${item.id}`);
  }
  const activityPath = join(root, ACTIVITY_SEED);
  const activity = mergeById(readList<MerchantActivity>(activityPath), freshActivity).sort((a, b) => a.at.localeCompare(b.at));
  writeFileSync(activityPath, `${JSON.stringify(activity, null, 2)}\n`, "utf8");
  return { receipts: receipts.length, activity: activity.length, skipped };
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export async function verifySeeds(deps: Pick<SeedDeps, "verifyReceipt" | "verifyTx">, root: string): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  let ok = true;
  const verified: Receipt[] = [];
  for (const receipt of readList<Receipt>(join(root, RECEIPTS_SEED))) {
    if (await deps.verifyReceipt(receipt).catch(() => false)) verified.push(receipt);
    else {
      ok = false;
      lines.push(`receipt ${receipt.id}: its transactions are not confirmed on-chain`);
    }
  }
  for (const itemId of ITEM_IDS) {
    const count = verified.filter((r) => r.itemId === itemId).length;
    if (count === 0) ok = false;
    lines.push(`${itemId}: ${plural(count, "verified receipt")}`);
  }
  // The hosted checkout always pays from the demo wallet (api-signer); its recorded run must be real too.
  const demo = verified.filter((r) => r.wallet === "api-signer").length;
  if (demo === 0) ok = false;
  lines.push(`demo wallet (api-signer, the hosted path): ${plural(demo, "verified receipt")}`);
  let settlements = 0;
  let sweeps = 0;
  for (const entry of readList<MerchantActivity>(join(root, ACTIVITY_SEED))) {
    if (entry.kind === "sweep_skipped") continue;
    if (!(await allVerified(deps.verifyTx, entry.txHashes))) {
      ok = false;
      lines.push(`merchant ${entry.kind} ${entry.id}: its transactions are not confirmed on-chain`);
      continue;
    }
    if (entry.kind === "settlement") settlements += 1;
    else sweeps += 1;
  }
  if (settlements === 0 || sweeps === 0) ok = false;
  lines.push(`merchant activity: ${plural(settlements, "verified settlement")}, ${plural(sweeps, "verified reinvest sweep")}`);
  return { ok, lines };
}
