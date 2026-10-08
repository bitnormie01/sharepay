import type { Receipt } from "@sharepay/core/dto";
import { fmtDateTime, fmtUsd } from "../format";
import { ReceiptLinks } from "./ReceiptCard";

export function RecordedRun({ receipt }: { receipt: Receipt | null }) {
  return (
    <section className="card recorded" aria-label="Recorded live run">
      <h2>Recorded live run</h2>
      {receipt == null ? (
        <p>No recorded live run yet.</p>
      ) : (
        <>
          <p>{`Paid ${fmtUsd(receipt.paidUsd)} with ${receipt.sharesSold} ${receipt.stockName} shares`}</p>
          <p>{receipt.merchantName}</p>
          <p>{fmtDateTime(receipt.createdAt)}</p>
          <p>{`Delivered: ${receipt.itemTitle}`}</p>
          <ReceiptLinks receipt={receipt} />
        </>
      )}
    </section>
  );
}
