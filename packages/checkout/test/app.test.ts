import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sharepayReportAdapter } from "@sharepay/buyer/merchants/sharepayReport";
import { initialSteps, type CatalogItem, type CheckoutState, type CheckoutStatus, type ItemId, type MerchantActivity, type PickerResponse } from "@sharepay/core/dto";
import { getStable, getStock } from "@sharepay/core/tokens";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, type AppDeps } from "../src/app.js";
import { createCheckoutRegistry, type RunCheckout } from "../src/checkouts.js";
import { createLiveGate } from "../src/liveGate.js";
import { ItemUnavailableError } from "../src/pickerView.js";

const PASS = "correct horse battery";
const NVDAB = getStock("NVDAB").address;
const NOW = "2026-10-08T10:00:00.000Z";

function state(id: string, status: CheckoutStatus): CheckoutState {
  return {
    id, itemId: "sharepay-nvda-report", mode: "simulate", tokenAddress: NVDAB, status, steps: initialSteps(NOW),
    receipt: null, deliverable: null, error: null, etaSec: null, jobStartedAt: null, lastPolledAt: null, startedAt: NOW, finishedAt: null,
  };
}

function catalogItem(id: ItemId, status: CatalogItem["status"]): CatalogItem {
  return { id, title: id, merchantName: "m", merchantUrl: "https://m", priceUsd: status === "ok" ? "0.05" : null, deliveryHint: "Instant", description: "d", status, statusMessage: null };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface HarnessOptions {
  run?: RunCheckout;
  items?: Partial<Record<ItemId, CatalogItem["status"]>>;
  maxRunning?: number;
  webDist?: string | null;
  picker?: AppDeps["picker"];
  merchantActivity?: AppDeps["merchantActivity"];
}

function harness(options: HarnessOptions = {}) {
  const ids = ["c1", "c2", "c3", "c4", "c5"];
  const statuses: Record<ItemId, CatalogItem["status"]> = { "sharepay-nvda-report": "ok", "bnb-stock-analyst-nvda": "ok", "cmc-nvda-dossier": "ok", ...options.items };
  const run: RunCheckout =
    options.run ??
    (async (req, onSale, emit) => {
      emit(state(req.id, "running"));
      if (req.mode === "live") onSale();
      return state(req.id, "succeeded");
    });
  const adapter = sharepayReportAdapter("https://m");
  const gate = createLiveGate({ passcode: PASS, maxCount: 10, maxUsd: "1.50", nowMs: () => Date.parse(NOW) });
  const deps: AppDeps = {
    health: () => ({ ok: true, walletMode: "api-signer", buyerAddress: "0x1111111111111111111111111111111111111111", merchantUrl: "https://m", version: "0.1.0" }),
    deepHealth: async () => ({ deep: { binance: { ok: true, detail: "30 RWA tokens" } } }),
    catalog: {
      list: async () => (Object.keys(statuses) as ItemId[]).map((id) => catalogItem(id, statuses[id])),
      entry: async (id) => ({ item: catalogItem(id, statuses[id]), priceAtomic: 50000000000000000n, payAsset: getStable("U").address }),
      adapter: () => adapter,
    },
    picker: options.picker ?? { get: async (itemId) => ({ itemId, priceUsd: "0.05", options: [] }) },
    ledger: { get: async () => ({ walletLabel: "Demo wallet · shares only", holdings: [], receipts: [] }) },
    merchantActivity: options.merchantActivity ?? (async () => []),
    gate,
    checkouts: createCheckoutRegistry({ run, nowMs: () => Date.parse(NOW) }),
    newId: () => ids.shift() ?? "cx",
    webDist: options.webDist ?? null,
    maxRunning: options.maxRunning,
    ssePingMs: 5,
  };
  return { app: createApp(deps) };
}

const checkoutBody = (mode: "simulate" | "live", extra: Record<string, string> = {}) => ({ itemId: "sharepay-nvda-report", tokenAddress: NVDAB, mode, ...extra });

describe("createApp", () => {
  it("serves health, deep health and the catalog", async () => {
    const { app } = harness();
    const health = await request(app).get("/api/health");
    expect([health.status, health.body]).toEqual([200, { ok: true, walletMode: "api-signer", buyerAddress: "0x1111111111111111111111111111111111111111", merchantUrl: "https://m", version: "0.1.0" }]);
    expect((await request(app).get("/api/health?deep=1")).body.deep.binance.ok).toBe(true);
    const catalog = await request(app).get("/api/catalog");
    expect((catalog.body as CatalogItem[]).map((i) => i.id)).toEqual(["sharepay-nvda-report", "bnb-stock-analyst-nvda", "cmc-nvda-dossier"]);
  });

  it("validates picker requests and maps picker failures", async () => {
    const { app } = harness({
      picker: {
        get: async (itemId) => {
          if (itemId === "cmc-nvda-dossier") throw new ItemUnavailableError(itemId);
          if (itemId === "bnb-stock-analyst-nvda") throw new Error("40304 forbidden");
          return { itemId, priceUsd: "0.05", options: [] } satisfies PickerResponse;
        },
      },
    });
    expect((await request(app).get("/api/picker")).status).toBe(400);
    expect((await request(app).get("/api/picker?itemId=pizza")).body).toEqual({ error: "bad_request" });
    expect((await request(app).get("/api/picker?itemId=cmc-nvda-dossier")).status).toBe(503);
    const failed = await request(app).get("/api/picker?itemId=bnb-stock-analyst-nvda");
    expect([failed.status, failed.body]).toEqual([502, { error: "picker_failed", detail: "40304 forbidden" }]);
    expect((await request(app).get("/api/picker?itemId=sharepay-nvda-report")).body).toEqual({ itemId: "sharepay-nvda-report", priceUsd: "0.05", options: [] });
  });

  it("unlocks live mode only with the passcode", async () => {
    const { app } = harness();
    expect((await request(app).post("/api/live/unlock").send({})).status).toBe(400);
    const wrong = await request(app).post("/api/live/unlock").send({ passcode: "nope" });
    expect([wrong.status, wrong.body]).toEqual([403, { error: "live_passcode_invalid" }]);
    const right = await request(app).post("/api/live/unlock").send({ passcode: PASS });
    expect([right.status, right.body]).toEqual([200, { liveAvailable: true, remainingCount: 10, remainingUsd: "1.50" }]);
    expect((await request(app).get("/api/budget")).body).toEqual({ liveAvailable: true, remainingCount: 10, remainingUsd: "1.50" });
  });

  it("starts simulate checkouts and exposes their state", async () => {
    const { app } = harness();
    const malformed = await request(app).post("/api/checkout").set("Content-Type", "application/json").send("{not json");
    expect([malformed.status, malformed.body]).toEqual([400, { error: "bad_request" }]);
    expect((await request(app).post("/api/checkout").send(checkoutBody("simulate", { tokenAddress: "0x12" }))).status).toBe(400);
    const started = await request(app).post("/api/checkout").send(checkoutBody("simulate"));
    expect([started.status, started.body]).toEqual([202, { checkoutId: "c1" }]);
    expect((await request(app).get("/api/checkout/c1")).body).toMatchObject({ id: "c1", status: "succeeded" });
    expect((await request(app).get("/api/checkout/nope")).body).toEqual({ error: "unknown_checkout" });
  });

  it("refuses checkouts for items that are not live", async () => {
    const { app } = harness({ items: { "sharepay-nvda-report": "waking" } });
    const response = await request(app).post("/api/checkout").send(checkoutBody("simulate"));
    expect([response.status, response.body]).toEqual([503, { error: "item_unavailable" }]);
  });

  it("gates live checkouts on the passcode, one at a time, and counts the broadcast sale", async () => {
    const hold = deferred();
    const { app } = harness({
      run: async (req, onSale, emit) => {
        emit(state(req.id, "running"));
        onSale();
        await hold.promise;
        return state(req.id, "succeeded");
      },
    });
    const wrong = await request(app).post("/api/checkout").send(checkoutBody("live", { passcode: "nope" }));
    expect([wrong.status, wrong.body]).toEqual([403, { error: "live_passcode_invalid" }]);
    expect((await request(app).post("/api/checkout").send(checkoutBody("live", { passcode: PASS }))).status).toBe(202);
    const busy = await request(app).post("/api/checkout").send(checkoutBody("live", { passcode: PASS }));
    expect([busy.status, busy.body]).toEqual([409, { error: "live_busy" }]);
    expect((await request(app).get("/api/budget")).body).toEqual({ liveAvailable: true, remainingCount: 9, remainingUsd: "1.45" });
    hold.resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await request(app).post("/api/checkout").send(checkoutBody("live", { passcode: PASS }))).status).toBe(202);
  });

  it("limits how many checkouts run at once", async () => {
    const hold = deferred();
    const { app } = harness({
      maxRunning: 1,
      run: async (req, _onSale, emit) => {
        emit(state(req.id, "running"));
        await hold.promise;
        return state(req.id, "succeeded");
      },
    });
    expect((await request(app).post("/api/checkout").send(checkoutBody("simulate"))).status).toBe(202);
    const second = await request(app).post("/api/checkout").send(checkoutBody("simulate"));
    expect([second.status, second.body]).toEqual([429, { error: "too_many_checkouts" }]);
    hold.resolve();
  });

  it("streams checkout state over SSE until it finishes", async () => {
    const hold = deferred();
    const { app } = harness({
      run: async (req, _onSale, emit) => {
        emit(state(req.id, "running"));
        await hold.promise;
        emit(state(req.id, "awaiting_delivery"));
        return state(req.id, "succeeded");
      },
    });
    await request(app).post("/api/checkout").send(checkoutBody("simulate"));
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      expect((await fetch(`http://127.0.0.1:${port}/api/checkout/nope/events`)).status).toBe(404);
      const response = await fetch(`http://127.0.0.1:${port}/api/checkout/c1/events`);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      setTimeout(() => hold.resolve(), 30);
      const text = await response.text();
      const events = text.split("\n\n").filter((chunk) => chunk.startsWith("event: state"));
      expect(events.map((chunk) => (JSON.parse(chunk.slice(chunk.indexOf("data: ") + 6)) as CheckoutState).status)).toEqual(["running", "awaiting_delivery", "succeeded"]);
      expect(text).toContain(": ping");
      const replay = await (await fetch(`http://127.0.0.1:${port}/api/checkout/c1/events`)).text();
      expect(replay.match(/event: state/g)).toHaveLength(1);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("serves the ledger and the merchant feed, tolerating a sleeping merchant", async () => {
    const activity: MerchantActivity = { id: "a1", kind: "sweep", at: NOW, summary: "Reinvested $0.05 into 0.0000701 S&P 500 shares (SPYB)", amountUsd: "0.05", txHashes: ["0xabc"], payer: null, triggeredBy: "0xdef", spyShares: "0.0000701" };
    const { app } = harness({ merchantActivity: async () => [activity] });
    expect((await request(app).get("/api/ledger")).body).toEqual({ walletLabel: "Demo wallet · shares only", holdings: [], receipts: [] });
    expect((await request(app).get("/api/merchant/activity")).body).toEqual({ items: [activity] });
    const sleepy = harness({
      merchantActivity: async () => {
        throw new Error("merchant asleep");
      },
    });
    expect((await request(sleepy.app).get("/api/merchant/activity")).body).toEqual({ items: [] });
    expect((await request(app).get("/api/nope")).body).toEqual({ error: "not_found" });
  });

  it("serves the built web app with a client-side routing fallback", async () => {
    const dist = mkdtempSync(join(tmpdir(), "web-dist-"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>SharePay</title>");
    const { app } = harness({ webDist: dist });
    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.text).toContain("<title>SharePay</title>");
    expect((await request(app).get("/ledger")).text).toContain("<title>SharePay</title>");
    expect((await request(app).get("/api/unknown")).status).toBe(404);
    expect((await request(harness().app).get("/")).text).toContain("web app is not built");
  });
});
