import type { CheckoutState } from "@sharepay/core/dto";
import type { Api } from "./api";
import { isTerminal } from "./format";

export interface FollowHandlers {
  onState(state: CheckoutState): void;
  onGone(): void;
}

export interface FollowDeps {
  api: Pick<Api, "checkout">;
  EventSourceImpl?: typeof EventSource;
  baseUrl?: string;
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
}

export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

export function followCheckout(
  id: string,
  handlers: FollowHandlers,
  deps: FollowDeps,
): { close(): void } {
  const baseUrl = deps.baseUrl ?? "";
  const EventSourceImpl = deps.EventSourceImpl ?? globalThis.EventSource;
  const setTimeoutImpl = deps.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutImpl =
    deps.clearTimeoutImpl ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let stopped = false;
  let attempt = 0;
  let source: EventSource | null = null;
  let timer: unknown = null;
  let generation = 0;

  const clearTimer = () => {
    if (timer == null) return;
    clearTimeoutImpl(timer);
    timer = null;
  };

  const stop = () => {
    stopped = true;
    generation += 1;
    if (source) {
      const current = source;
      source = null;
      current.close();
    }
    clearTimer();
  };

  const schedule = () => {
    if (stopped) return;
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 15000;
    attempt += 1;
    clearTimer();
    timer = setTimeoutImpl(() => {
      timer = null;
      if (stopped) return;
      connect();
    }, delay);
  };

  const fallback = async (gen: number) => {
    let state: CheckoutState | null;
    try {
      state = await deps.api.checkout(id);
    } catch {
      if (stopped || gen !== generation) return;
      schedule();
      return;
    }
    if (stopped || gen !== generation) return;
    if (state == null) {
      handlers.onGone();
      stop();
      return;
    }
    handlers.onState(state);
    if (stopped || gen !== generation) return;
    if (isTerminal(state.status)) {
      stop();
      return;
    }
    schedule();
  };

  const connect = () => {
    if (stopped) return;
    if (source) {
      const previous = source;
      source = null;
      previous.close();
    }
    const es = new EventSourceImpl(`${baseUrl}/api/checkout/${encodeURIComponent(id)}/events`);
    source = es;

    es.addEventListener("state", (event) => {
      if (stopped || source !== es) return;
      let state: CheckoutState;
      try {
        state = JSON.parse(String((event as MessageEvent).data)) as CheckoutState;
      } catch {
        return;
      }
      attempt = 0;
      handlers.onState(state);
      if (isTerminal(state.status)) stop();
    });

    es.addEventListener("error", () => {
      if (stopped || source !== es) return;
      source = null;
      es.close();
      const gen = generation;
      void fallback(gen);
    });
  };

  connect();

  return {
    close() {
      stop();
    },
  };
}
