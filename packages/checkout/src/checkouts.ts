import type { CheckoutRequest } from "@sharepay/buyer/checkout";
import { initialSteps, type CheckoutState } from "@sharepay/core/dto";

export type RunCheckout = (request: CheckoutRequest, onSaleBroadcast: () => void, emit: (state: CheckoutState) => void) => Promise<CheckoutState>;

export interface CheckoutHooks {
  onSaleBroadcast?: () => void;
  onFinish?: (state: CheckoutState) => void;
}

export interface CheckoutRegistry {
  start(request: CheckoutRequest, hooks?: CheckoutHooks): void;
  get(id: string): CheckoutState | null;
  subscribe(id: string, listener: (state: CheckoutState) => void): () => void;
  running(): number;
}

export function isTerminal(state: CheckoutState): boolean {
  return state.status === "succeeded" || state.status === "failed";
}

interface Entry {
  state: CheckoutState | null;
  listeners: Set<(state: CheckoutState) => void>;
}

export function createCheckoutRegistry(deps: { run: RunCheckout; nowMs: () => number; maxKept?: number }): CheckoutRegistry {
  const maxKept = deps.maxKept ?? 200;
  const entries = new Map<string, Entry>();

  function evict(): void {
    for (const [id, entry] of entries) {
      if (entries.size <= maxKept) return;
      if (entry.state && isTerminal(entry.state)) entries.delete(id);
    }
  }

  function crashed(request: CheckoutRequest, last: CheckoutState | null, error: unknown): CheckoutState {
    const now = new Date(deps.nowMs()).toISOString();
    const base: CheckoutState = last ?? {
      id: request.id,
      itemId: request.adapter.id,
      mode: request.mode,
      tokenAddress: request.tokenAddress,
      status: "failed",
      steps: initialSteps(now),
      receipt: null,
      deliverable: null,
      error: null,
      etaSec: null,
      jobStartedAt: null,
      lastPolledAt: null,
      startedAt: now,
      finishedAt: null,
    };
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, status: "failed", etaSec: null, error: { code: "unexpected_error", message }, finishedAt: now };
  }

  return {
    start(request, hooks = {}) {
      if (entries.has(request.id)) throw new Error(`checkout ${request.id} already exists`);
      const entry: Entry = { state: null, listeners: new Set() };
      entries.set(request.id, entry);
      let finished = false;
      const publish = (state: CheckoutState) => {
        entry.state = state;
        for (const listener of [...entry.listeners]) listener(state);
      };
      const finish = (state: CheckoutState) => {
        if (finished) return;
        finished = true;
        publish(state);
        hooks.onFinish?.(state);
        evict();
      };
      deps
        .run(request, () => hooks.onSaleBroadcast?.(), (state) => {
          if (!finished) publish(state);
        })
        .then(finish, (error: unknown) => finish(crashed(request, entry.state, error)));
    },
    get: (id) => entries.get(id)?.state ?? null,
    subscribe(id, listener) {
      const entry = entries.get(id);
      if (!entry) return () => undefined;
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    running() {
      let count = 0;
      for (const entry of entries.values()) if (!entry.state || !isTerminal(entry.state)) count += 1;
      return count;
    },
  };
}
