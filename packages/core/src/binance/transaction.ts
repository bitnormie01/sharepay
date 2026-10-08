import { z } from "zod";
import { BINANCE_CHAIN_ID } from "../tokens.js";
import type { BinanceClient } from "./client.js";
import { stringish } from "./listOf.js";

export interface EvmTxInput {
  from: string;
  to: string;
  value: bigint;
  data: string;
}

export interface BalanceChange {
  contractAddress?: string | null;
  tokenType?: string | null;
  change: string;
  owner: string;
}

export interface AllowanceChange {
  tokenAddress: string;
  owner: string;
  spender: string;
  preAmount?: string | null;
  postAmount?: string | null;
}

export interface SimulationResult {
  ok: boolean;
  status: string;
  failReason: string | null;
  balanceChanges: BalanceChange[];
  allowanceChanges: AllowanceChange[];
}

export interface TransactionApi {
  simulate(tx: EvmTxInput): Promise<SimulationResult>;
  gasPrice(): Promise<bigint>;
  gasLimit(tx: EvmTxInput): Promise<bigint>;
  broadcast(params: { signedTransaction: string; address: string; enableMevProtection: boolean }): Promise<{ orderId: string | null; txHash: string }>;
}

const BalanceChangeSchema: z.ZodType<BalanceChange, z.ZodTypeDef, unknown> = z
  .object({
    contractAddress: stringish.optional(),
    tokenType: stringish.optional(),
    change: z.coerce.string(),
    owner: z.string(),
  })
  .passthrough();

const AllowanceChangeSchema: z.ZodType<AllowanceChange, z.ZodTypeDef, unknown> = z
  .object({
    tokenAddress: z.string(),
    owner: z.string(),
    spender: z.string(),
    preAmount: stringish.optional(),
    postAmount: stringish.optional(),
  })
  .passthrough();

const SimulationSchema = z
  .object({
    status: stringish.optional(),
    failReason: stringish.optional(),
    balanceChanges: z.array(BalanceChangeSchema).nullable().optional(),
    allowanceChanges: z.array(AllowanceChangeSchema).nullable().optional(),
  })
  .passthrough();

const GasPriceSchema = z
  .object({
    evmLegacyGasPrice: z.object({ mediumGasPrice: z.coerce.string() }).passthrough(),
  })
  .passthrough();

const GasLimitSchema = z.object({ gasLimit: z.coerce.string() }).passthrough();

const BroadcastSchema = z.object({ orderId: stringish.optional(), txHash: z.string() }).passthrough();

export function isSimulationOk(status: string | null | undefined, failReason: string | null | undefined): boolean {
  const failedStatus = (status ?? "").toUpperCase() === "FAILED";
  const hasReason = typeof failReason === "string" && failReason.trim().length > 0;
  return !failedStatus && !hasReason;
}

function evmTx(tx: EvmTxInput): { from: string; to: string; value: string; data: string } {
  return { from: tx.from, to: tx.to, value: tx.value.toString(), data: tx.data };
}

export function createTransactionApi(client: BinanceClient): TransactionApi {
  return {
    async simulate(tx) {
      const result = await client.post(
        "/api/v1/dex/pre-transaction/simulate",
        { binanceChainId: BINANCE_CHAIN_ID, evmTx: evmTx(tx) },
        SimulationSchema,
      );
      const status = result.status ?? "";
      const failReason = result.failReason ?? null;
      return {
        ok: isSimulationOk(status, failReason),
        status,
        failReason,
        balanceChanges: result.balanceChanges ?? [],
        allowanceChanges: result.allowanceChanges ?? [],
      };
    },
    async gasPrice() {
      const result = await client.get(
        "/api/v1/dex/pre-transaction/gas-price",
        { binanceChainId: BINANCE_CHAIN_ID },
        GasPriceSchema,
      );
      return BigInt(result.evmLegacyGasPrice.mediumGasPrice);
    },
    async gasLimit(tx) {
      const result = await client.post(
        "/api/v1/dex/pre-transaction/gas-limit",
        { binanceChainId: BINANCE_CHAIN_ID, evmTx: evmTx(tx) },
        GasLimitSchema,
      );
      return BigInt(result.gasLimit);
    },
    async broadcast(params) {
      const result = await client.post(
        "/api/v1/dex/pre-transaction/broadcast-transaction",
        {
          binanceChainId: BINANCE_CHAIN_ID,
          signedTransaction: params.signedTransaction,
          address: params.address,
          enableMevProtection: params.enableMevProtection,
        },
        BroadcastSchema,
      );
      return { orderId: result.orderId ?? null, txHash: result.txHash };
    },
  };
}
