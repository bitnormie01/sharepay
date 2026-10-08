import { bestSwapRoute, type QuoteRoute, type TradingApi } from "@sharepay/core/binance/trading";
import type { TransactionApi } from "@sharepay/core/binance/transaction";
import type { ChainReader } from "@sharepay/core/chain/rpc";
import { AGGREGATION_ROUTER, sameAddress } from "@sharepay/core/tokens";
import type { Address } from "viem";
import type { SalePlan } from "../planner.js";
import type { SwapLeg } from "../routeProbe.js";
import { SaleError, type SaleSimulation } from "./types.js";

export interface SimDeps {
  trading: TradingApi;
  tx: TransactionApi;
  chain: Pick<ChainReader, "allowance">;
  slippagePercent: string;
}

export const MAX_UINT256: bigint = 2n ** 256n - 1n;

export async function freshSwapRoute(trading: TradingApi, leg: SwapLeg, amountIn: bigint, wallet: Address): Promise<QuoteRoute | null> {
  const vendor = (leg.route.vendorName ?? "") === "LiquidMesh" ? "LiquidMesh" : undefined;
  const routes = await trading.quote({ amount: amountIn, fromTokenAddress: leg.from, toTokenAddress: leg.to, userWalletAddress: wallet, vendor });
  return bestSwapRoute(routes);
}

export async function simulateFirstLeg(deps: SimDeps, owner: Address, plan: SalePlan): Promise<SaleSimulation> {
  const leg = plan.legs[0];
  if (!leg) throw new SaleError("no_route", "the sale plan has no legs");
  const spender = (leg.route.approveTarget ?? AGGREGATION_ROUTER) as Address;
  const allowance = await deps.chain.allowance(leg.from, owner, spender);
  if (allowance < leg.amountIn) {
    const approve = await deps.trading.approveTransaction({ tokenContractAddress: leg.from, approveAmount: MAX_UINT256, vendor: leg.route.vendorName ?? undefined });
    if (!sameAddress(approve.dexContractAddress, spender)) {
      return { ok: false, mode: "approve_only", failReason: `approve spender ${approve.dexContractAddress} does not match route spender ${spender}`, detail: {} };
    }
    const simulation = await deps.tx.simulate({ from: owner, to: leg.from, value: 0n, data: approve.data });
    return {
      ok: simulation.ok,
      mode: "approve_only",
      failReason: simulation.ok ? null : simulation.failReason ?? simulation.status,
      detail: { approveSpender: spender, note: "The swap can be simulated after the approval lands" },
    };
  }
  const route = await freshSwapRoute(deps.trading, leg, leg.amountIn, owner);
  if (!route) return { ok: false, mode: "swap", failReason: "no SWAP route right now", detail: {} };
  const build = await deps.trading.swap({
    amount: leg.amountIn,
    fromTokenAddress: leg.from,
    toTokenAddress: leg.to,
    userWalletAddress: owner,
    quoteId: route.quoteId,
    slippagePercent: deps.slippagePercent,
  });
  if ((build.executionMode ?? "").toUpperCase() !== "SWAP" || !build.tx) {
    return { ok: false, mode: "swap", failReason: "swap build is not a SWAP transaction", detail: {} };
  }
  const simulation = await deps.tx.simulate({ from: owner, to: build.tx.to, value: BigInt(build.tx.value ?? "0"), data: build.tx.data });
  const changes = simulation.balanceChanges
    .filter((c) => sameAddress(c.owner, owner))
    .map((c) => `${c.contractAddress ?? "native"}:${c.change}`)
    .join(", ");
  return {
    ok: simulation.ok,
    mode: "swap",
    failReason: simulation.ok ? null : simulation.failReason ?? simulation.status,
    detail: { router: build.tx.to, minReceive: build.tx.minReceiveAmount ?? "", balanceChanges: changes, vendor: route.vendorName ?? "" },
  };
}
