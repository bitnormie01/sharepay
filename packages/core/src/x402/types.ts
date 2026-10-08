import type { StableToken } from "../tokens.js";

export const HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED";
export const HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE";
export const HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE";

export interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: ResourceInfo;
  accepts: PaymentRequirement[];
}

export interface Eip3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface PaymentPayload {
  x402Version: 2;
  resource?: ResourceInfo;
  accepted: PaymentRequirement;
  payload: { signature: string; authorization: Eip3009Authorization };
}

export interface SettlementResponse {
  success: boolean;
  transaction: string;
  network: string;
  payer?: string;
  errorReason?: string;
}

export interface ParsedChallenge {
  required: PaymentRequired;
  raw: Record<string, unknown>;
  headerValue: string | null;
}

export interface SelectedAccept {
  accept: PaymentRequirement;
  stable: StableToken;
}

export type X402ErrorCode = "invalid_challenge" | "no_supported_accept" | "invalid_payload";

export class X402Error extends Error {
  readonly code: X402ErrorCode;

  constructor(code: X402ErrorCode, message: string) {
    super(message);
    this.name = "X402Error";
    this.code = code;
  }
}
