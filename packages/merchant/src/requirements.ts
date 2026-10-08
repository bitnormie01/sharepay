import { X402_NETWORK, getStable } from "@sharepay/core/tokens";
import type { PaymentRequired } from "@sharepay/core/x402/types";
import type { Address } from "viem";

export function buildReportRequirements(options: {
  priceAtomic: bigint;
  payTo: Address;
  resourceUrl: string;
  maxTimeoutSeconds: number;
  assets: Array<"U" | "USD1">;
}): PaymentRequired {
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: {
      url: options.resourceUrl,
      description: "Research report assembled deterministically from the Binance Web3 RWA Data API (no LLM)",
      mimeType: "application/json",
    },
    accepts: options.assets.map((symbol) => {
      const stable = getStable(symbol);
      if (stable.eip3009 === null) throw new Error(`${symbol} has no EIP-3009 domain`);
      return {
        scheme: "exact",
        network: X402_NETWORK,
        amount: options.priceAtomic.toString(),
        asset: stable.address,
        payTo: options.payTo,
        maxTimeoutSeconds: options.maxTimeoutSeconds,
        extra: { name: stable.eip3009.name, version: stable.eip3009.version, assetTransferMethod: "eip3009" },
      };
    }),
  };
}
