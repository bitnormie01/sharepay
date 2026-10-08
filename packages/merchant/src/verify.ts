import { findStableByAddress, sameAddress, type StableToken } from "@sharepay/core/tokens";
import { decodeBase64Json, decodePaymentPayload } from "@sharepay/core/x402/codec";
import { domainForStable, encodeTransferWithAuthorization, recoverAuthorizationSigner } from "@sharepay/core/x402/eip3009";
import type { PaymentPayload, PaymentRequired, PaymentRequirement } from "@sharepay/core/x402/types";
import type { Address, Hex } from "viem";

export type VerifyFailure =
  | "invalid_payload"
  | "unsupported_version"
  | "requirement_mismatch"
  | "recipient_mismatch"
  | "amount_mismatch"
  | "not_yet_valid"
  | "expired"
  | "window_too_long"
  | "invalid_nonce"
  | "nonce_in_flight"
  | "invalid_signature"
  | "nonce_used"
  | "insufficient_funds"
  | "simulation_failed";

export interface VerifyDeps {
  chain: {
    authorizationState(token: Address, authorizer: Address, nonce: Hex): Promise<boolean>;
    balanceOf(token: Address, owner: Address): Promise<bigint>;
  };
  simulate(input: { from: string; to: string; value: bigint; data: string }): Promise<{ ok: boolean; status: string; failReason: string | null }>;
  settlerAddress: Address;
  nowSec: () => number;
  inFlight: Set<string>;
}

export type VerifyResult =
  | { ok: true; payload: PaymentPayload; accept: PaymentRequirement; stable: StableToken; payer: Address; calldata: Hex; inFlightKey: string }
  | { ok: false; reason: VerifyFailure; payer: string | null; detail: string };

function fail(reason: VerifyFailure, payer: string | null, detail: string): VerifyResult {
  return { ok: false, reason, payer, detail };
}

function matchesRequirement(accepted: PaymentRequirement, candidate: PaymentRequirement): boolean {
  return (
    accepted.scheme === candidate.scheme &&
    accepted.network === candidate.network &&
    sameAddress(accepted.asset, candidate.asset) &&
    accepted.amount === candidate.amount &&
    sameAddress(accepted.payTo, candidate.payTo) &&
    accepted.maxTimeoutSeconds === candidate.maxTimeoutSeconds
  );
}

export async function verifyPayment(deps: VerifyDeps, required: PaymentRequired, headerValue: string): Promise<VerifyResult> {
  let raw: unknown;
  try {
    raw = decodeBase64Json(headerValue);
  } catch {
    return fail("invalid_payload", null, "PAYMENT-SIGNATURE is not base64 JSON");
  }
  if (raw === null || typeof raw !== "object" || (raw as { x402Version?: unknown }).x402Version !== 2) {
    return fail("unsupported_version", null, "only x402Version 2 is supported");
  }
  let payload: PaymentPayload;
  try {
    payload = decodePaymentPayload(headerValue);
  } catch (error) {
    return fail("invalid_payload", null, error instanceof Error ? error.message : String(error));
  }
  const auth = payload.payload.authorization;
  const payer = auth.from;
  const accept = required.accepts.find((candidate) => matchesRequirement(payload.accepted, candidate));
  if (!accept) return fail("requirement_mismatch", payer, "accepted does not match any current requirement");
  const stable = findStableByAddress(accept.asset);
  if (!stable || stable.eip3009 === null) return fail("requirement_mismatch", payer, "asset is not an EIP-3009 stable");
  if (!sameAddress(auth.to, accept.payTo)) return fail("recipient_mismatch", payer, `authorization.to ${auth.to} != payTo ${accept.payTo}`);
  let value: bigint;
  let validAfter: bigint;
  let validBefore: bigint;
  try {
    value = BigInt(auth.value);
    validAfter = BigInt(auth.validAfter);
    validBefore = BigInt(auth.validBefore);
  } catch {
    return fail("invalid_payload", payer, "authorization numbers are not integers");
  }
  if (value !== BigInt(accept.amount)) return fail("amount_mismatch", payer, `value ${auth.value} != amount ${accept.amount}`);
  const now = BigInt(deps.nowSec());
  if (validAfter > now) return fail("not_yet_valid", payer, `validAfter ${auth.validAfter} is in the future`);
  if (validBefore < now + 6n) return fail("expired", payer, `validBefore ${auth.validBefore} has passed`);
  if (validBefore > now + 86_400n) return fail("window_too_long", payer, "validBefore is more than 24 h away");
  if (!/^0x[0-9a-fA-F]{64}$/.test(auth.nonce)) return fail("invalid_nonce", payer, "nonce must be 32 bytes of hex");
  const inFlightKey = `${stable.address}:${payer.toLowerCase()}:${auth.nonce.toLowerCase()}`;
  if (deps.inFlight.has(inFlightKey)) return fail("nonce_in_flight", payer, "this authorization is already being settled");
  const signature = payload.payload.signature as Hex;
  let recovered: Address;
  try {
    recovered = await recoverAuthorizationSigner(domainForStable(stable), auth, signature);
  } catch (error) {
    return fail("invalid_signature", payer, error instanceof Error ? error.message : String(error));
  }
  if (!sameAddress(recovered, payer)) return fail("invalid_signature", payer, "signature does not recover to authorization.from");
  if (await deps.chain.authorizationState(stable.address, payer as Address, auth.nonce as Hex)) {
    return fail("nonce_used", payer, "authorization nonce already used on-chain");
  }
  const balance = await deps.chain.balanceOf(stable.address, payer as Address);
  if (balance < value) return fail("insufficient_funds", payer, `balance ${balance} < ${value}`);
  const calldata = encodeTransferWithAuthorization(auth, signature);
  const simulation = await deps.simulate({ from: deps.settlerAddress, to: stable.address, value: 0n, data: calldata });
  if (!simulation.ok) return fail("simulation_failed", payer, simulation.failReason ?? simulation.status);
  return { ok: true, payload, accept, stable, payer: payer as Address, calldata, inFlightKey };
}
