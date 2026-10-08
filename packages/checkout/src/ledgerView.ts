import type { Holding } from "@sharepay/buyer/holdings";
import type { ReceiptStore } from "@sharepay/buyer/ledger";
import type { PayerWallet } from "@sharepay/buyer/wallets/types";
import type { LedgerHolding, LedgerResponse } from "@sharepay/core/dto";
import { formatSignificant, sharesFromTokens, usdValue } from "@sharepay/core/money";
import type { ViewDeps } from "./pickerView.js";

export function toLedgerHolding(holding: Holding): LedgerHolding {
  return {
    symbol: holding.stock.symbol,
    name: holding.stock.name,
    tokenAddress: holding.stock.address,
    shares: formatSignificant(sharesFromTokens(holding.balance, holding.sharesPerToken), 18, 4),
    valueUsd: holding.priceUsd ? usdValue(holding.balance, holding.priceUsd) : "0",
  };
}

export interface LedgerViewDeps extends ViewDeps {
  wallet: PayerWallet;
  walletLabel: string;
  receipts: Pick<ReceiptStore, "list">;
}

export interface LedgerView {
  get(): Promise<LedgerResponse>;
}

export function createLedgerView(deps: LedgerViewDeps): LedgerView {
  return {
    async get() {
      let holdings: LedgerHolding[] = [];
      try {
        const owner = await deps.wallet.address();
        holdings = (await deps.holdings(owner, await deps.snapshot())).map(toLedgerHolding);
      } catch {
        holdings = [];
      }
      const receipts = [...deps.receipts.list()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { walletLabel: deps.walletLabel, holdings, receipts };
    },
  };
}
