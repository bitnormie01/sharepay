import { describe, expect, it } from "vitest";
import {
  AGGREGATION_ROUTER,
  BINANCE_CHAIN_ID,
  STABLES,
  STOCKS,
  X402_NETWORK,
  findStableByAddress,
  findStockByAddress,
  getStable,
  getStock,
  normalizeAddress,
  sameAddress,
} from "../src/tokens.js";
import {
  ONE,
  addBps,
  ceilDiv,
  formatAmount,
  formatSignificant,
  mulDivDown,
  mulDivUp,
  sharesFromTokens,
  toUnits,
  usdValue,
} from "../src/money.js";

describe("token registry", () => {
  it("knows the demo stocks and stables with verified BSC addresses", () => {
    expect(getStock("NVDAB")).toMatchObject({
      name: "NVIDIA",
      underlyingTicker: "NVDA",
      platform: "bstock",
      address: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    });
    expect(getStock("SPYB").address).toBe("0x7138b48df7d98d7e3cc221bfe7192d0a178182d8");
    expect(getStock("NVDAon").platform).toBe("ondo");
    expect(getStable("U").eip3009).toEqual({ name: "United Stables", version: "1" });
    expect(getStable("USD1").eip3009).toEqual({ name: "World Liberty Financial USD", version: "1" });
    expect(getStable("USDT").eip3009).toBeNull();
    expect(STOCKS).toHaveLength(7);
    expect(STABLES).toHaveLength(3);
    expect(BINANCE_CHAIN_ID).toBe("56");
    expect(X402_NETWORK).toBe("eip155:56");
    expect(AGGREGATION_ROUTER).toBe("0xb44446b0c8e56988c34f7ff73ae904982b5fdda5");
  });

  it("finds tokens by address case-insensitively", () => {
    expect(findStockByAddress("0x02FCA66C1D1AFB4E2A7884261EB00F63598A7436")?.symbol).toBe("NVDAB");
    expect(findStableByAddress("0xcE24439F2D9C6a2289F741120FE202248B666666")?.symbol).toBe("U");
    expect(findStockByAddress("0x0000000000000000000000000000000000000001")).toBeUndefined();
    expect(sameAddress("0xAbC0000000000000000000000000000000000000", "0xabc0000000000000000000000000000000000000")).toBe(true);
  });

  it("normalizes and validates addresses", () => {
    expect(normalizeAddress("0xcE24439F2D9C6a2289F741120FE202248B666666")).toBe(
      "0xce24439f2d9c6a2289f741120fe202248b666666",
    );
    expect(() => normalizeAddress("0x123")).toThrow("invalid address");
    expect(() => getStock("NOPE")).toThrow("unknown stock symbol");
  });
});

describe("money math", () => {
  it("parses decimal strings to base units", () => {
    expect(toUnits("0.05", 18)).toBe(50000000000000000n);
    expect(toUnits("168.31", 18)).toBe(168310000000000000000n);
    expect(() => toUnits("1e5", 18)).toThrow("invalid decimal");
    expect(() => toUnits("-1", 18)).toThrow("invalid decimal");
  });

  it("does rounding-aware integer arithmetic", () => {
    expect(ceilDiv(7n, 2n)).toBe(4n);
    expect(ceilDiv(8n, 2n)).toBe(4n);
    expect(mulDivUp(10n, 3n, 4n)).toBe(8n);
    expect(mulDivDown(10n, 3n, 4n)).toBe(7n);
    expect(addBps(10_000n, 300)).toBe(10_300n);
    expect(addBps(1n, 1)).toBe(2n);
    expect(() => ceilDiv(1n, 0n)).toThrow("division by zero");
  });

  it("formats amounts for display", () => {
    expect(formatAmount(50000000000000000n, 18, 4)).toBe("0.05");
    expect(formatAmount(1234567890000000000n, 18, 2)).toBe("1.23");
    expect(formatAmount(0n, 18, 2)).toBe("0");
    expect(formatSignificant(298123456789000n, 18, 3)).toBe("0.000298");
    expect(formatSignificant(12345678900000000000n, 18, 3)).toBe("12.3456");
    expect(formatSignificant(0n, 18, 3)).toBe("0");
  });

  it("converts tokens to shares and USD values", () => {
    expect(ONE).toBe(10n ** 18n);
    expect(sharesFromTokens(1_000_000_000_000_000_000n, 1_000_778_223_752_807_865n)).toBe(1_000_778_223_752_807_865n);
    expect(usdValue(12_300_000_000_000_000n, "168.31")).toBe("2.07");
  });
});
