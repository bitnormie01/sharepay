import { X402_NETWORK } from "@sharepay/core/tokens";
import { decodePaymentPayload, decodeSettlementResponse, parseChallenge, selectEip3009Accept } from "@sharepay/core/x402/codec";
import type { ParsedChallenge, SelectedAccept, SettlementResponse } from "@sharepay/core/x402/types";

export interface PaidRequest {
  url: string;
  init: RequestInit;
  timeoutMs: number;
}

export class X402ClientError extends Error {
  readonly code: "expected_402" | "merchant_error";

  constructor(code: "expected_402" | "merchant_error", message: string) {
    super(message);
    this.name = "X402ClientError";
    this.code = code;
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text.length > 0 ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function fetchChallenge(
  fetchImpl: typeof fetch,
  request: PaidRequest,
  options: { maxAmount: bigint; preferredAssets: string[] },
): Promise<{ challenge: ParsedChallenge; selected: SelectedAccept }> {
  const response = await fetchImpl(request.url, { ...request.init, signal: AbortSignal.timeout(request.timeoutMs) });
  if (response.status !== 402) {
    throw new X402ClientError("expected_402", `merchant answered HTTP ${response.status} instead of 402`);
  }
  const body = await readBody(response);
  const challenge = parseChallenge(response.headers.get("payment-required"), body);
  const selected = selectEip3009Accept(challenge, { network: X402_NETWORK, preferredAssets: options.preferredAssets, maxAmount: options.maxAmount });
  return { challenge, selected };
}

export async function replayWithPayment(
  fetchImpl: typeof fetch,
  request: PaidRequest,
  header: { name: string; value: string },
): Promise<{ response: Response; settlement: SettlementResponse | null }> {
  const headers = new Headers(request.init.headers);
  headers.set(header.name, header.value);
  const response = await fetchImpl(request.url, { ...request.init, headers, signal: AbortSignal.timeout(request.timeoutMs) });
  return { response, settlement: decodeSettlementResponse(response.headers.get("payment-response")) };
}

// maxFutureSec tolerates a signer whose validAfter is a few seconds ahead of our clock. When validAfter is
// not yet strictly in the past, waitSec says how long to hold the header: the merchant rejects a future
// validAfter, and EIP-3009 settlement needs block.timestamp > validAfter.
export function signedHeaderWindow(
  headerValue: string,
  nowSec: number,
  maxFutureSec = 0,
): { ok: boolean; reason: string | null; waitSec: number } {
  let validAfter: bigint;
  let validBefore: bigint;
  try {
    const payload = decodePaymentPayload(headerValue);
    validAfter = BigInt(payload.payload.authorization.validAfter);
    validBefore = BigInt(payload.payload.authorization.validBefore);
  } catch (error) {
    return { ok: false, reason: `undecodable payment header: ${error instanceof Error ? error.message : String(error)}`, waitSec: 0 };
  }
  const now = BigInt(nowSec);
  if (validAfter > now + BigInt(maxFutureSec)) return { ok: false, reason: "signature is not valid yet", waitSec: 0 };
  const waitSec = validAfter >= now ? Number(validAfter - now) + 2 : 0;
  if (validBefore < now + BigInt(waitSec) + 6n) return { ok: false, reason: "signature expires too soon", waitSec: 0 };
  if (validBefore - now > 3600n) return { ok: false, reason: "signature window is more than an hour", waitSec: 0 };
  return { ok: true, reason: null, waitSec };
}
