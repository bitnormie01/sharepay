import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ItemId, Receipt } from "@sharepay/core/dto";

export interface ReceiptStore {
  list(): Receipt[];
  add(receipt: Receipt): void;
  update(id: string, patch: Partial<Receipt>): void;
  latestFor(itemId: ItemId): Receipt | null;
}

function readList(path: string | null): Receipt[] {
  if (!path || !existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Receipt[]) : [];
  } catch {
    return [];
  }
}

export async function createReceiptStore(options: {
  seedPath: string | null;
  runtimePath: string | null;
  verify?: (receipt: Receipt) => Promise<boolean>;
}): Promise<ReceiptStore> {
  const seed: Receipt[] = [];
  for (const candidate of readList(options.seedPath)) {
    let ok = true;
    if (options.verify) {
      try {
        ok = await options.verify(candidate);
      } catch {
        ok = false;
      }
    }
    if (ok) seed.push(candidate);
  }
  const seedIds = new Set(seed.map((r) => r.id));
  const items: Receipt[] = [...seed];
  for (const runtime of readList(options.runtimePath)) {
    if (!seedIds.has(runtime.id) && !items.some((r) => r.id === runtime.id)) items.push(runtime);
  }
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function persist(): void {
    if (!options.runtimePath) return;
    try {
      mkdirSync(dirname(options.runtimePath), { recursive: true });
      writeFileSync(options.runtimePath, JSON.stringify(items.filter((r) => !seedIds.has(r.id)), null, 2), "utf8");
    } catch {
      // best-effort on hosts without a persistent disk
    }
  }

  return {
    list: () => [...items],
    add(receipt) {
      items.push(receipt);
      persist();
    },
    update(id, patch) {
      const index = items.findIndex((r) => r.id === id);
      const current = items[index];
      if (index === -1 || !current) return;
      items[index] = { ...current, ...patch };
      persist();
    },
    latestFor(itemId) {
      const matching = items.filter((r) => r.itemId === itemId);
      return matching.length > 0 ? matching[matching.length - 1] ?? null : null;
    },
  };
}
