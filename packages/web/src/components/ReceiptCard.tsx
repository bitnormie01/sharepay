import type { Receipt } from "@sharepay/core/dto";
import { fmtDateTime, fmtUsd } from "../format";

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

export function ReceiptLinks({ receipt }: { receipt: Receipt }) {
  return (
    <p className="tx-links">
      {receipt.swapTxHashes.map((hash, index) => (
        <TxLink
          key={hash}
          hash={hash}
          label={receipt.swapTxHashes.length > 1 ? `Sale tx ${index + 1}` : "Sale tx"}
        />
      ))}
      {receipt.settlementTxHash && <TxLink hash={receipt.settlementTxHash} label="Settlement tx" />}
      {receipt.reinvestTxHash && <TxLink hash={receipt.reinvestTxHash} label="Reinvest tx" />}
    </p>
  );
}

export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <section className="card receipt">
      <h2>Receipt</h2>
      <p>{`Paid ${fmtUsd(receipt.paidUsd)} with ${receipt.sharesSold} ${receipt.stockName} shares`}</p>
      <p>{receipt.merchantName}</p>
      <p>{fmtDateTime(receipt.createdAt)}</p>
      <ReceiptLinks receipt={receipt} />
    </section>
  );
}
