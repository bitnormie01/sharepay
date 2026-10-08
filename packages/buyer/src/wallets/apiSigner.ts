import type { TradingApi } from "@sharepay/core/binance/trading";
import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { sendPrepared, simulatePrepared, viemTxSigner, type WalletMutex } from "@sharepay/core/chain/txpipeline";
import { AGGREGATION_ROUTER, sameAddress } from "@sharepay/core/tokens";
import { encodePaymentPayload } from "@sharepay/core/x402/codec";
import { buildAuthorization, domainForStable, viemAuthorizationSigner } from "@sharepay/core/x402/eip3009";
import { HEADER_PAYMENT_SIGNATURE } from "@sharepay/core/x402/types";
import type { Address, Hex, LocalAccount } from "viem";
import { MAX_UINT256, freshSwapRoute, simulateFirstLeg } from "./simulate.js";
import { SaleError, type PayerWallet } from "./types.js";

export interface ApiSignerDeps {
  trading: TradingApi;
  tx: TransactionApi;
  chain: ChainReader;
  account: LocalAccount;
  mutex: WalletMutex;
  slippagePercent: string;
  receiptTimeoutMs: number;
}

export function createApiSignerWallet(deps: ApiSignerDeps): PayerWallet {
  const owner = deps.account.address;
  const pipeline = { tx: deps.tx, chain: deps.chain, signer: viemTxSigner(deps.account) };
  return {
    kind: "api-signer",
    address: async () => owner,
    simulateSale: (plan) => simulateFirstLeg({ trading: deps.trading, tx: deps.tx, chain: deps.chain, slippagePercent: deps.slippagePercent }, owner, plan),
    executeSale: (plan, onBroadcast) =>
      deps.mutex(async () => {
        const txHashes: Hex[] = [];
        let amountIn = plan.sellAmount;
        let received = 0n;
        for (let i = 0; i < plan.legs.length; i += 1) {
          const leg = plan.legs[i];
          if (!leg) break;
          const last = i === plan.legs.length - 1;
          let route = await freshSwapRoute(deps.trading, leg, amountIn, owner);
          if (!route) throw new SaleError("route_lost", `no SWAP route for leg ${i + 1}`);
          const spender = (route.approveTarget ?? AGGREGATION_ROUTER) as Address;
          if ((await deps.chain.allowance(leg.from, owner, spender)) < amountIn) {
            const approve = await deps.trading.approveTransaction({ tokenContractAddress: leg.from, approveAmount: MAX_UINT256, vendor: route.vendorName ?? undefined });
            if (!sameAddress(approve.dexContractAddress, spender)) {
              throw new SaleError("approve_mismatch", `approve spender ${approve.dexContractAddress} does not match route spender ${spender}`);
            }
            const approval = { to: leg.from, data: approve.data as Hex, value: 0n };
            const approveSim = await simulatePrepared(deps.tx, owner, approval);
            if (!approveSim.ok) throw new SaleError("simulation_failed", `approve simulation failed: ${approveSim.failReason ?? approveSim.status}`);
            onBroadcast?.();
            txHashes.push((await sendPrepared(pipeline, approval, { mevProtection: false, receiptTimeoutMs: deps.receiptTimeoutMs, gasFallback: 80_000n })).txHash);
            route = await freshSwapRoute(deps.trading, leg, amountIn, owner);
            if (!route) throw new SaleError("route_lost", `no SWAP route for leg ${i + 1} after approval`);
          }
          const build = await deps.trading.swap({
            amount: amountIn,
            fromTokenAddress: leg.from,
            toTokenAddress: leg.to,
            userWalletAddress: owner,
            quoteId: route.quoteId,
            slippagePercent: deps.slippagePercent,
          });
          if ((build.executionMode ?? "").toUpperCase() !== "SWAP" || !build.tx) {
            throw new SaleError("not_swap", "swap build is not a SWAP transaction");
          }
          if (last && BigInt(build.tx.minReceiveAmount ?? "0") < plan.priceAtomic) {
            throw new SaleError("price_moved", `minimum receive ${build.tx.minReceiveAmount ?? "0"} is below the price ${plan.priceAtomic}`);
          }
          const prepared = { to: build.tx.to as Address, data: build.tx.data as Hex, value: BigInt(build.tx.value ?? "0") };
          const simulation = await simulatePrepared(deps.tx, owner, prepared);
          if (!simulation.ok) throw new SaleError("simulation_failed", `swap simulation failed: ${simulation.failReason ?? simulation.status}`);
          const before = await deps.chain.balanceOf(leg.to, owner);
          onBroadcast?.();
          txHashes.push((await sendPrepared(pipeline, prepared, { mevProtection: true, receiptTimeoutMs: deps.receiptTimeoutMs, gasFallback: 450_000n })).txHash);
          const after = await deps.chain.balanceOf(leg.to, owner);
          received = after > before ? after - before : 0n;
          if (received === 0n) throw new SaleError("nothing_received", `leg ${i + 1} returned nothing`);
          amountIn = received;
        }
        if (received < plan.priceAtomic) {
          throw new SaleError("price_moved", `received ${received} is below the price ${plan.priceAtomic}`);
        }
        return { txHashes, received };
      }),
    async signPayment(challenge, selected, nowSec) {
      const authorization = buildAuthorization({
        from: owner,
        to: selected.accept.payTo as Address,
        value: BigInt(selected.accept.amount),
        nowSec,
        maxTimeoutSeconds: selected.accept.maxTimeoutSeconds ?? 300,
      });
      const signature = await viemAuthorizationSigner(deps.account).signTransferAuthorization(domainForStable(selected.stable), authorization);
      return {
        name: HEADER_PAYMENT_SIGNATURE,
        value: encodePaymentPayload({ x402Version: 2, resource: challenge.required.resource, accepted: selected.accept, payload: { signature, authorization } }),
      };
    },
  };
}
