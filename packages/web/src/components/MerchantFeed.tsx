import type { MerchantActivity } from "@sharepay/core/dto";
import { useEffect, useState } from "react";
import type { Api } from "../api";
import { fmtDateTime } from "../format";

export function MerchantFeed({
  api,
  pollMs = 10000,
}: {
  api: Pick<Api, "merchantActivity">;
  pollMs?: number;
}) {
  const [items, setItems] = useState<MerchantActivity[] | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const next = await api.merchantActivity();
        if (!stopped && Array.isArray(next)) setItems(next);
      } catch {
        if (!stopped) setItems((current) => current ?? []);
      }
      if (stopped) return;
      timer = setTimeout(() => {
        void load();
      }, pollMs);
    };

    void load();

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [api, pollMs]);

  const sorted = [...(items ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <section className="merchant-feed">
      <h2>Merchant agent</h2>
      {items == null ? null : sorted.length === 0 ? (
        <p>No merchant activity yet.</p>
      ) : (
        <ul>
          {sorted.map((item) => (
            <li key={item.id}>
              <p>{item.summary}</p>
              <p>{fmtDateTime(item.at)}</p>
              <p className="tx-links">
                {item.txHashes.map((hash, index) => (
                  <a key={hash} href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noopener noreferrer">
                    {item.txHashes.length > 1 ? `Tx ${index + 1}` : "Tx"}
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
