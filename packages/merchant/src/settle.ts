import { sendPrepared, type PipelineDeps, type WalletMutex } from "@sharepay/core/chain/txpipeline";
import type { Address, Hex } from "viem";

export function settlePayment(
  deps: { pipeline: PipelineDeps; mutex: WalletMutex; receiptTimeoutMs: number },
  asset: Address,
  calldata: Hex,
): Promise<{ txHash: Hex }> {
  return deps.mutex(() =>
    sendPrepared(
      deps.pipeline,
      { to: asset, data: calldata, value: 0n },
      { mevProtection: false, receiptTimeoutMs: deps.receiptTimeoutMs, gasFallback: 150_000n },
    ),
  );
}
