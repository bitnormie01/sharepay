import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MerchantActivity } from "@sharepay/core/dto";
import { describe, expect, it } from "vitest";
import { createActivityStore } from "../src/activity.js";

const seed: MerchantActivity[] = [
  { id: "seed-1", kind: "settlement", at: "2026-10-08T09:00:00.000Z", summary: "Received a $0.05 payment", amountUsd: "0.05", txHashes: ["0xaa"], payer: "0x1", triggeredBy: null, spyShares: null },
];

let tick = 0;
const now = () => new Date(Date.UTC(2026, 9, 9, 0, 0, tick++));

describe("createActivityStore", () => {
  it("loads seed entries, appends new ones and persists only runtime entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "activity-"));
    const seedPath = join(dir, "seed.json");
    const path = join(dir, "runtime", "activity.json");
    writeFileSync(seedPath, JSON.stringify(seed));
    const store = createActivityStore({ path, seedPath, now });
    expect(store.list().map((a) => a.id)).toEqual(["seed-1"]);
    const added = store.add({ kind: "sweep", summary: "Reinvested $0.05", amountUsd: "0.05", txHashes: ["0xbb"], payer: null, triggeredBy: "0xaa", spyShares: "0.0000701" });
    expect(added.id).toMatch(/[0-9a-f-]{36}/);
    expect(store.list().map((a) => a.kind)).toEqual(["settlement", "sweep"]);
    expect(existsSync(path)).toBe(true);
    const persisted = JSON.parse(readFileSync(path, "utf8")) as MerchantActivity[];
    expect(persisted.map((a) => a.id)).toEqual([added.id]);

    const reopened = createActivityStore({ path, seedPath, now });
    expect(reopened.list().map((a) => a.id)).toEqual(["seed-1", added.id]);
  });

  it("returns entries after a given id, or everything for null or unknown ids", () => {
    const store = createActivityStore({ path: null, seedPath: null, now });
    const a = store.add({ kind: "settlement", summary: "a", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null });
    const b = store.add({ kind: "sweep", summary: "b", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null });
    expect(store.after(a.id).map((x) => x.id)).toEqual([b.id]);
    expect(store.after(null)).toHaveLength(2);
    expect(store.after("missing")).toHaveLength(2);
  });

  it("keeps only the newest maxItems entries and ignores a corrupt runtime file", () => {
    const dir = mkdtempSync(join(tmpdir(), "activity-"));
    const path = join(dir, "activity.json");
    writeFileSync(path, "{not json");
    const store = createActivityStore({ path, seedPath: null, now, maxItems: 2 });
    store.add({ kind: "settlement", summary: "1", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null });
    store.add({ kind: "settlement", summary: "2", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null });
    store.add({ kind: "settlement", summary: "3", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null });
    expect(store.list().map((a) => a.summary)).toEqual(["2", "3"]);
  });
});
