import type { TxSigner } from "@sharepay/core/chain/txpipeline";
import type { Address, Hex } from "viem";

/** The slice of the BNB Agent Studio `getWallet()` provider (evm-local) we sign with. */
export interface StudioWalletLike {
  address: Address;
  signTransaction(tx: {
    to: Address;
    data: Hex;
    value: bigint;
    gas: bigint;
    gasPrice: bigint;
    nonce: number;
    chainId: number;
    type?: "legacy";
  }): Promise<{ rawTransaction: Hex }>;
}

export function studioTxSigner(wallet: StudioWalletLike): TxSigner {
  return {
    address: wallet.address,
    async signLegacyTx(tx) {
      const signed = await wallet.signTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gas: tx.gas,
        gasPrice: tx.gasPrice,
        nonce: tx.nonce,
        chainId: tx.chainId,
        type: "legacy",
      });
      return signed.rawTransaction;
    },
  };
}
