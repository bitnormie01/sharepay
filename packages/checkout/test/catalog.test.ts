import { cmcDossierAdapter } from "@sharepay/buyer/merchants/cmcDossier";
import { sharepayReportAdapter } from "@sharepay/buyer/merchants/sharepayReport";
import { stockAnalystAdapter } from "@sharepay/buyer/merchants/stockAnalyst";
import { getStable } from "@sharepay/core/tokens";
import { encodeBase64Json } from "@sharepay/core/x402/codec";
import { describe, expect, it } from "vitest";
import { UNAVAILABLE_MESSAGE, WAKING_MESSAGE, createCatalog } from "../src/catalog.js";

const U = getStable("U").address;
const OWN = "https://merchant.example";
const URLS = {
  own: `${OWN}/x402/report?symbol=NVDA`,
  ping: `${OWN}/ping`,
  analyst: "https://stock-agent.bnbchain.org/x402/analyze/async",
  cmc: "https://mcp.coinmarketcap.com/x402/mcp",
};

function challenge(amount: string): Response {
  const required = {
    x402Version: 2,
    resource: { url: "https://merchant.example/resource" },
    accepts: [{ scheme: "exact", network: "eip155:56", amount, asset: U, payTo: "0x9999999999999999999999999999999999999999", maxTimeoutSeconds: 300, extra: { name: "United Stables", version: "1", assetTransferMethod: "eip3009" } }],
  };
  return new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": encodeBase64Json(required) } });
}

type Route = (url: string) => Promise<Response>;

const healthy: Route = async (url) => {
  if (url === URLS.own) return challenge("50000000000000000");
  if (url === URLS.analyst) return challenge("100000000000000000");
  if (url === URLS.cmc) return challenge("10000000000000000");
  return new Response("pong", { status: 200 });
};

function harness(route: Route) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const clock = { now: Date.UTC(2026, 9, 8, 10, 0) };
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return route(url);
  }) as typeof fetch;
  const catalog = createCatalog({
    adapters: [sharepayReportAdapter(OWN), stockAnalystAdapter(), cmcDossierAdapter()],
    ownItemId: "sharepay-nvda-report",
    merchantUrl: OWN,
    fetchImpl,
    nowMs: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    firstWaitMs: 50,
  });
  return { catalog, sleeps, clock, count: (url: string) => calls.filter((c) => c === url).length };
}

describe("createCatalog", () => {
  it("probes every merchant's 402 and lists live prices", async () => {
    const h = harness(healthy);
    const items = await h.catalog.list();
    expect(items.map((i) => [i.id, i.status, i.priceUsd, i.statusMessage])).toEqual([
      ["sharepay-nvda-report", "ok", "0.05", null],
      ["bnb-stock-analyst-nvda", "ok", "0.10", null],
      ["cmc-nvda-dossier", "ok", "0.01", null],
    ]);
    expect(items[0]).toMatchObject({ title: "NVDA research report", merchantUrl: OWN, deliveryHint: "Instant" });
    expect(h.count(URLS.ping)).toBe(1);
    expect(await h.catalog.entry("sharepay-nvda-report")).toMatchObject({ priceAtomic: 50000000000000000n, payAsset: U });
    expect(h.catalog.adapter("cmc-nvda-dossier")?.title).toBe("NVDA research dossier");
  });

  it("keeps our own card waking with retries and marks a failing third party unavailable", async () => {
    const h = harness(async (url) => {
      if (url === URLS.cmc) return challenge("10000000000000000");
      throw new Error("connect ECONNREFUSED");
    });
    const items = await h.catalog.list();
    expect(items.map((i) => [i.id, i.status, i.statusMessage, i.priceUsd])).toEqual([
      ["sharepay-nvda-report", "waking", WAKING_MESSAGE, null],
      ["bnb-stock-analyst-nvda", "unavailable", UNAVAILABLE_MESSAGE, null],
      ["cmc-nvda-dossier", "ok", null, "0.01"],
    ]);
    expect(h.count(URLS.own)).toBe(3);
    expect(h.count(URLS.analyst)).toBe(1);
    expect(h.sleeps).toEqual([5000, 5000]);
  });

  it("caches live prices for 10 minutes, then refreshes them in the background", async () => {
    const h = harness(healthy);
    await h.catalog.list();
    h.clock.now += 5 * 60 * 1000;
    await h.catalog.list();
    expect(h.count(URLS.own)).toBe(1);
    h.clock.now += 6 * 60 * 1000;
    const items = await h.catalog.list();
    expect(items.every((i) => i.status === "ok")).toBe(true);
    await h.catalog.settle();
    expect(h.count(URLS.own)).toBe(2);
    expect(h.count(URLS.cmc)).toBe(2);
  });

  it("answers quickly while our merchant is still waking up", async () => {
    const h = harness(async (url) => (url === URLS.own || url === URLS.ping ? new Promise<Response>(() => undefined) : healthy(url)));
    const items = await h.catalog.list();
    expect(items[0]).toMatchObject({ status: "waking", statusMessage: WAKING_MESSAGE });
    expect(items[2]?.status).toBe("ok");
  });

  it("re-probes an unavailable third party after a minute", async () => {
    let analystUp = false;
    const h = harness(async (url) => {
      if (url === URLS.analyst && !analystUp) throw new Error("HTTP 503");
      return healthy(url);
    });
    expect((await h.catalog.list())[1]?.status).toBe("unavailable");
    analystUp = true;
    h.clock.now += 30 * 1000;
    expect((await h.catalog.list())[1]?.status).toBe("unavailable");
    h.clock.now += 31 * 1000;
    expect((await h.catalog.list())[1]?.status).toBe("ok");
    expect(h.count(URLS.analyst)).toBe(2);
    expect(await h.catalog.entry("cmc-nvda-dossier")).toMatchObject({ priceAtomic: 10000000000000000n });
  });
});
