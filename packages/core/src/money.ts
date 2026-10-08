import { formatUnits, parseUnits } from "viem";

export const ONE: bigint = 10n ** 18n;

export function toUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`invalid decimal: ${value}`);
  }
  return parseUnits(trimmed, decimals);
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) {
    throw new Error("division by zero");
  }
  return (a + b - 1n) / b;
}

export function mulDivUp(a: bigint, b: bigint, c: bigint): bigint {
  return ceilDiv(a * b, c);
}

export function mulDivDown(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) {
    throw new Error("division by zero");
  }
  return (a * b) / c;
}

export function addBps(amount: bigint, bps: number): bigint {
  return mulDivUp(amount, BigInt(10_000 + bps), 10_000n);
}

export function formatAmount(amount: bigint, decimals: number, maxFractionDigits: number): string {
  const full = formatUnits(amount, decimals);
  const [intPart = "0", fraction = ""] = full.split(".");
  const cut = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return cut.length > 0 ? `${intPart}.${cut}` : intPart;
}

export function formatSignificant(amount: bigint, decimals: number, significant: number): string {
  if (amount === 0n) {
    return "0";
  }
  const full = formatUnits(amount, decimals);
  const [intPart = "0", fraction = ""] = full.split(".");
  if (intPart !== "0") {
    const cut = fraction.slice(0, 4).replace(/0+$/, "");
    return cut.length > 0 ? `${intPart}.${cut}` : intPart;
  }
  const firstNonZero = fraction.search(/[1-9]/);
  if (firstNonZero === -1) {
    return "0";
  }
  const cut = fraction.slice(0, firstNonZero + significant).replace(/0+$/, "");
  return `0.${cut}`;
}

export function sharesFromTokens(tokens: bigint, sharesPerToken: bigint): bigint {
  return mulDivDown(tokens, sharesPerToken, ONE);
}

export function usdValue(tokens: bigint, priceUsd: string): string {
  const price = toUnits(priceUsd, 18);
  return formatAmount(mulDivDown(tokens, price, ONE), 18, 2);
}
