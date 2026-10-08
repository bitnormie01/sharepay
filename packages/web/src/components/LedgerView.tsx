import type { LedgerResponse } from "@sharepay/core/dto";
import { fmtDateTime, fmtUsd } from "../format";
import { ReceiptLinks } from "./ReceiptCard";

export function LedgerView({ ledger }: { ledger: LedgerResponse }) {
  const receipts = [...ledger.receipts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <section className="ledger">
      <h2>Holdings</h2>
      <ul>
        {ledger.holdings.map((holding) => (
          <li key={holding.tokenAddress}>
            {`${holding.name} (${holding.symbol}) · ${holding.shares} shares (~${fmtUsd(holding.valueUsd)})`}
          </li>
        ))}
      </ul>
      <h2>Receipts</h2>
      {receipts.length === 0 ? (
        <p>No receipts yet.</p>
      ) : (
        <ul>
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              {`${fmtDateTime(receipt.createdAt)} · ${receipt.itemTitle} · Paid ${fmtUsd(receipt.paidUsd)} with ${receipt.sharesSold} ${receipt.stockName} shares`}
              <ReceiptLinks receipt={receipt} />
            </li>
          ))}
        </ul>
      )}
      <p>
        <small>{ledger.walletLabel}</small>
      </p>
    </section>
  );
}
