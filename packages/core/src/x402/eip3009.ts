import { randomBytes } from "node:crypto";
import {
  encodeFunctionData,
  parseSignature,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { BSC_CHAIN_ID, type StableToken } from "../tokens.js";
import type { Eip3009Authorization, PaymentRequirement } from "./types.js";

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const EIP3009_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export interface Eip3009Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export interface AuthorizationSigner {
  address: Address;
  signTransferAuthorization(domain: Eip3009Domain, authorization: Eip3009Authorization): Promise<Hex>;
}

function toMessage(authorization: Eip3009Authorization) {
  return {
    from: authorization.from as Address,
    to: authorization.to as Address,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce as Hex,
  };
}

export function viemAuthorizationSigner(account: LocalAccount): AuthorizationSigner {
  return {
    address: account.address,
    signTransferAuthorization: (domain, authorization) =>
      account.signTypedData({
        domain,
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: toMessage(authorization),
      }),
  };
}

export function randomNonce(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function buildAuthorization(params: {
  from: Address;
  to: Address;
  value: bigint;
  nowSec: number;
  maxTimeoutSeconds: number;
  nonce?: Hex;
}): Eip3009Authorization {
  return {
    from: params.from,
    to: params.to,
    value: params.value.toString(),
    validAfter: String(params.nowSec - 600),
    validBefore: String(params.nowSec + params.maxTimeoutSeconds),
    nonce: params.nonce ?? randomNonce(),
  };
}

export function domainForStable(stable: StableToken): Eip3009Domain {
  if (stable.eip3009 === null) {
    throw new Error(`${stable.symbol} does not support EIP-3009`);
  }
  return {
    name: stable.eip3009.name,
    version: stable.eip3009.version,
    chainId: BSC_CHAIN_ID,
    verifyingContract: stable.address,
  };
}

export function domainFromAccept(accept: PaymentRequirement): Eip3009Domain {
  const name = accept.extra?.name;
  const version = accept.extra?.version;
  if (typeof name !== "string" || typeof version !== "string") {
    throw new Error(`accept for ${accept.asset} is missing EIP-712 name/version in extra`);
  }
  return { name, version, chainId: BSC_CHAIN_ID, verifyingContract: accept.asset as Address };
}

export async function recoverAuthorizationSigner(
  domain: Eip3009Domain,
  authorization: Eip3009Authorization,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: toMessage(authorization),
    signature,
  });
}

export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const parsed = parseSignature(signature);
  const v = parsed.v !== undefined ? Number(parsed.v) : 27 + parsed.yParity;
  return { v: v < 27 ? v + 27 : v, r: parsed.r, s: parsed.s };
}

export function encodeTransferWithAuthorization(authorization: Eip3009Authorization, signature: Hex): Hex {
  const { v, r, s } = splitSignature(signature);
  const message = toMessage(authorization);
  return encodeFunctionData({
    abi: EIP3009_ABI,
    functionName: "transferWithAuthorization",
    args: [message.from, message.to, message.value, message.validAfter, message.validBefore, message.nonce, v, r, s],
  });
}
