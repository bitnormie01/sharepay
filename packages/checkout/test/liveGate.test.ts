import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_VERSION, loadCheckoutConfig } from "../src/config.js";
import { createLiveGate, type LiveGateOptions } from "../src/liveGate.js";

const KEY = `0x${"11".repeat(32)}`;
const PASS = "correct horse battery";

function repoRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "sharepay-root-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "sharepay" }));
  return dir;
}

describe("loadCheckoutConfig", () => {
  it("applies defaults and resolves data paths against the repo root", () => {
    const root = repoRoot();
    const config = loadCheckoutConfig({ BUYER_PRIVATE_KEY: KEY, MERCHANT_URL: "https://merchant.example/" }, join(root, "packages", "checkout"));
    expect(config).toMatchObject({
      walletMode: "api-signer",
      buyerPrivateKey: KEY,
      bawBin: "baw",
      awPaysOwnMerchant: true,
      merchantUrl: "https://merchant.example",
      livePasscode: null,
      liveDailyMaxCount: 10,
      liveDailyMaxUsd: "1.50",
      port: 8787,
      binance: null,
      devexEventsPath: null,
      version: CHECKOUT_VERSION,
    });
    expect(config.receiptsSeedPath).toBe(join(root, "data", "receipts.seed.json"));
    expect(config.receiptsRuntimePath).toBe(join(root, "data", "runtime", "receipts.json"));
    expect(config.webDist).toBe(join(root, "packages", "web", "dist"));
  });

  it("reads the optional settings", () => {
    const root = repoRoot();
    const config = loadCheckoutConfig(
      {
        WALLET_MODE: "agentic-wallet",
        BAW_BIN: "C:/npm/baw/dist/cli.js",
        MERCHANT_URL: "http://localhost:9000",
        LIVE_PASSCODE: PASS,
        LIVE_DAILY_MAX_COUNT: "3",
        LIVE_DAILY_MAX_USD: "0.50",
        RECEIPTS_RUNTIME_PATH: "",
        PORT: "10000",
        BINANCE_API_KEY: "k",
        BINANCE_API_SECRET: "s",
        DEVEX_EVENTS_PATH: "devex/events.jsonl",
        RENDER_GIT_COMMIT: "abcdef1234567",
      },
      root,
    );
    expect(config).toMatchObject({
      walletMode: "agentic-wallet",
      buyerPrivateKey: null,
      bawBin: "C:/npm/baw/dist/cli.js",
      livePasscode: PASS,
      liveDailyMaxCount: 3,
      liveDailyMaxUsd: "0.50",
      receiptsRuntimePath: null,
      port: 10000,
      binance: { apiKey: "k", secretKey: "s" },
      version: `${CHECKOUT_VERSION}+abcdef1`,
    });
    expect(config.devexEventsPath).toBe(join(root, "devex", "events.jsonl"));
  });

  it("normalizes a private key given without the 0x prefix", () => {
    expect(loadCheckoutConfig({ BUYER_PRIVATE_KEY: "11".repeat(32), MERCHANT_URL: "http://m" }, repoRoot()).buyerPrivateKey).toBe(KEY);
  });

  it.each<[Record<string, string>, string]>([
    [{ WALLET_MODE: "custodial", BUYER_PRIVATE_KEY: KEY, MERCHANT_URL: "http://m" }, "WALLET_MODE"],
    [{ MERCHANT_URL: "http://m" }, "BUYER_PRIVATE_KEY is required"],
    [{ WALLET_MODE: "agentic-wallet", AW_PAYS_OWN_MERCHANT: "false", MERCHANT_URL: "http://m" }, "BUYER_PRIVATE_KEY is required"],
    [{ BUYER_PRIVATE_KEY: "0x1234", MERCHANT_URL: "http://m" }, "32 bytes"],
    [{ BUYER_PRIVATE_KEY: KEY }, "MERCHANT_URL"],
    [{ BUYER_PRIVATE_KEY: KEY, MERCHANT_URL: "http://m", LIVE_PASSCODE: "short" }, "at least 8"],
    [{ BUYER_PRIVATE_KEY: KEY, MERCHANT_URL: "http://m", LIVE_DAILY_MAX_USD: "lots" }, "LIVE_DAILY_MAX_USD"],
    [{ BUYER_PRIVATE_KEY: KEY, MERCHANT_URL: "http://m", LIVE_DAILY_MAX_COUNT: "-1" }, "LIVE_DAILY_MAX_COUNT"],
    [{ BUYER_PRIVATE_KEY: KEY, MERCHANT_URL: "http://m", PORT: "http" }, "PORT"],
  ])("rejects %j", (env, message) => {
    expect(() => loadCheckoutConfig(env, repoRoot())).toThrow(message);
  });
});

describe("createLiveGate", () => {
  function setup(overrides: Partial<LiveGateOptions> = {}) {
    const clock = { now: Date.UTC(2026, 9, 8, 10, 0) };
    const gate = createLiveGate({ passcode: PASS, maxCount: 3, maxUsd: "0.12", nowMs: () => clock.now, ...overrides });
    return { gate, clock };
  }

  it("stays disabled without a passcode", () => {
    const { gate } = setup({ passcode: null });
    expect(gate.budget()).toEqual({ liveAvailable: false, remainingCount: 3, remainingUsd: "0.12" });
    expect(gate.unlock("1.1.1.1", PASS)).toEqual({ ok: false, error: "live_disabled" });
    expect(gate.reserve("1.1.1.1", PASS, "c1", "0.05")).toEqual({ ok: false, error: "live_disabled" });
  });

  it("unlocks with the right passcode only", () => {
    const { gate } = setup();
    expect(gate.unlock("1.1.1.1", PASS)).toEqual({ ok: true });
    expect(gate.budget()).toEqual({ liveAvailable: true, remainingCount: 3, remainingUsd: "0.12" });
    expect(gate.unlock("1.1.1.1", "")).toEqual({ ok: false, error: "live_passcode_invalid" });
    expect(gate.reserve("1.1.1.1", "wrong", "c1", "0.05")).toEqual({ ok: false, error: "live_passcode_invalid" });
    expect(gate.budget().remainingCount).toBe(3);
  });

  it("locks an IP out after 5 failures in 10 minutes", () => {
    const { gate, clock } = setup();
    for (let i = 0; i < 5; i += 1) expect(gate.unlock("6.6.6.6", `guess-${i}`)).toEqual({ ok: false, error: "live_passcode_invalid" });
    expect(gate.unlock("6.6.6.6", PASS)).toEqual({ ok: false, error: "live_locked_out" });
    expect(gate.unlock("7.7.7.7", PASS)).toEqual({ ok: true });
    clock.now += 10 * 60 * 1000;
    expect(gate.unlock("6.6.6.6", PASS)).toEqual({ ok: true });
  });

  it("locks everyone out after too many failures in an hour", () => {
    const { gate, clock } = setup({ globalFailureLimit: 4, ipFailureLimit: 2 });
    for (const ip of ["1.0.0.1", "1.0.0.2"]) for (let i = 0; i < 2; i += 1) gate.unlock(ip, "nope");
    expect(gate.unlock("9.9.9.9", PASS)).toEqual({ ok: false, error: "live_locked_out" });
    clock.now += 60 * 60 * 1000;
    expect(gate.unlock("9.9.9.9", PASS)).toEqual({ ok: true });
  });

  it("runs one live checkout at a time and releases a slot that never broadcast", () => {
    const { gate } = setup();
    expect(gate.reserve("1.1.1.1", PASS, "c1", "0.05")).toEqual({ ok: true });
    expect(gate.budget()).toEqual({ liveAvailable: true, remainingCount: 2, remainingUsd: "0.07" });
    expect(gate.reserve("2.2.2.2", PASS, "c2", "0.05")).toEqual({ ok: false, error: "live_busy" });
    gate.finish("c1");
    expect(gate.budget()).toEqual({ liveAvailable: true, remainingCount: 3, remainingUsd: "0.12" });
  });

  it("consumes the slot as soon as the sale is broadcast", () => {
    const { gate } = setup();
    gate.reserve("1.1.1.1", PASS, "c1", "0.05");
    gate.markBroadcast("c1");
    gate.markBroadcast("c1");
    gate.markBroadcast("unknown");
    expect(gate.budget()).toEqual({ liveAvailable: true, remainingCount: 2, remainingUsd: "0.07" });
    gate.finish("c1");
    expect(gate.budget()).toEqual({ liveAvailable: true, remainingCount: 2, remainingUsd: "0.07" });
    expect(gate.reserve("1.1.1.1", PASS, "c2", "0.05")).toEqual({ ok: true });
  });

  it("enforces the daily count and USD caps and resets at UTC midnight", () => {
    const { gate, clock } = setup();
    for (const id of ["a", "b"]) {
      expect(gate.reserve("1.1.1.1", PASS, id, "0.05")).toEqual({ ok: true });
      gate.markBroadcast(id);
      gate.finish(id);
    }
    expect(gate.budget()).toEqual({ liveAvailable: true, remainingCount: 1, remainingUsd: "0.02" });
    expect(gate.reserve("1.1.1.1", PASS, "c", "0.05")).toEqual({ ok: false, error: "live_cap_reached" });
    expect(gate.reserve("1.1.1.1", PASS, "d", "0.01")).toEqual({ ok: true });
    gate.markBroadcast("d");
    gate.finish("d");
    expect(gate.budget()).toEqual({ liveAvailable: false, remainingCount: 0, remainingUsd: "0.01" });
    expect(gate.unlock("1.1.1.1", PASS)).toEqual({ ok: false, error: "live_cap_reached" });
    clock.now = Date.UTC(2026, 9, 9, 0, 0);
    expect(gate.budget()).toEqual({ liveAvailable: true, remainingCount: 3, remainingUsd: "0.12" });
  });
});
