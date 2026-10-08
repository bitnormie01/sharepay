import type { CheckoutStatus, ItemId, Receipt } from "@sharepay/core/dto";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtUsd(value: string | null): string {
  if (value == null) return "…";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "…";
  return `$${amount.toFixed(2)}`;
}

function utcParts(iso: string): Date {
  return new Date(iso);
}

export function fmtTime(iso: string): string {
  const date = utcParts(iso);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss} UTC`;
}

export function fmtDateTime(iso: string): string {
  const date = utcParts(iso);
  const month = MONTHS[date.getUTCMonth()] ?? "Jan";
  const day = date.getUTCDate();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hh}:${mm} UTC`;
}

export function shortAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isTerminal(status: CheckoutStatus): boolean {
  return status === "succeeded" || status === "failed";
}

export function latestReceiptFor(receipts: Receipt[], itemId: ItemId): Receipt | null {
  let best: Receipt | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const receipt of receipts) {
    if (receipt.itemId !== itemId) continue;
    const time = Date.parse(receipt.createdAt);
    if (best == null || time > bestTime) {
      best = receipt;
      bestTime = time;
    }
  }
  return best;
}
