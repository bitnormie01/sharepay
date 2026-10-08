import type { CheckoutRequest } from "@sharepay/buyer/checkout";
import { sharepayReportAdapter } from "@sharepay/buyer/merchants/sharepayReport";
import { initialSteps, type CheckoutState, type CheckoutStatus } from "@sharepay/core/dto";
import { getStock } from "@sharepay/core/tokens";
import { describe, expect, it } from "vitest";
import { createCheckoutRegistry, isTerminal, type RunCheckout } from "../src/checkouts.js";

const NOW = "2026-10-08T10:00:00.000Z";

function state(id: string, status: CheckoutStatus): CheckoutState {
  return {
    id, itemId: "sharepay-nvda-report", mode: "simulate", tokenAddress: getStock("NVDAB").address, status, steps: initialSteps(NOW),
    receipt: null, deliverable: null, error: null, etaSec: null, jobStartedAt: null, lastPolledAt: null, startedAt: NOW, finishedAt: null,
  };
}

function request(id: string): CheckoutRequest {
  return { id, adapter: sharepayReportAdapter("https://m"), tokenAddress: getStock("NVDAB").address, mode: "simulate" };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createCheckoutRegistry", () => {
  it("tracks a checkout from start to finish and notifies subscribers", async () => {
    const hold = deferred();
    const run: RunCheckout = async (req, onSale, emit) => {
      emit(state(req.id, "running"));
      await hold.promise;
      onSale();
      emit(state(req.id, "awaiting_delivery"));
      return state(req.id, "succeeded");
    };
    const registry = createCheckoutRegistry({ run, nowMs: () => 0 });
    const seen: string[] = [];
    const finished: string[] = [];
    let sales = 0;
    registry.start(request("c1"), {
      onSaleBroadcast: () => {
        sales += 1;
      },
      onFinish: (s) => finished.push(s.status),
    });
    expect(registry.get("c1")?.status).toBe("running");
    expect(registry.running()).toBe(1);
    const unsubscribe = registry.subscribe("c1", (s) => seen.push(s.status));
    hold.resolve();
    await flush();
    expect(seen).toEqual(["awaiting_delivery", "succeeded"]);
    expect(finished).toEqual(["succeeded"]);
    expect(sales).toBe(1);
    expect(registry.running()).toBe(0);
    unsubscribe();
    const final = registry.get("c1");
    expect(final !== null && isTerminal(final)).toBe(true);
  });

  it("turns a crashed run into a failed state", async () => {
    const registry = createCheckoutRegistry({
      run: async (req, _onSale, emit) => {
        emit(state(req.id, "running"));
        throw new Error("boom");
      },
      nowMs: () => Date.parse(NOW),
    });
    const finished: CheckoutState[] = [];
    registry.start(request("c1"), { onFinish: (s) => finished.push(s) });
    await flush();
    expect(registry.get("c1")).toMatchObject({ status: "failed", error: { code: "unexpected_error", message: "boom" }, finishedAt: NOW });
    expect(finished).toHaveLength(1);
  });

  it("builds a failed state even when the run crashes before emitting", async () => {
    const registry = createCheckoutRegistry({
      run: async () => {
        throw new Error("early");
      },
      nowMs: () => Date.parse(NOW),
    });
    registry.start(request("c9"));
    await flush();
    expect(registry.get("c9")).toMatchObject({ id: "c9", itemId: "sharepay-nvda-report", status: "failed", error: { code: "unexpected_error", message: "early" } });
    expect(registry.get("c9")?.steps).toHaveLength(8);
  });

  it("returns null for unknown checkouts and refuses duplicate ids", () => {
    const registry = createCheckoutRegistry({
      run: (req, _onSale, emit) => {
        emit(state(req.id, "running"));
        return new Promise<CheckoutState>(() => undefined);
      },
      nowMs: () => 0,
    });
    expect(registry.get("nope")).toBeNull();
    expect(() => registry.subscribe("nope", () => undefined)()).not.toThrow();
    registry.start(request("c1"));
    expect(() => registry.start(request("c1"))).toThrow("already exists");
  });

  it("forgets the oldest finished checkouts beyond the limit", async () => {
    const registry = createCheckoutRegistry({ run: async (req) => state(req.id, "succeeded"), nowMs: () => 0, maxKept: 2 });
    for (const id of ["a", "b", "c"]) registry.start(request(id));
    await flush();
    expect([registry.get("a"), registry.get("b")?.id, registry.get("c")?.id]).toEqual([null, "b", "c"]);
  });
});
