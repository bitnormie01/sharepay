import { MAX_PAYMENT_ATOMIC, formatPriceUsd } from "@sharepay/buyer/checkout";
import type { MerchantAdapter } from "@sharepay/buyer/merchants/types";
import { fetchChallenge } from "@sharepay/buyer/x402client";
import type { CatalogItem, ItemId } from "@sharepay/core/dto";
import { getStable } from "@sharepay/core/tokens";
import type { Address } from "viem";

export interface CatalogEntry {
  item: CatalogItem;
  priceAtomic: bigint | null;
  payAsset: Address | null;
}

export interface Catalog {
  list(): Promise<CatalogItem[]>;
  entry(itemId: ItemId): Promise<CatalogEntry | null>;
  adapter(itemId: ItemId): MerchantAdapter | null;
  settle(): Promise<void>;
}

export interface CatalogDeps {
  adapters: MerchantAdapter[];
  ownItemId: ItemId;
  merchantUrl: string;
  fetchImpl: typeof fetch;
  nowMs: () => number;
  sleep: (ms: number) => Promise<void>;
  okTtlMs?: number;
  retryTtlMs?: number;
  ownProbeTimeoutMs?: number;
  thirdPartyProbeTimeoutMs?: number;
  ownAttempts?: number;
  ownRetryDelayMs?: number;
  firstWaitMs?: number;
}

export const WAKING_MESSAGE = "Waking up the merchant agent…";
export const UNAVAILABLE_MESSAGE = "Temporarily unavailable";

interface Slot {
  adapter: MerchantAdapter;
  own: boolean;
  entry: CatalogEntry;
  probedAt: number | null;
  inflight: Promise<void> | null;
}

function catalogItem(adapter: MerchantAdapter, status: CatalogItem["status"], statusMessage: string | null, priceUsd: string | null): CatalogItem {
  return {
    id: adapter.id,
    title: adapter.title,
    merchantName: adapter.merchantName,
    merchantUrl: adapter.merchantUrl,
    priceUsd,
    deliveryHint: adapter.deliveryHint,
    description: adapter.description,
    status,
    statusMessage,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

export function createCatalog(deps: CatalogDeps): Catalog {
  const okTtlMs = deps.okTtlMs ?? 10 * 60 * 1000;
  const retryTtlMs = deps.retryTtlMs ?? 60 * 1000;
  const ownTimeoutMs = deps.ownProbeTimeoutMs ?? 90_000;
  const thirdPartyTimeoutMs = deps.thirdPartyProbeTimeoutMs ?? 45_000;
  const ownAttempts = deps.ownAttempts ?? 3;
  const ownRetryDelayMs = deps.ownRetryDelayMs ?? 5_000;
  const firstWaitMs = deps.firstWaitMs ?? 3_000;
  const preferredAssets = [getStable("U").address, getStable("USD1").address];
  const slots = new Map<ItemId, Slot>();
  for (const adapter of deps.adapters) {
    const own = adapter.id === deps.ownItemId;
    slots.set(adapter.id, {
      adapter,
      own,
      entry: { item: catalogItem(adapter, "waking", own ? WAKING_MESSAGE : "Checking the price…", null), priceAtomic: null, payAsset: null },
      probedAt: null,
      inflight: null,
    });
  }

  async function probe(slot: Slot): Promise<void> {
    const attempts = slot.own ? ownAttempts : 1;
    const timeoutMs = slot.own ? ownTimeoutMs : thirdPartyTimeoutMs;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const { selected } = await fetchChallenge(deps.fetchImpl, { ...slot.adapter.request(), timeoutMs }, { maxAmount: MAX_PAYMENT_ATOMIC, preferredAssets });
        const priceAtomic = BigInt(selected.accept.amount);
        slot.entry = { item: catalogItem(slot.adapter, "ok", null, formatPriceUsd(priceAtomic)), priceAtomic, payAsset: selected.stable.address };
        return;
      } catch {
        if (attempt < attempts) await deps.sleep(ownRetryDelayMs);
      }
    }
    slot.entry = slot.own
      ? { item: catalogItem(slot.adapter, "waking", WAKING_MESSAGE, null), priceAtomic: null, payAsset: null }
      : { item: catalogItem(slot.adapter, "unavailable", UNAVAILABLE_MESSAGE, null), priceAtomic: null, payAsset: null };
  }

  function stale(slot: Slot): boolean {
    if (slot.probedAt === null) return true;
    const age = deps.nowMs() - slot.probedAt;
    if (slot.entry.item.status === "ok") return age >= okTtlMs;
    return slot.own || age >= retryTtlMs;
  }

  function ensureProbe(slot: Slot): Promise<void> {
    if (slot.inflight) return slot.inflight;
    if (!stale(slot)) return Promise.resolve();
    if (slot.own) {
      deps.fetchImpl(`${deps.merchantUrl}/ping`, { signal: AbortSignal.timeout(ownTimeoutMs) }).catch(() => undefined);
    }
    const run = probe(slot).finally(() => {
      slot.probedAt = deps.nowMs();
      slot.inflight = null;
    });
    slot.inflight = run;
    return run;
  }

  return {
    async list() {
      const blocking: Promise<void>[] = [];
      for (const slot of slots.values()) {
        const run = ensureProbe(slot);
        if (slot.entry.item.status !== "ok") blocking.push(run);
      }
      if (blocking.length > 0) await Promise.race([Promise.all(blocking), wait(firstWaitMs)]);
      return [...slots.values()].map((slot) => slot.entry.item);
    },
    async entry(itemId) {
      const slot = slots.get(itemId);
      if (!slot) return null;
      const run = ensureProbe(slot);
      if (slot.entry.item.status !== "ok") await run;
      return slot.entry;
    },
    adapter: (itemId) => slots.get(itemId)?.adapter ?? null,
    async settle() {
      await Promise.all([...slots.values()].map((slot) => slot.inflight ?? Promise.resolve()));
    },
  };
}
