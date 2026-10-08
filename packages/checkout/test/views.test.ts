import type { Holding, MarketSnapshot } from "@sharepay/buyer/holdings";
import type { RouteOutcome } from "@sharepay/buyer/routeProbe";
import type { PayerWallet } from "@sharepay/buyer/wallets/types";
import type { QuoteRoute } from "@sharepay/core/binance/trading";
import type { CatalogItem, Receipt } from "@sharepay/core/dto";
import { getStable, getStock } from "@sharepay/core/tokens";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/catalog.js";
import { createLedgerView, toLedgerHolding } from "../src/ledgerView.js";
import { ItemUnavailableError, createPickerView } from "../src/pickerView.js";

const U = getStable("U").address;
const NVDAB = getStock("NVDAB");
const OWNER = "0x1111111111111111111111111111111111111111";
const snapshot: MarketSnapshot = { tokens: new Map(), at: 0 };
const holding: Holding = { stock: NVDAB, balance: 12300000000000000n, priceUsd: "168.43", sharesPerToken: 10n ** 18n, status: { openState: true, marketStatus: "regular", reasonCode: "TRADING" } };

function item(status: CatalogItem["status"]): CatalogItem {
  return { id: "sharepay-nvda-report", title: "NVDA research report", merchantName: "SharePay", merchantUrl: "https://m", priceUsd: status === "ok" ? "0.05" : null, deliveryHint: "Instant", description: "d", status, statusMessage: null };
}

function wallet(): PayerWallet {
  return {
    kind: "api-signer",
    address: async () => OWNER,
    simulateSale: async () => {
      throw new Error("unused");
    },
    executeSale: async () => {
      throw new Error("unused");
    },
    signPayment: async () => {
      throw new Error("unused");
    },
  };
}

const route: QuoteRoute = { quoteId: "q", toTokenAmount: "51000000000000000", executionMode: "SWAP", priceImpactPercent: "0.1" };
const swap: RouteOutcome = { kind: "swap", legs: [{ from: NVDAB.address, to: U, amountIn: 1n, route }], expectedOut: 51000000000000000n, priceImpactPercent: "0.1" };
const live: CatalogEntry = { item: item("ok"), priceAtomic: 50000000000000000n, payAsset: U };

function receipt(id: string, createdAt: string): Receipt {
  return {
    id, itemId: "sharepay-nvda-report", itemTitle: "NVDA research report", merchantName: "SharePay", paidUsd: "0.05", paidAmount: "0.05", paidAsset: "U",
    stockSymbol: "NVDAB", stockName: "NVIDIA", sharesSold: "0.000306", tokensSold: "0.0003057", swapTxHashes: [], settlementTxHash: null, reinvestTxHash: null, createdAt, wallet: "api-signer",
  };
}

describe("createPickerView", () => {
  function setup(entry: CatalogEntry | null) {
    const clock = { now: 0 };
    let probes = 0;
    const view = createPickerView({
      catalog: { entry: async () => entry },
      walletFor: () => wallet(),
      snapshot: async () => snapshot,
      holdings: async (owner) => (owner === OWNER ? [holding] : []),
      probe: async () => {
        probes += 1;
        return swap;
      },
      nowMs: () => clock.now,
    });
    return { view, clock, probes: () => probes };
  }

  it("ranks the paying wallet's holdings against the item's live price and caches for 30 s", async () => {
    const s = setup(live);
    const response = await s.view.get("sharepay-nvda-report");
    expect(response.itemId).toBe("sharepay-nvda-report");
    expect(response.priceUsd).toBe("0.05");
    expect(response.options.map((o) => [o.symbol, o.payable, o.rank, o.sharesHeld])).toEqual([["NVDAB", true, 1, "0.0123"]]);
    await s.view.get("sharepay-nvda-report");
    expect(s.probes()).toBe(1);
    s.clock.now += 30_001;
    await s.view.get("sharepay-nvda-report");
    expect(s.probes()).toBe(2);
  });

  it("refuses items that are not live", async () => {
    await expect(setup({ item: item("waking"), priceAtomic: null, payAsset: null }).view.get("sharepay-nvda-report")).rejects.toBeInstanceOf(ItemUnavailableError);
    await expect(setup(null).view.get("cmc-nvda-dossier")).rejects.toBeInstanceOf(ItemUnavailableError);
  });

  it("does not cache failures", async () => {
    let fail = true;
    const view = createPickerView({
      catalog: { entry: async () => live },
      walletFor: () => wallet(),
      snapshot: async () => {
        if (fail) throw new Error("40304");
        return snapshot;
      },
      holdings: async () => [holding],
      probe: async () => swap,
      nowMs: () => 0,
    });
    await expect(view.get("sharepay-nvda-report")).rejects.toThrow("40304");
    fail = false;
    expect((await view.get("sharepay-nvda-report")).options).toHaveLength(1);
  });
});

describe("createLedgerView", () => {
  it("shows holdings in shares and receipts newest first", async () => {
    const view = createLedgerView({
      wallet: wallet(),
      walletLabel: "Demo wallet · shares only",
      snapshot: async () => snapshot,
      holdings: async () => [holding],
      receipts: { list: () => [receipt("old", "2026-10-08T10:00:00.000Z"), receipt("new", "2026-10-09T10:00:00.000Z")] },
    });
    const ledger = await view.get();
    expect(ledger.walletLabel).toBe("Demo wallet · shares only");
    expect(ledger.holdings).toEqual([{ symbol: "NVDAB", name: "NVIDIA", tokenAddress: NVDAB.address, shares: "0.0123", valueUsd: "2.07" }]);
    expect(ledger.receipts.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("still lists receipts when holdings cannot be read", async () => {
    const view = createLedgerView({
      wallet: wallet(),
      walletLabel: "w",
      snapshot: async () => {
        throw new Error("40304");
      },
      holdings: async () => [holding],
      receipts: { list: () => [receipt("r", "2026-10-08T10:00:00.000Z")] },
    });
    const ledger = await view.get();
    expect(ledger.holdings).toEqual([]);
    expect(ledger.receipts.map((r) => r.id)).toEqual(["r"]);
  });

  it("applies the share multiplier", () => {
    expect(toLedgerHolding({ ...holding, sharesPerToken: 2n * 10n ** 18n, priceUsd: null })).toMatchObject({ shares: "0.0246", valueUsd: "0" });
  });
});
