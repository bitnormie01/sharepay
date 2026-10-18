import type { ChainReader } from "@sharepay/core/chain/rpc";
import { challengeHeaderValue } from "@sharepay/core/x402/codec";
import { formatUnits, type Address, type Hex } from "viem";
import { signedHeaderWindow } from "../x402client.js";
import { matchOption, type BawClient } from "./baw.js";
import { simulateFirstLeg, type SimDeps } from "./simulate.js";
import { SaleError, type PayerWallet } from "./types.js";

export interface AgenticWalletDeps {
  baw: BawClient;
  sim: SimDeps;
  chain: Pick<ChainReader, "allowance" | "balanceOf">;
  sleep: (ms: number) => Promise<void>;
  nowMs: () => number;
  pollMs?: number;
  swapTimeoutMs?: number;
}

// How far ahead of our clock the Agentic Wallet's validAfter may be (signer clock skew); within it we wait.
const AW_MAX_FUTURE_SEC = 30;

export function createAgenticWallet(deps: AgenticWalletDeps): PayerWallet {
  const pollMs = deps.pollMs ?? 3000;
  const swapTimeoutMs = deps.swapTimeoutMs ?? 120_000;
  let cached: Address | null = null;
  const address = async (): Promise<Address> => {
    if (!cached) cached = await deps.baw.address();
    return cached;
  };

  return {
    kind: "agentic-wallet",
    address,
    async simulateSale(plan) {
      return simulateFirstLeg({ ...deps.sim, chain: deps.chain }, await address(), plan);
    },
    async executeSale(plan, onBroadcast) {
      const owner = await address();
      const txHashes: Hex[] = [];
      let amountIn = plan.sellAmount;
      let received = 0n;
      for (const leg of plan.legs) {
        const before = await deps.chain.balanceOf(leg.to, owner);
        onBroadcast?.();
        const orderId = await deps.baw.swap({ fromToken: leg.from, toToken: leg.to, fromTokenQty: formatUnits(amountIn, 18) });
        const started = deps.nowMs();
        let txHash: string | null = null;
        for (let polls = 0; ; polls += 1) {
          const order = await deps.baw.order(orderId);
          if (order.status === "FINISHED") {
            txHash = order.txHash;
            break;
          }
          if (order.status === "FAILED") throw new SaleError("aw_swap_failed", `Agentic Wallet order ${orderId} failed`);
          if (deps.nowMs() - started > swapTimeoutMs || polls * pollMs > swapTimeoutMs) {
            throw new SaleError("aw_swap_timeout", `Agentic Wallet order ${orderId} is still processing`);
          }
          await deps.sleep(pollMs);
        }
        if (txHash) txHashes.push(txHash as Hex);
        const after = await deps.chain.balanceOf(leg.to, owner);
        received = after > before ? after - before : 0n;
        if (received === 0n) throw new SaleError("nothing_received", `order ${orderId} returned nothing`);
        amountIn = received;
      }
      if (received < plan.priceAtomic) throw new SaleError("price_moved", `received ${received} is below the price ${plan.priceAtomic}`);
      return { txHashes, received };
    },
    async signPayment(challenge, selected, nowSec) {
      const requirements = challengeHeaderValue(challenge);
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const preview = await deps.baw.x402Preview(requirements);
        const option = matchOption(preview.options, selected);
        if (option?.status === "READY_TO_SIGN") {
          const signed = await deps.baw.x402Sign(preview.paymentId, option.index);
          // Judge the window when the signature exists, not when signPayment started: the preview/sign round
          // trips take seconds and the Agentic Wallet stamps validAfter with its own "now" (live 2026-10-11:
          // "signature is not valid yet" against the stale start time).
          const signedAtSec = Math.max(nowSec, Math.floor(deps.nowMs() / 1000));
          const window = signedHeaderWindow(signed.headerValue, signedAtSec, AW_MAX_FUTURE_SEC);
          if (!window.ok) throw new SaleError("aw_window", window.reason ?? "bad signature window");
          if (window.waitSec > 0) await deps.sleep(window.waitSec * 1000);
          return { name: signed.headerName, value: signed.headerValue };
        }
        if (option?.status === "NOT_SIGNABLE") {
          throw new SaleError("aw_not_signable", `Agentic Wallet cannot sign: ${option.reasons.join(", ") || "no reason given"}`);
        }
        if (attempt < 5) await deps.sleep(3000);
      }
      throw new SaleError("aw_not_ready", "Agentic Wallet never offered a READY_TO_SIGN option for this payment");
    },
  };
}
