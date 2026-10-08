import { decodeFunctionData, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { getStable } from "../src/tokens.js";
import {
  EIP3009_ABI,
  buildAuthorization,
  domainForStable,
  domainFromAccept,
  encodeTransferWithAuthorization,
  randomNonce,
  recoverAuthorizationSigner,
  splitSignature,
  viemAuthorizationSigner,
} from "../src/x402/eip3009.js";

const PAY_TO = "0xd10bddc20e4dc42a1a19a9653e994991e25b8153";

describe("eip3009", () => {
  it("builds the official x402 validity window and a fresh 32-byte nonce", () => {
    const auth = buildAuthorization({
      from: "0x1111111111111111111111111111111111111111",
      to: PAY_TO,
      value: 50000000000000000n,
      nowSec: 1_800_000_000,
      maxTimeoutSeconds: 300,
      nonce: `0x${"11".repeat(32)}`,
    });
    expect(auth).toEqual({
      from: "0x1111111111111111111111111111111111111111",
      to: PAY_TO,
      value: "50000000000000000",
      validAfter: "1799999400",
      validBefore: "1800000300",
      nonce: `0x${"11".repeat(32)}`,
    });
    expect(randomNonce()).toMatch(/^0x[0-9a-f]{64}$/);
    expect(randomNonce()).not.toBe(randomNonce());
  });

  it("derives domains from the registry and from an accept's extra", () => {
    expect(domainForStable(getStable("U"))).toEqual({
      name: "United Stables",
      version: "1",
      chainId: 56,
      verifyingContract: "0xce24439f2d9c6a2289f741120fe202248b666666",
    });
    expect(() => domainForStable(getStable("USDT"))).toThrow("does not support EIP-3009");
    expect(
      domainFromAccept({
        scheme: "exact",
        network: "eip155:56",
        amount: "1",
        asset: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
        payTo: PAY_TO,
        extra: { name: "World Liberty Financial USD", version: "1" },
      }),
    ).toEqual({ name: "World Liberty Financial USD", version: "1", chainId: 56, verifyingContract: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" });
    expect(() =>
      domainFromAccept({ scheme: "exact", network: "eip155:56", amount: "1", asset: PAY_TO, payTo: PAY_TO }),
    ).toThrow("missing EIP-712 name/version");
  });

  it("signs with a throwaway key and recovers the signer", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signer = viemAuthorizationSigner(account);
    const domain = domainForStable(getStable("U"));
    const auth = buildAuthorization({ from: account.address, to: PAY_TO, value: 1n, nowSec: 1_800_000_000, maxTimeoutSeconds: 60 });
    const signature = await signer.signTransferAuthorization(domain, auth);
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(await recoverAuthorizationSigner(domain, auth, signature)).toBe(account.address);
    const tampered = { ...auth, value: "2" };
    expect(await recoverAuthorizationSigner(domain, tampered, signature)).not.toBe(account.address);
  });

  it("splits signatures into v/r/s and encodes the v,r,s transferWithAuthorization call", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const domain = domainForStable(getStable("USD1"));
    const auth = buildAuthorization({ from: account.address, to: PAY_TO, value: 5n, nowSec: 1_800_000_000, maxTimeoutSeconds: 60 });
    const signature = await viemAuthorizationSigner(account).signTransferAuthorization(domain, auth);
    const parts = splitSignature(signature);
    expect([27, 28]).toContain(parts.v);
    expect(parts.r).toMatch(/^0x[0-9a-f]{64}$/);
    const data = encodeTransferWithAuthorization(auth, signature);
    expect(data.slice(0, 10)).toBe("0xe3ee160e");
    const decoded = decodeFunctionData({ abi: EIP3009_ABI, data });
    expect(decoded.functionName).toBe("transferWithAuthorization");
    expect(decoded.args?.[2]).toBe(5n);
    expect(decoded.args?.[6]).toBe(parts.v);
    expect(decoded.args?.[7]).toBe(parts.r as Hex);
  });
});
