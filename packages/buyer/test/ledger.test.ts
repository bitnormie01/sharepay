import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MerchantActivity, Receipt } from "@sharepay/core/dto";
import { describe, expect, it } from "vitest";
import { createReceiptStore } from "../src/ledger.js";
import { fetchMerchantActivity, waitForReinvest } from "../src/merchantFeed.js";

function receipt(id: string, createdAt: string, itemId: Receipt["itemId"] = "sharepay-nvda-report"): Receipt {
  return {
    id, itemId, itemTitle: "NVDA research report", merchantName: "SharePay", paidUsd: "0.05", paidAmount: "0.05", paidAsset: "U",
    stockSymbol: "NVDAB", stockName: "NVIDIA", sharesSold: "0.000306", tokensSold: "0.0003057", swapTxHashes: ["0xa"],
    settlementTxHash: `0xsettle-${id}`, reinvestTxHash: null, createdAt, wallet: "api-signer",
  };
}

describe("createReceiptStore", () => {
  it("loads verified seed receipts plus runtime receipts and persists only runtime ones", async () => {
    const dir = mkdtempSync(join(tmpdir(), "receipts-"));
    const seedPath = join(dir, "seed.json");
    const runtimePath = join(dir, "runtime", "receipts.json");
    writeFileSync(seedPath, JSON.stringify([receipt("good", "2026-10-08T10:00:00.000Z"), receipt("forged", "2026-10-08T11:00:00.000Z")]));
    const store = await createReceiptStore({ seedPath, runtimePath, verify: async (r) => r.id !== "forged" });
    expect(store.list().map((r) => r.id)).toEqual(["good"]);
    store.add(receipt("new", "2026-10-09T10:00:00.000Z"));
    store.update("new", { reinvestTxHash: "0xreinvest" });
    expect(existsSync(runtimePath)).toBe(true);
    const persisted = JSON.parse(readFileSync(runtimePath, "utf8")) as Receipt[];
    expect(persisted.map((r) => [r.id, r.reinvestTxHash])).toEqual([["new", "0xreinvest"]]);
    expect(store.latestFor("sharepay-nvda-report")?.id).toBe("new");
    expect(store.latestFor("cmc-nvda-dossier")).toBeNull();
    const reopened = await createReceiptStore({ seedPath, runtimePath, verify: async (r) => r.id !== "forged" });
    expect(reopened.list().map((r) => r.id)).toEqual(["good", "new"]);
  });

  it("tolerates missing and corrupt files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "receipts-"));
    writeFileSync(join(dir, "bad.json"), "{");
    const store = await createReceiptStore({ seedPath: join(dir, "missing.json"), runtimePath: join(dir, "bad.json") });
    expect(store.list()).toEqual([]);
  });
});

describe("merchant feed", () => {
  const sweep: MerchantActivity = { id: "s1", kind: "sweep", at: "t", summary: "Reinvested $0.05 into 0.0000701 S&P 500 shares (SPYB)", amountUsd: "0.05", txHashes: ["0xsweep"], payer: null, triggeredBy: "0xsettle", spyShares: "0.0000701" };

  it("fetches activity after an id", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ items: [sweep] }), { status: 200 });
    }) as typeof fetch;
    expect(await fetchMerchantActivity(fetchImpl, "https://m.example/", "abc")).toEqual([sweep]);
    expect(seen[0]).toBe("https://m.example/sharepay/activity?after=abc");
  });

  it("waits for the sweep triggered by the settlement, or gives up after the timeout", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ items: calls < 3 ? [] : [sweep] }), { status: 200 });
    }) as typeof fetch;
    let clock = 0;
    const found = await waitForReinvest(fetchImpl, "https://m.example", "0xSETTLE", { timeoutMs: 120000, pollMs: 5000, sleep: async (ms) => { clock += ms; }, nowMs: () => clock });
    expect(found?.id).toBe("s1");
    const never = (async () => new Response(JSON.stringify({ items: [] }), { status: 200 })) as typeof fetch;
    clock = 0;
    expect(await waitForReinvest(never, "https://m.example", "0xsettle", { timeoutMs: 20000, pollMs: 5000, sleep: async (ms) => { clock += ms; }, nowMs: () => clock })).toBeNull();
  });
});
