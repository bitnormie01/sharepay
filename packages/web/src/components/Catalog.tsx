import type { CatalogItem } from "@sharepay/core/dto";
import { fmtUsd } from "../format";

export function Catalog({
  items,
  onChoose,
}: {
  items: CatalogItem[];
  onChoose: (item: CatalogItem) => void;
}) {
  return (
    <section className="catalog">
      {items.map((item) => (
        <article key={item.id} aria-label={item.title} className="card">
          <h2>{item.title}</h2>
          <p>{item.merchantName}</p>
          <p className="price">{fmtUsd(item.priceUsd)}</p>
          <p>{item.deliveryHint}</p>
          <p>{item.description}</p>
          {item.status === "ok" && (
            <button type="button" onClick={() => onChoose(item)}>
              Choose
            </button>
          )}
          {item.status !== "ok" && (
            <p className="status">
              {item.statusMessage ?? (item.status === "waking" ? "Waking up the merchant agent…" : "Temporarily unavailable")}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
