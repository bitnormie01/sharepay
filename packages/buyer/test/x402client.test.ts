import { getStable } from "@sharepay/core/tokens";
import { encodeBase64Json, encodePaymentPayload, encodeSettlementResponse } from "@sharepay/core/x402/codec";
import { describe, expect, it } from "vitest";
import { X402ClientError, fetchChallenge, replayWithPayment, signedHeaderWindow } from "../src/x402client.js";

const U = getStable("U").address;
const USD1 = getStable("USD1").address;
const required = {
  x402Version: 2,
  resource: { url: "https://merchant.example/x402/report?symbol=NVDA" },
  accepts: [{ scheme: "exact", network: "eip155:56", amount: "50000000000000000", asset: U, payTo: "0x9999999999999999999999999999999999999999", maxTimeoutSeconds: 300, extra: { name: "United Stables", version: "1", assetTransferMethod: "eip3009" } }],
};

type Seen = { url: string; headers: Headers; method: string | undefined };

function fakeFetch(responses: Response[], seen: Seen[]): typeof fetch {
  let i = 0;
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers), method: init?.method });
    const response = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (!response) throw new Error("no response");
    return response;
  };
  return impl as typeof fetch;
}

const request = { url: "https://merchant.example/x402/report?symbol=NVDA", init: { method: "GET", headers: { Accept: "application/json" } }, timeoutMs: 1000 };

describe("fetchChallenge", () => {
  it("reads the 402 PAYMENT-REQUIRED header and selects the eip3009 accept", async () => {
    const seen: Seen[] = [];
    const response = new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { "PAYMENT-REQUIRED": encodeBase64Json(required), "Content-Type": "application/json" } });
    const { challenge, selected } = await fetchChallenge(fakeFetch([response], seen), request, { maxAmount: 250000000000000000n, preferredAssets: [U, USD1] });
    expect(challenge.headerValue).toBe(encodeBase64Json(required));
    expect(selected.stable.symbol).toBe("U");
    expect(seen[0]?.headers.get("Accept")).toBe("application/json");
  });

  it("falls back to the JSON body when there is no header", async () => {
    const response = new Response(JSON.stringify({ paymentRequired: required }), { status: 402, headers: { "Content-Type": "application/json" } });
    const { selected } = await fetchChallenge(fakeFetch([response], []), request, { maxAmount: 10n ** 18n, preferredAssets: [U] });
    expect(selected.accept.amount).toBe("50000000000000000");
  });

  it("rejects merchants that do not answer 402", async () => {
    const error = await fetchChallenge(fakeFetch([new Response("ok", { status: 200 })], []), request, { maxAmount: 1n, preferredAssets: [U] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(X402ClientError);
    expect((error as X402ClientError).code).toBe("expected_402");
  });
});

describe("replayWithPayment", () => {
  it("replays with the payment header and decodes PAYMENT-RESPONSE", async () => {
    const seen: Seen[] = [];
    const settlement = { success: true, transaction: "0xabc", network: "eip155:56", payer: "0x1" };
    const response = new Response("{}", { status: 200, headers: { "PAYMENT-RESPONSE": encodeSettlementResponse(settlement) } });
    const result = await replayWithPayment(fakeFetch([response], seen), request, { name: "PAYMENT-SIGNATURE", value: "header-value" });
    expect(result.settlement).toEqual(settlement);
    expect(seen[0]?.headers.get("PAYMENT-SIGNATURE")).toBe("header-value");
    expect(seen[0]?.headers.get("Accept")).toBe("application/json");
  });

  it("returns a null settlement when the header is absent", async () => {
    const result = await replayWithPayment(fakeFetch([new Response("{}", { status: 202 })], []), request, { name: "PAYMENT-SIGNATURE", value: "v" });
    expect(result.settlement).toBeNull();
    expect(result.response.status).toBe(202);
  });
});

describe("signedHeaderWindow", () => {
  const header = (validAfter: string, validBefore: string) =>
    encodePaymentPayload({
      x402Version: 2,
      accepted: required.accepts[0] as (typeof required.accepts)[number],
      payload: { signature: `0x${"aa".repeat(65)}`, authorization: { from: "0x1", to: "0x2", value: "1", validAfter, validBefore, nonce: `0x${"00".repeat(32)}` } },
    });

  it("accepts a window that is live now and ends within an hour", () => {
    expect(signedHeaderWindow(header("1000", "1500"), 1200)).toEqual({ ok: true, reason: null });
  });

  it("rejects future, expired, too-long and undecodable windows", () => {
    expect(signedHeaderWindow(header("2000", "2500"), 1200).ok).toBe(false);
    expect(signedHeaderWindow(header("1000", "1203"), 1200).reason).toContain("expires");
    expect(signedHeaderWindow(header("1000", "9000"), 1200).reason).toContain("more than an hour");
    expect(signedHeaderWindow("garbage", 1200).ok).toBe(false);
  });
});
