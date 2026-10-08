import type { WalletMode } from "@sharepay/core/dto";
import type { ParsedChallenge, SelectedAccept } from "@sharepay/core/x402/types";
import type { Address, Hex } from "viem";
import type { SalePlan } from "../planner.js";

export interface SaleSimulation {
  ok: boolean;
  mode: "swap" | "approve_only";
  failReason: string | null;
  detail: Record<string, string>;
}

export interface SaleExecution {
  txHashes: Hex[];
  received: bigint;
}

export interface PayerWallet {
  kind: WalletMode;
  address(): Promise<Address>;
  simulateSale(plan: SalePlan): Promise<SaleSimulation>;
  /** Calls onBroadcast right before each transaction is broadcast. A check that fails earlier throws without calling it. */
  executeSale(plan: SalePlan, onBroadcast?: () => void): Promise<SaleExecution>;
  signPayment(challenge: ParsedChallenge, selected: SelectedAccept, nowSec: number): Promise<{ name: string; value: string }>;
}

export class SaleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SaleError";
    this.code = code;
  }
}
