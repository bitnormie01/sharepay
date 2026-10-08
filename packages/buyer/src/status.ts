import type { StatusInfo } from "@sharepay/core/binance/rwa";

export type StatusClass = "open" | "soft" | "hard";

export interface StatusVerdict {
  cls: StatusClass;
  code: string;
  message: string;
  nextOpenTime: number | null;
}

const KNOWN_MARKET_STATUSES = new Set(["premarket", "regular", "postmarket", "overnight", "closed", "pause"]);
const KNOWN_REASON_CODES = new Set(["TRADING", "MARKET_CLOSED", "MARKET_PAUSED", "MARKET_MAINTENANCE", "ASSET_PAUSED", "ASSET_LIMITED", "UNSUPPORTED"]);
const PAUSE_REASONS: Record<string, string> = {
  cash_dividend: "Paused: cash dividend",
  stock_dividend: "Paused: stock dividend",
  stock_split: "Paused: stock split",
  merger: "Paused: merger",
  acquisition: "Paused: acquisition",
  spinoff: "Paused: spin-off",
  maintenance: "Paused: maintenance",
  "corporate action": "Paused: corporate action",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatUtcShort(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]} ${hh}:${mm} UTC`;
}

function verdict(cls: StatusClass, code: string, message: string, nextOpenTime: number | null = null): StatusVerdict {
  return { cls, code, message, nextOpenTime };
}

export function classifyStatus(status: StatusInfo | null | undefined): StatusVerdict {
  if (!status) return verdict("hard", "status_unavailable", "Market status unavailable");
  const reasonCode = status.reasonCode ?? null;
  const marketStatus = status.marketStatus ?? null;
  const open = status.openState === true;
  const next = typeof status.nextOpenTime === "number" && status.nextOpenTime > 0 ? status.nextOpenTime : null;
  const reopens = next ? ` · reopens ${formatUtcShort(next)}` : "";

  if (reasonCode !== null && !KNOWN_REASON_CODES.has(reasonCode)) {
    return verdict("hard", "unknown_status", `Unknown market status: ${reasonCode}`);
  }
  if (reasonCode === "ASSET_PAUSED") {
    const why = status.reasonMsg ?? "corporate action";
    return verdict("hard", "asset_paused", PAUSE_REASONS[why] ?? `Paused: ${why}`);
  }
  if (reasonCode === "MARKET_PAUSED" || marketStatus === "pause") return verdict("hard", "halted", "Trading halted");
  if (reasonCode === "MARKET_MAINTENANCE") return verdict("hard", "maintenance", "Market maintenance");
  if (reasonCode === "UNSUPPORTED") return verdict("hard", "unsupported", "Not supported for trading");
  if (reasonCode === "ASSET_LIMITED") return verdict("soft", "limited", "Earnings window: limited trading", next);
  if (reasonCode === "MARKET_CLOSED" || marketStatus === "closed") {
    return verdict("soft", "closed", `Market closed (${status.reasonMsg ?? "Weekend or Holiday"})${reopens}`, next);
  }
  if (marketStatus !== null && !KNOWN_MARKET_STATUSES.has(marketStatus)) {
    if (open && (reasonCode === "TRADING" || reasonCode === null)) return verdict("soft", "off_hours", "Off-hours session", next);
    return verdict("hard", "unknown_status", `Unknown market status: ${marketStatus}`);
  }
  if (open) return verdict("open", "open", `Open (${marketStatus ?? "trading"})`);
  return verdict("soft", "closed", `Market closed${reopens}`, next);
}
