import type { Holding, MarketSnapshot } from "@sharepay/buyer/holdings";
import { computePicker } from "@sharepay/buyer/picker";
import type { ProbeParams, RouteOutcome } from "@sharepay/buyer/routeProbe";
import type { PayerWallet } from "@sharepay/buyer/wallets/types";
import type { ItemId, PickerResponse } from "@sharepay/core/dto";
import type { Address } from "viem";
import type { Catalog } from "./catalog.js";

export class ItemUnavailableError extends Error {
  constructor(itemId: ItemId) {
    super(`${itemId} is unavailable right now`);
    this.name = "ItemUnavailableError";
  }
}

export interface ViewDeps {
  snapshot: () => Promise<MarketSnapshot>;
  holdings: (owner: Address, snapshot: MarketSnapshot) => Promise<Holding[]>;
}

export interface PickerViewDeps extends ViewDeps {
  catalog: Pick<Catalog, "entry">;
  walletFor: (itemId: ItemId) => PayerWallet;
  probe: (params: ProbeParams) => Promise<RouteOutcome>;
  nowMs: () => number;
  ttlMs?: number;
}

export interface PickerView {
  get(itemId: ItemId): Promise<PickerResponse>;
}

export function createPickerView(deps: PickerViewDeps): PickerView {
  const ttlMs = deps.ttlMs ?? 30_000;
  const cache = new Map<ItemId, { at: number; value: Promise<PickerResponse> }>();

  async function compute(itemId: ItemId): Promise<PickerResponse> {
    const entry = await deps.catalog.entry(itemId);
    if (!entry || entry.item.status !== "ok" || entry.priceAtomic === null || entry.payAsset === null) {
      throw new ItemUnavailableError(itemId);
    }
    const owner = await deps.walletFor(itemId).address();
    const holdings = await deps.holdings(owner, await deps.snapshot());
    const options = await computePicker({ probe: deps.probe }, { holdings, priceAtomic: entry.priceAtomic, payAsset: entry.payAsset, wallet: owner });
    return { itemId, priceUsd: entry.item.priceUsd ?? "0.00", options };
  }

  return {
    get(itemId) {
      const cached = cache.get(itemId);
      if (cached && deps.nowMs() - cached.at < ttlMs) return cached.value;
      const value = compute(itemId);
      cache.set(itemId, { at: deps.nowMs(), value });
      value.catch(() => {
        if (cache.get(itemId)?.value === value) cache.delete(itemId);
      });
      return value;
    },
  };
}
