import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  X402Error,
  canonicalJson,
  challengeHeaderValue,
  decodeBase64Json,
  decodePaymentPayload,
  decodeSettlementResponse,
  encodeBase64Json,
  encodePaymentPayload,
  encodeSettlementResponse,
  parseChallenge,
  selectEip3009Accept,
} from "../src/x402/codec.js";
import { HEADER_PAYMENT_REQUIRED, HEADER_PAYMENT_RESPONSE, HEADER_PAYMENT_SIGNATURE } from "../src/x402/types.js";

const U = "0xce24439f2d9c6a2289f741120fe202248b666666";
const USD1 = "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

describe("x402 codec", () => {
  it("exposes the v2 header names", () => {
    expect([HEADER_PAYMENT_REQUIRED, HEADER_PAYMENT_SIGNATURE, HEADER_PAYMENT_RESPONSE]).toEqual([
      "PAYMENT-REQUIRED",
      "PAYMENT-SIGNATURE",
      "PAYMENT-RESPONSE",
    ]);
  });

  it("round-trips base64 JSON", () => {
    const value = { a: 1, b: ["x"] };
    expect(decodeBase64Json(encodeBase64Json(value))).toEqual(value);
    expect(() => decodeBase64Json("!!!not-base64-json!!!")).toThrow();
  });

  it("parses the real stock-analyst challenge from the header and selects U via eip3009", () => {
    const raw = fixture("stock-analyst-402.json");
    const header = encodeBase64Json(raw);
    const challenge = parseChallenge(header, { error: "Payment Required" });
    expect(challenge.headerValue).toBe(header);
    expect(challengeHeaderValue(challenge)).toBe(header);
    const selected = selectEip3009Accept(challenge, { network: "eip155:56", preferredAssets: [U, USD1], maxAmount: 250000000000000000n });
    expect(selected.stable.symbol).toBe("U");
    expect(selected.accept.amount).toBe("100000000000000000");
    expect(selected.accept.extra?.signerAddress).toBe("0x34F7a661160780Ce1346e6D7B96D2bE244590899");
  });

  it("selects the eip3009 U accept on CMC even though a permit2-exact U accept comes first", () => {
    const raw = fixture("cmc-402.json");
    const challenge = parseChallenge(null, { paymentRequired: raw });
    const selected = selectEip3009Accept(challenge, { network: "eip155:56", preferredAssets: [U, USD1], maxAmount: 250000000000000000n });
    expect(selected.accept.extra?.assetTransferMethod).toBe("eip3009");
    expect(selected.accept.extra?.x402PaymentConfigId).toBe("69ef242e50455dcce02f2e77");
    expect(selected.accept.maxTimeoutSeconds).toBe(500);
    expect(challengeHeaderValue(challenge)).toBe(encodeBase64Json(raw));
  });

  it("falls back to USD1 when U is not preferred and enforces the amount cap", () => {
    const challenge = parseChallenge(encodeBase64Json(fixture("stock-analyst-402.json")), null);
    expect(selectEip3009Accept(challenge, { network: "eip155:56", preferredAssets: [USD1], maxAmount: 10n ** 18n }).stable.symbol).toBe("USD1");
    expect(() => selectEip3009Accept(challenge, { network: "eip155:56", preferredAssets: [U], maxAmount: 1n })).toThrowError(X402Error);
    try {
      selectEip3009Accept(challenge, { network: "eip155:56", preferredAssets: [U], maxAmount: 1n });
    } catch (error) {
      expect((error as X402Error).code).toBe("no_supported_accept");
    }
  });

  it("accepts a body that is itself the PaymentRequired object and rejects garbage", () => {
    const raw = fixture("stock-analyst-402.json");
    expect(parseChallenge(null, raw).required.accepts).toHaveLength(4);
    expect(() => parseChallenge(null, { hello: "world" })).toThrowError(X402Error);
    expect(() => parseChallenge("not-base64", null)).toThrowError(X402Error);
  });

  it("encodes and decodes payment payloads and settlement responses", () => {
    const accept = parseChallenge(null, fixture("stock-analyst-402.json")).required.accepts[0];
    if (!accept) throw new Error("fixture missing accept");
    const payload = {
      x402Version: 2 as const,
      resource: { url: "https://stock-agent.bnbchain.org/x402/analyze/async" },
      accepted: accept,
      payload: {
        signature: `0x${"ab".repeat(65)}`,
        authorization: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0xd10bddc20e4dc42a1a19a9653e994991e25b8153",
          value: "100000000000000000",
          validAfter: "1740672089",
          validBefore: "1740672689",
          nonce: `0x${"cd".repeat(32)}`,
        },
      },
    };
    const header = encodePaymentPayload(payload);
    const decoded = decodePaymentPayload(header);
    expect(decoded.accepted.extra?.signerAddress).toBe("0x34F7a661160780Ce1346e6D7B96D2bE244590899");
    expect(decoded.payload.authorization.nonce).toBe(`0x${"cd".repeat(32)}`);
    expect(() => decodePaymentPayload(encodeBase64Json({ x402Version: 1 }))).toThrowError(X402Error);

    const settlement = { success: true, transaction: "0xabc", network: "eip155:56", payer: "0x1111111111111111111111111111111111111111" };
    expect(decodeSettlementResponse(encodeSettlementResponse(settlement))).toEqual(settlement);
    expect(decodeSettlementResponse(null)).toBeNull();
    expect(decodeSettlementResponse("garbage")).toBeNull();
  });

  it("produces key-sorted canonical JSON for deep comparison", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
  });
});
