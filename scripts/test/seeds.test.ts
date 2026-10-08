import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import type { ItemId, MerchantActivity, Receipt } from "@sharepay/core/dto";
import { describe, expect, it } from "vitest";
import { ACTIVITY_SEED, RECEIPTS_SEED, exportSeeds, txVerifier, verifySeeds } from "../lib/seeds.js";

const GOOD = `0x${"aa".repeat(32)}`;
const GOOD2 = `0x${"cc".repeat(32)}`;
const BAD = `0x${"bb".repeat(32)}`;

function receipt(id: string, itemId: ItemId, settlementTxHash: string, wallet: Receipt["wallet"] = "agentic-wallet"): Receipt {
  return {
    id, itemId, itemTitle: itemId, merchantName: "m", paidUsd: "0.05", paidAmount: "0.05", paidAsset: "U", stockSymbol: "NVDAB", stockName: "NVIDIA",
    sharesSold: "0.000306", tokensSold: "0.0003057", swapTxHashes: [GOOD2], settlementTxHash, reinvestTxHash: null, createdAt: "2026-10-09T10:00:00.000Z", wallet,
  };
}

function activity(id: string, kind: MerchantActivity["kind"], txHashes: string[]): MerchantActivity {
  return { id, kind, at: `2026-10-09T10:0${id.length}:00.000Z`, summary: kind, amountUsd: "0.05", txHashes, payer: null, triggeredBy: null, spyShares: null };
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "seeds-"));
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, RECEIPTS_SEED), "[]\n");
  writeFileSync(join(root, ACTIVITY_SEED), "[]\n");
  return root;
}

const deps = {
  verifyReceipt: async (r: Receipt) => r.settlementTxHash === GOOD,
  verifyTx: async (hash: string) => hash === GOOD || hash === GOOD2,
};

describe("exportSeeds", () => {
  it("keeps only on-chain-verified receipts and merchant entries, merging idempotently", async () => {
    const root = repo();
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith("/api/ledger")) {
        return new Response(JSON.stringify({ walletLabel: "w", holdings: [], receipts: [receipt("good", "sharepay-nvda-report", GOOD), receipt("forged", "cmc-nvda-dossier", BAD)] }));
      }
      return new Response(JSON.stringify({ items: [activity("s1", "settlement", [GOOD]), activity("sw2", "sweep", [GOOD2]), activity("sk3", "sweep_skipped", [])] }));
    }) as typeof fetch;
    const first = await exportSeeds({ fetchImpl, ...deps }, root, { checkoutUrl: "http://localhost:8787/", merchantUrl: "https://merchant.example" });
    expect(first).toEqual({ receipts: 1, activity: 2, skipped: ["receipt forged", "activity sk3"] });
    expect(seen).toEqual(["http://localhost:8787/api/ledger", "https://merchant.example/sharepay/activity"]);
    expect((JSON.parse(readFileSync(join(root, RECEIPTS_SEED), "utf8")) as Receipt[]).map((r) => r.id)).toEqual(["good"]);
    expect((JSON.parse(readFileSync(join(root, ACTIVITY_SEED), "utf8")) as MerchantActivity[]).map((a) => a.id)).toEqual(["s1", "sw2"]);
    const again = await exportSeeds({ fetchImpl, ...deps }, root, { checkoutUrl: "http://localhost:8787", merchantUrl: "https://merchant.example" });
    expect([again.receipts, again.activity]).toEqual([1, 2]);
  });
});

describe("verifySeeds", () => {
  it("requires a verified receipt per item, one from the demo wallet, plus a verified settlement and sweep", async () => {
    const root = repo();
    writeFileSync(join(root, RECEIPTS_SEED), JSON.stringify([receipt("a", "sharepay-nvda-report", GOOD)]));
    writeFileSync(join(root, ACTIVITY_SEED), JSON.stringify([activity("s1", "settlement", [GOOD])]));
    const partial = await verifySeeds(deps, root);
    expect(partial.ok).toBe(false);
    expect(partial.lines).toEqual([
      "sharepay-nvda-report: 1 verified receipt",
      "bnb-stock-analyst-nvda: 0 verified receipts",
      "cmc-nvda-dossier: 0 verified receipts",
      "demo wallet (api-signer, the hosted path): 0 verified receipts",
      "merchant activity: 1 verified settlement, 0 verified reinvest sweeps",
    ]);
    writeFileSync(
      join(root, RECEIPTS_SEED),
      JSON.stringify([receipt("a", "sharepay-nvda-report", GOOD), receipt("b", "bnb-stock-analyst-nvda", GOOD), receipt("c", "cmc-nvda-dossier", GOOD, "api-signer"), receipt("x", "cmc-nvda-dossier", BAD)]),
    );
    writeFileSync(join(root, ACTIVITY_SEED), JSON.stringify([activity("s1", "settlement", [GOOD]), activity("sw2", "sweep", [GOOD2])]));
    const full = await verifySeeds(deps, root);
    expect(full.ok).toBe(false);
    expect(full.lines[0]).toBe("receipt x: its transactions are not confirmed on-chain");
    writeFileSync(join(root, RECEIPTS_SEED), JSON.stringify([receipt("a", "sharepay-nvda-report", GOOD), receipt("b", "bnb-stock-analyst-nvda", GOOD), receipt("c", "cmc-nvda-dossier", GOOD)]));
    const noDemo = await verifySeeds(deps, root);
    expect(noDemo.ok).toBe(false);
    expect(noDemo.lines[3]).toBe("demo wallet (api-signer, the hosted path): 0 verified receipts");
    writeFileSync(
      join(root, RECEIPTS_SEED),
      JSON.stringify([receipt("a", "sharepay-nvda-report", GOOD), receipt("b", "bnb-stock-analyst-nvda", GOOD), receipt("c", "cmc-nvda-dossier", GOOD, "api-signer")]),
    );
    expect(await verifySeeds(deps, root)).toEqual({
      ok: true,
      lines: [
        "sharepay-nvda-report: 1 verified receipt",
        "bnb-stock-analyst-nvda: 1 verified receipt",
        "cmc-nvda-dossier: 1 verified receipt",
        "demo wallet (api-signer, the hosted path): 1 verified receipt",
        "merchant activity: 1 verified settlement, 1 verified reinvest sweep",
      ],
    });
  });
});

describe("txVerifier", () => {
  it("accepts only well-formed hashes with a successful receipt", async () => {
    const chain: Pick<ChainReader, "waitForReceipt"> = {
      waitForReceipt: async (hash) => {
        if (hash === GOOD) return { status: "success", blockNumber: 1n };
        if (hash === GOOD2) return { status: "reverted", blockNumber: 1n };
        throw new Error("not found");
      },
    };
    const verify = txVerifier(chain);
    expect([await verify(GOOD), await verify(GOOD2), await verify(BAD), await verify("0x12")]).toEqual([true, false, false, false]);
  });
});
