import type { Address, Hex, LocalAccount } from "viem";
import type { SimulationResult, TransactionApi } from "../binance/transaction.js";
import type { ChainReader } from "./rpc.js";

export interface LegacyTxRequest {
  to: Address;
  data: Hex;
  value: bigint;
  gas: bigint;
  gasPrice: bigint;
  nonce: number;
  chainId: 56;
}

export interface TxSigner {
  address: Address;
  signLegacyTx(tx: LegacyTxRequest): Promise<Hex>;
}

export interface PreparedTx {
  to: Address;
  data: Hex;
  value: bigint;
}

export interface PipelineDeps {
  tx: TransactionApi;
  chain: ChainReader;
  signer: TxSigner;
}

export class TxFailedError extends Error {
  readonly stage: "broadcast" | "receipt";
  readonly txHash: Hex | null;

  constructor(stage: "broadcast" | "receipt", message: string, txHash: Hex | null) {
    super(message);
    this.name = "TxFailedError";
    this.stage = stage;
    this.txHash = txHash;
  }
}

export function simulatePrepared(tx: TransactionApi, from: Address, prepared: PreparedTx): Promise<SimulationResult> {
  return tx.simulate({ from, to: prepared.to, value: prepared.value, data: prepared.data });
}

export async function sendPrepared(
  deps: PipelineDeps,
  prepared: PreparedTx,
  options: { mevProtection: boolean; receiptTimeoutMs: number; gasFallback: bigint },
): Promise<{ txHash: Hex }> {
  const gasPrice = await deps.tx.gasPrice();
  let gas: bigint;
  try {
    const estimate = await deps.tx.gasLimit({ from: deps.signer.address, to: prepared.to, value: prepared.value, data: prepared.data });
    gas = (estimate * 12n) / 10n;
  } catch {
    gas = options.gasFallback;
  }
  const nonce = await deps.chain.pendingNonce(deps.signer.address);
  const raw = await deps.signer.signLegacyTx({
    to: prepared.to,
    data: prepared.data,
    value: prepared.value,
    gas,
    gasPrice,
    nonce,
    chainId: 56,
  });
  let txHash: Hex;
  try {
    const broadcast = await deps.tx.broadcast({
      signedTransaction: raw,
      address: deps.signer.address,
      enableMevProtection: options.mevProtection,
    });
    txHash = broadcast.txHash as Hex;
  } catch (error) {
    throw new TxFailedError("broadcast", error instanceof Error ? error.message : String(error), null);
  }
  const receipt = await deps.chain.waitForReceipt(txHash, options.receiptTimeoutMs);
  if (receipt.status !== "success") {
    throw new TxFailedError("receipt", `transaction ${txHash} reverted`, txHash);
  }
  return { txHash };
}

export type WalletMutex = <T>(fn: () => Promise<T>) => Promise<T>;

export function createWalletMutex(): WalletMutex {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

export function viemTxSigner(account: LocalAccount): TxSigner {
  return {
    address: account.address,
    signLegacyTx: (tx) =>
      account.signTransaction({
        type: "legacy",
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gas: tx.gas,
        gasPrice: tx.gasPrice,
        nonce: tx.nonce,
        chainId: tx.chainId,
      }),
  };
}
