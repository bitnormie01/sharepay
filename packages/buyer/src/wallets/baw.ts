import { execFile } from "node:child_process";
import { sameAddress } from "@sharepay/core/tokens";
import { canonicalJson } from "@sharepay/core/x402/codec";
import type { SelectedAccept } from "@sharepay/core/x402/types";
import type { Address } from "viem";

export type ExecFn = (file: string, args: string[], options: { timeoutMs: number }) => Promise<{ stdout: string; stderr: string; code: number }>;

export const nodeExec: ExecFn = (file, args, options) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: options.timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ stdout: String(stdout), stderr: String(stderr), code: error ? 1 : 0 });
    });
  });

export function bawCommand(bin: string): { file: string; prefix: string[] } {
  return /\.(c|m)?js$/i.test(bin) ? { file: process.execPath, prefix: [bin] } : { file: bin, prefix: [] };
}

export class BawError extends Error {
  readonly command: string;

  constructor(command: string, message: string) {
    super(`baw ${command}: ${message}`);
    this.name = "BawError";
    this.command = command;
  }
}

export interface BawPaymentOption {
  index: number;
  status: string;
  reasons: string[];
  originalAccept: Record<string, unknown> | null;
}

export interface BawClient {
  address(): Promise<Address>;
  walletStatus(): Promise<string>;
  swap(params: { fromToken: Address; toToken: Address; fromTokenQty: string }): Promise<string>;
  order(orderId: string): Promise<{ status: string; txHash: string | null }>;
  x402Preview(paymentRequirements: string): Promise<{ paymentId: string; options: BawPaymentOption[] }>;
  x402Sign(paymentId: string, selectedIndex: number): Promise<{ headerName: string; headerValue: string; signatureExpiresAt: number | null }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function createBawClient(exec: ExecFn, bin: string): BawClient {
  async function run(args: string[], timeoutMs = 60_000): Promise<Record<string, unknown>> {
    const { file, prefix } = bawCommand(bin);
    const command = args.slice(0, 2).join(" ");
    const result = await exec(file, [...prefix, ...args], { timeoutMs });
    const text = result.stdout.trim();
    const start = text.indexOf("{");
    let parsed: unknown;
    try {
      parsed = JSON.parse(start >= 0 ? text.slice(start) : text);
    } catch {
      throw new BawError(command, `non-JSON output: ${(result.stderr || result.stdout).slice(0, 300)}`);
    }
    const record = asRecord(parsed);
    if (record.success !== true) {
      const why = record.error ?? record.message ?? record.msg ?? JSON.stringify(record).slice(0, 300);
      throw new BawError(command, String(why));
    }
    return asRecord(record.data);
  }

  return {
    async address() {
      const data = await run(["wallet", "address", "--json"]);
      const list = Array.isArray(data.addresses) ? data.addresses.map(asRecord) : [];
      const bsc = list.find((entry) => String(entry.binanceChainId) === "56");
      if (!bsc || typeof bsc.address !== "string") throw new BawError("wallet address", "no BSC (56) address");
      return bsc.address as Address;
    },
    async walletStatus() {
      return String((await run(["wallet", "status", "--json"])).status ?? "UNKNOWN");
    },
    async swap(params) {
      const data = await run(
        ["market-order", "swap", "--fromTokenQty", params.fromTokenQty, "--fromToken", params.fromToken, "--toToken", params.toToken, "--binanceChainId", "56", "--slippage", "auto", "--mev", "true", "--json"],
        120_000,
      );
      if (typeof data.orderId !== "string" && typeof data.orderId !== "number") throw new BawError("market-order swap", "no orderId");
      return String(data.orderId);
    },
    async order(orderId) {
      const data = await run(["market-order", "list", "--orderId", orderId, "--json"]);
      const list = Array.isArray(data.list) ? data.list.map(asRecord) : [];
      const entry = list.find((o) => String(o.orderId) === orderId) ?? list[0];
      if (!entry) return { status: "PENDING", txHash: null };
      return { status: String(entry.status ?? "PENDING"), txHash: typeof entry.txHash === "string" ? entry.txHash : null };
    },
    async x402Preview(paymentRequirements) {
      const data = await run(["x402-payment", "preview", "--paymentRequirements", paymentRequirements, "--json"]);
      const options = (Array.isArray(data.options) ? data.options : []).map(asRecord).map((o) => ({
        index: Number(o.index),
        status: String(o.status ?? ""),
        reasons: Array.isArray(o.reasons) ? o.reasons.map(String) : [],
        originalAccept: o.originalAccept !== null && typeof o.originalAccept === "object" ? (o.originalAccept as Record<string, unknown>) : null,
      }));
      return { paymentId: String(data.paymentId ?? ""), options };
    },
    async x402Sign(paymentId, selectedIndex) {
      const data = await run(["x402-payment", "sign", "--paymentId", paymentId, "--selectedIndex", String(selectedIndex), "--json"]);
      return {
        headerName: String(data.paymentHeaderName ?? "PAYMENT-SIGNATURE"),
        headerValue: String(data.paymentHeaderValue ?? ""),
        signatureExpiresAt: typeof data.signatureExpiresAt === "number" ? data.signatureExpiresAt : null,
      };
    },
  };
}

export function matchOption(options: BawPaymentOption[], selected: SelectedAccept): BawPaymentOption | null {
  const target = canonicalJson(selected.accept);
  const exact = options.find((o) => o.originalAccept !== null && canonicalJson(o.originalAccept) === target);
  if (exact) return exact;
  return (
    options.find((o) => {
      const original = o.originalAccept ?? {};
      const extra = asRecord(original.extra);
      const method = typeof extra.assetTransferMethod === "string" ? extra.assetTransferMethod : "eip3009";
      return typeof original.asset === "string" && sameAddress(original.asset, selected.accept.asset) && method === "eip3009" && String(original.amount ?? "") === selected.accept.amount;
    }) ?? null
  );
}
