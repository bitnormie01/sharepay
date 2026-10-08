import { getStable } from "@sharepay/core/tokens";
import { encodeBase64Json, encodePaymentPayload } from "@sharepay/core/x402/codec";
import { buildAuthorization, domainForStable, viemAuthorizationSigner } from "@sharepay/core/x402/eip3009";
import type { Eip3009Authorization, PaymentRequirement } from "@sharepay/core/x402/types";
import type { LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { buildReportRequirements } from "../src/requirements.js";
import { verifyPayment, type VerifyDeps } from "../src/verify.js";

const MERCHANT = "0x9999999999999999999999999999999999999999";
const NOW = 1_800_000_000;
const required = buildReportRequirements({
  priceAtomic: 50000000000000000n,
  payTo: MERCHANT,
  resourceUrl: "https://merchant.example/x402/report?symbol=NVDA",
  maxTimeoutSeconds: 300,
  assets: ["U", "USD1"],
});

async function payment(
  options: { auth?: Partial<Eip3009Authorization>; tamper?: Partial<Eip3009Authorization>; accepted?: Partial<PaymentRequirement>; signWith?: LocalAccount } = {},
) {
  const payer = privateKeyToAccount(generatePrivateKey());
  const accept = required.accepts[0];
  if (!accept) throw new Error("no accept");
  const authorization = {
    ...buildAuthorization({ from: payer.address, to: MERCHANT, value: 50000000000000000n, nowSec: NOW, maxTimeoutSeconds: 300 }),
    ...options.auth,
  };
  const signature = await viemAuthorizationSigner(options.signWith ?? payer).signTransferAuthorization(domainForStable(getStable("U")), authorization);
  const header = encodePaymentPayload({
    x402Version: 2,
    resource: required.resource,
    accepted: { ...accept, ...options.accepted },
    payload: { signature, authorization: { ...authorization, ...options.tamper } },
  });
  return { payer, header, authorization };
}

function deps(overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
    chain: { authorizationState: async () => false, balanceOf: async () => 10n ** 18n },
    simulate: async () => ({ ok: true, status: "SUCCESS", failReason: null }),
    settlerAddress: MERCHANT,
    nowSec: () => NOW,
    inFlight: new Set<string>(),
    ...overrides,
  };
}

describe("buildReportRequirements", () => {
  it("offers U then USD1 as exact eip3009 accepts on eip155:56", () => {
    expect(required.x402Version).toBe(2);
    expect(required.resource?.url).toBe("https://merchant.example/x402/report?symbol=NVDA");
    expect(required.accepts).toEqual([
      {
        scheme: "exact",
        network: "eip155:56",
        amount: "50000000000000000",
        asset: "0xce24439f2d9c6a2289f741120fe202248b666666",
        payTo: MERCHANT,
        maxTimeoutSeconds: 300,
        extra: { name: "United Stables", version: "1", assetTransferMethod: "eip3009" },
      },
      {
        scheme: "exact",
        network: "eip155:56",
        amount: "50000000000000000",
        asset: "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d",
        payTo: MERCHANT,
        maxTimeoutSeconds: 300,
        extra: { name: "World Liberty Financial USD", version: "1", assetTransferMethod: "eip3009" },
      },
    ]);
  });
});

describe("verifyPayment", () => {
  it("accepts a valid U authorization and returns v,r,s settlement calldata", async () => {
    const { header, payer } = await payment();
    const result = await verifyPayment(deps(), required, header);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payer).toBe(payer.address);
    expect(result.stable.symbol).toBe("U");
    expect(result.calldata.slice(0, 10)).toBe("0xe3ee160e");
    expect(result.inFlightKey).toContain(payer.address.toLowerCase());
  });

  it("rejects undecodable and wrong-version payloads", async () => {
    expect(await verifyPayment(deps(), required, "%%%")).toMatchObject({ ok: false, reason: "invalid_payload" });
    expect(await verifyPayment(deps(), required, encodeBase64Json({ x402Version: 1 }))).toMatchObject({ ok: false, reason: "unsupported_version" });
    expect(await verifyPayment(deps(), required, encodeBase64Json({ x402Version: 2, accepted: {} }))).toMatchObject({ ok: false, reason: "invalid_payload" });
  });

  it("rejects mismatched requirements, recipients and amounts", async () => {
    expect(await verifyPayment(deps(), required, (await payment({ accepted: { amount: "1" } })).header)).toMatchObject({ reason: "requirement_mismatch" });
    expect(await verifyPayment(deps(), required, (await payment({ auth: { to: "0x1111111111111111111111111111111111111111" } })).header)).toMatchObject({ reason: "recipient_mismatch" });
    expect(await verifyPayment(deps(), required, (await payment({ auth: { value: "1" } })).header)).toMatchObject({ reason: "amount_mismatch" });
  });

  it("enforces the validity window", async () => {
    expect(await verifyPayment(deps(), required, (await payment({ auth: { validAfter: String(NOW + 10) } })).header)).toMatchObject({ reason: "not_yet_valid" });
    expect(await verifyPayment(deps(), required, (await payment({ auth: { validBefore: String(NOW + 5) } })).header)).toMatchObject({ reason: "expired" });
    expect(await verifyPayment(deps(), required, (await payment({ auth: { validBefore: String(NOW + 90_000) } })).header)).toMatchObject({ reason: "window_too_long" });
    expect(await verifyPayment(deps(), required, (await payment({ auth: { validAfter: "0", validBefore: String(NOW + 3000) } })).header)).toMatchObject({ ok: true });
  });

  it("rejects malformed and in-flight nonces", async () => {
    expect(await verifyPayment(deps(), required, (await payment({ tamper: { nonce: "0x1234" } })).header)).toMatchObject({ reason: "invalid_nonce" });
    const { header, authorization } = await payment();
    const inFlight = new Set<string>([`0xce24439f2d9c6a2289f741120fe202248b666666:${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`]);
    expect(await verifyPayment(deps({ inFlight }), required, header)).toMatchObject({ reason: "nonce_in_flight" });
  });

  it("rejects signatures from another key", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    expect(await verifyPayment(deps(), required, (await payment({ signWith: other })).header)).toMatchObject({ reason: "invalid_signature" });
  });

  it("checks on-chain nonce state, balance and the settlement simulation", async () => {
    const { header } = await payment();
    expect(await verifyPayment(deps({ chain: { authorizationState: async () => true, balanceOf: async () => 10n ** 18n } }), required, header)).toMatchObject({ reason: "nonce_used" });
    expect(await verifyPayment(deps({ chain: { authorizationState: async () => false, balanceOf: async () => 1n } }), required, header)).toMatchObject({ reason: "insufficient_funds" });
    const failed = await verifyPayment(deps({ simulate: async () => ({ ok: false, status: "FAILED", failReason: "FiatToken: authorization is used" }) }), required, header);
    expect(failed).toMatchObject({ ok: false, reason: "simulation_failed", detail: "FiatToken: authorization is used" });
  });
});
