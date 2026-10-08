import { z } from "zod";
import { findStableByAddress, sameAddress } from "../tokens.js";
import {
  X402Error,
  type ParsedChallenge,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirement,
  type SelectedAccept,
  type SettlementResponse,
} from "./types.js";

export { X402Error } from "./types.js";

const ResourceSchema = z
  .object({ url: z.string(), description: z.string().optional(), mimeType: z.string().optional() })
  .passthrough();

const PaymentRequirementSchema: z.ZodType<PaymentRequirement, z.ZodTypeDef, unknown> = z
  .object({
    scheme: z.string(),
    network: z.string(),
    amount: z.string(),
    asset: z.string(),
    payTo: z.string(),
    maxTimeoutSeconds: z.number().optional(),
    extra: z.record(z.unknown()).optional(),
  })
  .passthrough();

const PaymentRequiredSchema: z.ZodType<PaymentRequired, z.ZodTypeDef, unknown> = z
  .object({
    x402Version: z.number(),
    error: z.string().optional(),
    resource: ResourceSchema.optional(),
    accepts: z.array(PaymentRequirementSchema).min(1),
  })
  .passthrough();

const AuthorizationSchema = z.object({
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  nonce: z.string(),
});

const PaymentPayloadSchema: z.ZodType<PaymentPayload, z.ZodTypeDef, unknown> = z
  .object({
    x402Version: z.literal(2),
    resource: ResourceSchema.optional(),
    accepted: PaymentRequirementSchema,
    payload: z.object({
      signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
      authorization: AuthorizationSchema,
    }),
  })
  .passthrough();

const SettlementResponseSchema: z.ZodType<SettlementResponse, z.ZodTypeDef, unknown> = z
  .object({
    success: z.boolean(),
    transaction: z.string().default(""),
    network: z.string().default(""),
    payer: z.string().optional(),
    errorReason: z.string().optional(),
  })
  .passthrough();

export function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeBase64Json(value: string): unknown {
  const text = Buffer.from(value.trim(), "base64").toString("utf8");
  return JSON.parse(text);
}

function tryDecode(value: string): unknown {
  try {
    return decodeBase64Json(value);
  } catch {
    return undefined;
  }
}

export function parseChallenge(headerValue: string | null, body: unknown): ParsedChallenge {
  const candidates: unknown[] = [];
  if (headerValue) candidates.push(tryDecode(headerValue));
  if (body !== null && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (record.paymentRequired !== undefined) candidates.push(record.paymentRequired);
    candidates.push(body);
  }
  for (const candidate of candidates) {
    const parsed = PaymentRequiredSchema.safeParse(candidate);
    if (parsed.success) {
      return {
        required: parsed.data,
        raw: candidate as Record<string, unknown>,
        headerValue: headerValue && tryDecode(headerValue) !== undefined ? headerValue : null,
      };
    }
  }
  throw new X402Error("invalid_challenge", "response carried no valid x402 v2 PaymentRequired object");
}

export function challengeHeaderValue(challenge: ParsedChallenge): string {
  return challenge.headerValue ?? encodeBase64Json(challenge.raw);
}

function transferMethod(accept: PaymentRequirement): string {
  const method = accept.extra?.assetTransferMethod;
  return typeof method === "string" ? method : "eip3009";
}

export function selectEip3009Accept(
  challenge: ParsedChallenge,
  options: { network: string; preferredAssets: string[]; maxAmount: bigint },
): SelectedAccept {
  const rejected: string[] = [];
  for (const preferred of options.preferredAssets) {
    for (const accept of challenge.required.accepts) {
      if (!sameAddress(accept.asset, preferred)) continue;
      const stable = findStableByAddress(accept.asset);
      if (accept.scheme !== "exact" || accept.network !== options.network) continue;
      if (transferMethod(accept) !== "eip3009" || !stable || stable.eip3009 === null) continue;
      let amount: bigint;
      try {
        amount = BigInt(accept.amount);
      } catch {
        rejected.push(`${accept.asset}: bad amount ${accept.amount}`);
        continue;
      }
      if (amount > options.maxAmount) {
        rejected.push(`${stable.symbol}: amount ${accept.amount} above cap ${options.maxAmount}`);
        continue;
      }
      return { accept, stable };
    }
  }
  const offered = challenge.required.accepts
    .map((a) => `${a.network}/${a.asset}/${transferMethod(a)}/${a.amount}`)
    .join("; ");
  throw new X402Error(
    "no_supported_accept",
    `no exact eip3009 U/USD1 accept on ${options.network} within cap (offered: ${offered}${rejected.length ? `; rejected: ${rejected.join("; ")}` : ""})`,
  );
}

export function encodePaymentPayload(payload: PaymentPayload): string {
  return encodeBase64Json(payload);
}

export function decodePaymentPayload(headerValue: string): PaymentPayload {
  const decoded = tryDecode(headerValue);
  const parsed = PaymentPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new X402Error("invalid_payload", `invalid PAYMENT-SIGNATURE payload: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}

export function encodeSettlementResponse(response: SettlementResponse): string {
  return encodeBase64Json(response);
}

export function decodeSettlementResponse(headerValue: string | null): SettlementResponse | null {
  if (!headerValue) return null;
  const parsed = SettlementResponseSchema.safeParse(tryDecode(headerValue));
  return parsed.success ? parsed.data : null;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
