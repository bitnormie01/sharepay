import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MerchantActivity } from "@sharepay/core/dto";

export type NewActivity = Omit<MerchantActivity, "id" | "at">;

export interface ActivityStore {
  list(): MerchantActivity[];
  add(entry: NewActivity): MerchantActivity;
  after(id: string | null): MerchantActivity[];
}

function readList(path: string | null): MerchantActivity[] {
  if (!path || !existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as MerchantActivity[]) : [];
  } catch {
    return [];
  }
}

export function createActivityStore(options: {
  path: string | null;
  seedPath: string | null;
  now: () => Date;
  maxItems?: number;
}): ActivityStore {
  const maxItems = options.maxItems ?? 200;
  const seed = readList(options.seedPath);
  const seedIds = new Set(seed.map((entry) => entry.id));
  const items: MerchantActivity[] = [...seed];
  for (const entry of readList(options.path)) {
    if (!seedIds.has(entry.id) && !items.some((existing) => existing.id === entry.id)) items.push(entry);
  }
  items.sort((a, b) => a.at.localeCompare(b.at));

  function persist(): void {
    if (!options.path) return;
    try {
      mkdirSync(dirname(options.path), { recursive: true });
      writeFileSync(options.path, JSON.stringify(items.filter((entry) => !seedIds.has(entry.id)), null, 2), "utf8");
    } catch {
      // The feed is best-effort on hosts without a persistent disk.
    }
  }

  return {
    list: () => [...items],
    add(entry) {
      const created: MerchantActivity = { ...entry, id: randomUUID(), at: options.now().toISOString() };
      items.push(created);
      while (items.length > maxItems) items.shift();
      persist();
      return created;
    },
    after(id) {
      if (id === null) return [...items];
      const index = items.findIndex((entry) => entry.id === id);
      return index === -1 ? [...items] : items.slice(index + 1);
    },
  };
}
