import { createHash, timingSafeEqual } from "node:crypto";
import type { BudgetResponse } from "@sharepay/core/dto";
import { toUnits } from "@sharepay/core/money";

export type LiveGateError = "live_disabled" | "live_passcode_invalid" | "live_locked_out" | "live_cap_reached" | "live_busy";

export type GateResult = { ok: true } | { ok: false; error: LiveGateError };

export interface LiveGate {
  budget(): BudgetResponse;
  unlock(ip: string, passcode: string): GateResult;
  reserve(ip: string, passcode: string, checkoutId: string, priceUsd: string): GateResult;
  markBroadcast(checkoutId: string): void;
  finish(checkoutId: string): void;
}

export interface LiveGateOptions {
  passcode: string | null;
  maxCount: number;
  maxUsd: string;
  nowMs: () => number;
  ipFailureLimit?: number;
  ipWindowMs?: number;
  globalFailureLimit?: number;
  globalWindowMs?: number;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function formatMicroUsd(micros: bigint): string {
  const cents = (micros % 1_000_000n) / 10_000n;
  return `${micros / 1_000_000n}.${cents.toString().padStart(2, "0")}`;
}

export function createLiveGate(options: LiveGateOptions): LiveGate {
  const ipLimit = options.ipFailureLimit ?? 5;
  const ipWindowMs = options.ipWindowMs ?? 10 * 60 * 1000;
  const globalLimit = options.globalFailureLimit ?? 50;
  const globalWindowMs = options.globalWindowMs ?? 60 * 60 * 1000;
  const maxUsd = toUnits(options.maxUsd, 6);
  const expected = options.passcode ? digest(options.passcode) : null;
  const ipFailures = new Map<string, number[]>();
  let globalFailures: number[] = [];
  let day = "";
  let usedCount = 0;
  let usedUsd = 0n;
  let active: { id: string; usd: bigint; broadcast: boolean } | null = null;

  function rollDay(): void {
    const today = new Date(options.nowMs()).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      usedCount = 0;
      usedUsd = 0n;
    }
  }

  function remaining(): { count: number; usd: bigint } {
    rollDay();
    const held = active && !active.broadcast ? active : null;
    const count = options.maxCount - usedCount - (held ? 1 : 0);
    const usd = maxUsd - usedUsd - (held ? held.usd : 0n);
    return { count: Math.max(count, 0), usd: usd > 0n ? usd : 0n };
  }

  function lockedOut(ip: string): boolean {
    const now = options.nowMs();
    globalFailures = globalFailures.filter((t) => now - t < globalWindowMs);
    const mine = (ipFailures.get(ip) ?? []).filter((t) => now - t < ipWindowMs);
    if (mine.length > 0) ipFailures.set(ip, mine);
    else ipFailures.delete(ip);
    return mine.length >= ipLimit || globalFailures.length >= globalLimit;
  }

  function verify(ip: string, passcode: string): GateResult {
    if (!expected) return { ok: false, error: "live_disabled" };
    if (lockedOut(ip)) return { ok: false, error: "live_locked_out" };
    if (!timingSafeEqual(digest(passcode), expected)) {
      const now = options.nowMs();
      ipFailures.set(ip, [...(ipFailures.get(ip) ?? []), now]);
      globalFailures.push(now);
      return { ok: false, error: "live_passcode_invalid" };
    }
    return { ok: true };
  }

  return {
    budget() {
      const left = remaining();
      return {
        liveAvailable: expected !== null && left.count > 0 && left.usd > 0n,
        remainingCount: left.count,
        remainingUsd: formatMicroUsd(left.usd),
      };
    },
    unlock(ip, passcode) {
      const verdict = verify(ip, passcode);
      if (!verdict.ok) return verdict;
      const left = remaining();
      return left.count > 0 && left.usd > 0n ? { ok: true } : { ok: false, error: "live_cap_reached" };
    },
    reserve(ip, passcode, checkoutId, priceUsd) {
      const verdict = verify(ip, passcode);
      if (!verdict.ok) return verdict;
      if (active) return { ok: false, error: "live_busy" };
      const price = toUnits(priceUsd, 6);
      const left = remaining();
      if (left.count < 1 || left.usd < price) return { ok: false, error: "live_cap_reached" };
      active = { id: checkoutId, usd: price, broadcast: false };
      return { ok: true };
    },
    markBroadcast(checkoutId) {
      if (!active || active.id !== checkoutId || active.broadcast) return;
      rollDay();
      active.broadcast = true;
      usedCount += 1;
      usedUsd += active.usd;
    },
    finish(checkoutId) {
      if (active?.id === checkoutId) active = null;
    },
  };
}
