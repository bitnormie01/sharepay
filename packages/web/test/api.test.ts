import type { CheckoutState, ItemId, Receipt } from "@sharepay/core/dto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "../src/api";
import { errorCopy } from "../src/copy";
import { BACKOFF_MS, followCheckout, type FollowHandlers } from "../src/follow";
import { fmtDateTime, fmtTime, fmtUsd, latestReceiptFor, shortAddress } from "../src/format";

function json(status: number, body: unknown): Response {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function state(status: CheckoutState["status"]): CheckoutState {
  return {
    id: "chk_1",
    itemId: "sharepay-nvda-report",
    mode: "simulate",
    tokenAddress: "0x1",
    status,
    steps: [],
    receipt: null,
    deliverable: null,
    error: null,
    etaSec: null,
    jobStartedAt: null,
    lastPolledAt: null,
    startedAt: "2026-10-08T14:00:00.000Z",
    finishedAt: null,
  };
}

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: "r1",
    itemId: "sharepay-nvda-report",
    itemTitle: "NVDA research report",
    merchantName: "SharePay Research",
    paidUsd: "0.05",
    paidAmount: "9.999",
    paidAsset: "USDT",
    stockSymbol: "NVDA",
    stockName: "NVIDIA",
    sharesSold: "0.10",
    tokensSold: "0.00123",
    swapTxHashes: ["0xaaa"],
    settlementTxHash: "0xbbb",
    reinvestTxHash: null,
    createdAt: "2026-10-08T14:03:00.000Z",
    wallet: "api-signer",
    ...overrides,
  };
}

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string) {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function timers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let seq = 0;
  return {
    pending,
    setTimeoutImpl(fn: () => void, ms: number) {
      const handle = ++seq;
      pending.set(handle, { fn, ms });
      return handle;
    },
    clearTimeoutImpl(handle: unknown) {
      pending.delete(handle as number);
    },
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  FakeEventSource.instances = [];
});

describe("createApi", () => {
  it("maps errors, posts JSON, turns 404 into null, and unwraps merchant activity", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/live/unlock") {
        expect(init).toEqual({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: "nope" }),
        });
        return json(403, { error: "live_passcode_invalid" });
      }
      if (url === "/api/checkout" && init?.method === "POST") {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(JSON.parse(String(init.body))).toEqual({
          itemId: "cmc-nvda-dossier",
          tokenAddress: "0xabc",
          mode: "simulate",
        });
        return json(202, { checkoutId: "chk_9" });
      }
      if (url === "/api/picker?itemId=a%20b") return json(400, {});
      if (url === "/api/checkout/missing") return json(404, { error: "unknown_checkout" });
      if (url === "/api/checkout/chk_1") return json(200, state("running"));
      if (url === "/api/merchant/activity") {
        return json(200, { items: [{ id: "m1", kind: "settlement", at: "2026-10-08T14:03:00.000Z", summary: "Settled", amountUsd: null, txHashes: [], payer: null, triggeredBy: null, spyShares: null }] });
      }
      if (url === "/api/budget") return json(500, "nope");
      return json(503, { error: "item_unavailable" });
    });

    const api = createApi(fetchImpl as typeof fetch);
    await expect(api.unlock("nope")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      code: "live_passcode_invalid",
      message: "live_passcode_invalid",
    });
    await expect(api.catalog()).rejects.toBeInstanceOf(ApiError);
    await expect(api.picker("a b" as ItemId)).rejects.toMatchObject({ status: 400, code: "http_400" });
    expect(fetchImpl).toHaveBeenCalledWith("/api/picker?itemId=a%20b");
    await expect(api.checkout("missing")).resolves.toBeNull();
    await expect(api.checkout("chk_1")).resolves.toMatchObject({ id: "chk_1", status: "running" });
    await expect(api.startCheckout({ itemId: "cmc-nvda-dossier", tokenAddress: "0xabc", mode: "simulate" })).resolves.toEqual({
      checkoutId: "chk_9",
    });
    await expect(api.merchantActivity()).resolves.toEqual([
      expect.objectContaining({ id: "m1", summary: "Settled" }),
    ]);
    const budgetFetch = vi.fn(async () => new Response("nope", { status: 502 }));
    await expect(createApi(budgetFetch as typeof fetch, "http://example.test").budget()).rejects.toMatchObject({
      status: 502,
      code: "http_502",
    });
    expect(budgetFetch).toHaveBeenCalledWith("http://example.test/api/budget");
  });
});

describe("errorCopy", () => {
  it("maps known codes and falls back with the code", () => {
    expect(errorCopy("live_passcode_invalid")).toBe("Wrong passcode.");
    expect(errorCopy("live_locked_out")).toBe("Too many attempts. Try again later.");
    expect(errorCopy("live_disabled")).toBe("Live mode is off on this server.");
    expect(errorCopy("live_cap_reached")).toBe("Today's live budget is used up.");
    expect(errorCopy("live_busy")).toBe("Another live payment is running. Try again in a minute.");
    expect(errorCopy("too_many_checkouts")).toBe("The checkout is busy. Try again shortly.");
    expect(errorCopy("item_unavailable")).toBe("This item is unavailable right now.");
    expect(errorCopy("picker_failed")).toBe("Couldn't check your shares. Try again.");
    expect(errorCopy("bad_request")).toBe("Something was off with that request.");
    expect(errorCopy("other")).toBe("Something went wrong (other).");
  });
});

describe("format", () => {
  it("formats money, addresses, and the latest receipt", () => {
    expect(fmtUsd("0.05")).toBe("$0.05");
    expect(fmtUsd("0.1")).toBe("$0.10");
    expect(fmtUsd(null)).toBe("…");
    expect(fmtUsd("nope")).toBe("…");
    expect(fmtTime("2026-10-08T14:03:05.000Z")).toBe("14:03:05 UTC");
    expect(fmtDateTime("2026-10-08T14:03:00.000Z")).toBe("Oct 8, 14:03 UTC");
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortAddress("0x1234")).toBe("0x1234");
    const older = receipt({ id: "old", createdAt: "2026-10-08T10:00:00.000Z" });
    const newer = receipt({ id: "new", createdAt: "2026-10-08T12:00:00.000Z" });
    const other = receipt({ id: "other", itemId: "cmc-nvda-dossier", createdAt: "2026-10-08T15:00:00.000Z" });
    expect(latestReceiptFor([older, other, newer], "sharepay-nvda-report")?.id).toBe("new");
    expect(latestReceiptFor([], "sharepay-nvda-report")).toBeNull();
  });
});

describe("followCheckout", () => {
  it("follows state events, falls back with backoff, and stops on close, 404, or a terminal state", async () => {
    expect(BACKOFF_MS).toEqual([1000, 2000, 4000, 8000, 15000]);
    const clock = timers();
    const onState = vi.fn();
    const onGone = vi.fn();
    const handlers: FollowHandlers = { onState, onGone };
    const checkout = vi.fn<(id: string) => Promise<CheckoutState | null>>();
    const api = { checkout };
    const open = () => {
      FakeEventSource.instances = [];
      return followCheckout("chk_1", handlers, {
        api,
        EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
        baseUrl: "http://example.test",
        setTimeoutImpl: clock.setTimeoutImpl,
        clearTimeoutImpl: clock.clearTimeoutImpl,
      });
    };

    checkout.mockResolvedValue(state("running"));
    const handle = open();
    const first = FakeEventSource.instances[0]!;
    expect(first.url).toBe("http://example.test/api/checkout/chk_1/events");
    first.emit("state", JSON.stringify(state("running")));
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(first.closed).toBe(false);

    first.emit("state", JSON.stringify(state("succeeded")));
    expect(first.closed).toBe(true);
    first.emit("error");
    await flush();
    expect(checkout).not.toHaveBeenCalled();

    onState.mockClear();
    clock.pending.clear();
    const second = open();
    FakeEventSource.instances.at(-1)!.emit("error");
    await flush();
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect([...clock.pending.values()][0]?.ms).toBe(1000);
    const reconnect = [...clock.pending.values()][0]!;
    reconnect.fn();
    expect(FakeEventSource.instances.at(-1)).not.toBe(FakeEventSource.instances[0]);
    FakeEventSource.instances.at(-1)!.emit("state", JSON.stringify(state("running")));
    FakeEventSource.instances.at(-1)!.emit("error");
    await flush();
    expect([...clock.pending.values()].at(-1)?.ms).toBe(1000);

    clock.pending.clear();
    onState.mockClear();
    onGone.mockClear();
    checkout.mockResolvedValue(null);
    const third = open();
    FakeEventSource.instances.at(-1)!.emit("error");
    await flush();
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(clock.pending.size).toBe(0);
    third.close();

    clock.pending.clear();
    onGone.mockClear();
    onState.mockClear();
    let resolveCheckout: (value: CheckoutState | null) => void = () => {};
    checkout.mockImplementation(
      () =>
        new Promise<CheckoutState | null>((resolve) => {
          resolveCheckout = resolve;
        }),
    );
    const fourth = open();
    FakeEventSource.instances.at(-1)!.emit("error");
    fourth.close();
    resolveCheckout(null);
    await flush();
    expect(onGone).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();

    clock.pending.clear();
    checkout.mockResolvedValue(state("running"));
    const fifth = open();
    FakeEventSource.instances.at(-1)!.emit("error");
    await flush();
    const pendingFn = [...clock.pending.values()][0]?.fn;
    expect(clock.pending.size).toBe(1);
    const before = FakeEventSource.instances.length;
    fifth.close();
    expect(clock.pending.size).toBe(0);
    pendingFn?.();
    expect(FakeEventSource.instances.length).toBe(before);

    clock.pending.clear();
    checkout.mockResolvedValue(state("failed"));
    open();
    FakeEventSource.instances.at(-1)!.emit("error");
    await flush();
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(clock.pending.size).toBe(0);

    clock.pending.clear();
    checkout.mockResolvedValue(state("running"));
    const delays: number[] = [];
    const recordingClock = {
      setTimeoutImpl(fn: () => void, ms: number) {
        delays.push(ms);
        fn();
        return delays.length;
      },
      clearTimeoutImpl() {},
    };
    followCheckout("chk_1", handlers, {
      api,
      EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
      setTimeoutImpl: recordingClock.setTimeoutImpl,
      clearTimeoutImpl: recordingClock.clearTimeoutImpl,
    });
    for (let i = 0; i < 6; i += 1) {
      FakeEventSource.instances.at(-1)!.emit("error");
      await flush();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
    second.close();
  });
});
