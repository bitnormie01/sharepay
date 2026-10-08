import { protectionLinks, type RwaApi, type StatusInfo, type UnderlyingMarket, type UnderlyingProfile } from "@sharepay/core/binance/rwa";
import type { ReportIssuer, ResearchReportDto } from "@sharepay/core/dto";
import { STOCKS, sameAddress } from "@sharepay/core/tokens";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLATFORM_NAMES: Record<string, string> = { bstock: "bStocks", ondo: "Ondo" };
const OPEN_STATUSES = new Set(["premarket", "regular", "postmarket", "overnight"]);

export function formatUtcShort(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]} ${hh}:${mm} UTC`;
}

function statusOf(status: StatusInfo | null | undefined): { open: boolean; label: string; nextOpenTime: string | null } {
  if (!status) return { open: false, label: "Status unavailable", nextOpenTime: null };
  const open = status.openState === true;
  const next = typeof status.nextOpenTime === "number" && status.nextOpenTime > 0 ? status.nextOpenTime : null;
  if (open) {
    const session = status.marketStatus && OPEN_STATUSES.has(status.marketStatus) ? status.marketStatus : status.marketStatus ?? "open";
    return { open: true, label: `Open (${session})`, nextOpenTime: null };
  }
  const why = status.reasonMsg ?? status.reasonCode ?? status.marketStatus ?? "closed";
  return {
    open: false,
    label: `Closed (${why})${next ? ` · reopens ${formatUtcShort(next)}` : ""}`,
    nextOpenTime: next ? new Date(next).toISOString() : null,
  };
}

function compact(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(2);
}

function row(label: string, value: string | null | undefined): Array<{ label: string; value: string }> {
  return value === null || value === undefined || value === "" ? [] : [{ label, value }];
}

async function safe<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

export async function buildResearchReport(deps: { rwa: RwaApi; now: () => Date }, symbol: string): Promise<ResearchReportDto> {
  const ticker = symbol.toUpperCase();
  const results = (await safe(() => deps.rwa.search(ticker))) ?? [];
  const group = results.find((r) => r.ticker.toUpperCase() === ticker);
  let assets: Array<{ platformId: string; tokenSymbol: string; tokenAddress: string }> = (group?.assets ?? [])
    .filter((a) => (a.binanceChainId === "56" || a.binanceChainId === null) && (a.platformId === "bstock" || a.platformId === "ondo"))
    .map((a) => ({ platformId: a.platformId, tokenSymbol: a.tokenSymbol, tokenAddress: a.tokenContractAddress.toLowerCase() }));
  if (assets.length === 0) {
    assets = STOCKS.filter((s) => s.underlyingTicker === ticker).map((s) => ({ platformId: s.platform, tokenSymbol: s.symbol, tokenAddress: s.address }));
  }
  if (assets.length === 0) throw new Error(`unknown symbol ${ticker}`);

  const profiles: Array<UnderlyingProfile | null> = [];
  const markets: Array<UnderlyingMarket | null> = [];
  for (const asset of assets) {
    profiles.push(await safe(() => deps.rwa.profile(asset.tokenAddress)));
    markets.push(await safe(() => deps.rwa.market(asset.tokenAddress)));
  }
  const prices = (await safe(() => deps.rwa.prices(assets.map((a) => a.tokenAddress)))) ?? [];

  const issuers: ReportIssuer[] = assets.map((asset, index) => {
    const profile = profiles[index] ?? null;
    const market = markets[index] ?? null;
    const price = prices.find((p) => sameAddress(p.tokenContractAddress, asset.tokenAddress))?.tokenPrice ?? null;
    const ratio = profile?.tokenToShareRatio ?? null;
    const implied = price !== null && ratio !== null && Number(ratio) > 0 ? (Number(price) / Number(ratio)).toFixed(2) : null;
    return {
      platform: PLATFORM_NAMES[asset.platformId] ?? asset.platformId,
      tokenSymbol: asset.tokenSymbol,
      tokenAddress: asset.tokenAddress,
      tokenPriceUsd: price,
      sharesPerToken: ratio,
      impliedSharePriceUsd: implied,
      status: statusOf(market?.statusInfo).label,
      attestations: protectionLinks(profile?.protections),
    };
  });

  const companyInfo = profiles.find((p) => p?.companyInfo)?.companyInfo ?? null;
  const companyName = group?.companyName ?? profiles.find((p) => p?.underlyingFullName)?.underlyingFullName ?? ticker;
  const marketData = markets.find((m) => m?.marketData)?.marketData ?? null;
  const status = statusOf(markets.find((m) => m?.statusInfo)?.statusInfo);

  const company = [
    ...row("CEO", companyInfo?.ceo),
    ...row("Website", companyInfo?.website),
    ...row("Industry", companyInfo?.industry),
    ...row("Themes", companyInfo?.conceptsEn && companyInfo.conceptsEn.length > 0 ? companyInfo.conceptsEn.join(", ") : null),
    ...row("About", companyInfo?.descriptionEn),
  ];
  const range = marketData?.low52W && marketData?.high52W ? `${marketData.low52W} – ${marketData.high52W}` : null;
  const market = [
    ...row("Reference price (USD)", marketData?.referencePrice),
    ...row("52-week range (USD)", range),
    ...row("Market cap (USD)", compact(marketData?.marketCap)),
    ...row("P/E (TTM)", marketData?.peRatioTTM),
    ...row("P/B", marketData?.pbRatio),
    ...row("Dividend yield (%)", marketData?.dividendYield),
    ...row("24h volume (shares)", compact(marketData?.volumeShares24H)),
  ];

  const implied = issuers
    .map((i) => ({ issuer: i, value: i.impliedSharePriceUsd === null ? NaN : Number(i.impliedSharePriceUsd) }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0);
  let crossIssuerSpreadBps: string | null = null;
  let cheapest: ReportIssuer | null = null;
  if (implied.length > 0) {
    const sorted = [...implied].sort((a, b) => a.value - b.value);
    cheapest = sorted[0]?.issuer ?? null;
    if (sorted.length >= 2) {
      const low = Number(issuers.find((i) => i === sorted[0]?.issuer)?.tokenPriceUsd) / Number(sorted[0]?.issuer.sharesPerToken);
      const high = Number(sorted[sorted.length - 1]?.issuer.tokenPriceUsd) / Number(sorted[sorted.length - 1]?.issuer.sharesPerToken);
      crossIssuerSpreadBps = (((high - low) / low) * 10000).toFixed(1);
    }
  }

  const generatedAt = deps.now().toISOString();
  const summary = [
    `${companyName} (${ticker})${companyInfo?.industry ? `: ${companyInfo.industry}` : ""}.`,
    `Underlying market: ${status.label}.`,
    `Tokenized on BSC by ${issuers.length} issuer${issuers.length === 1 ? "" : "s"}: ${issuers.map((i) => `${i.tokenSymbol} (${i.platform})`).join(", ")}.`,
  ];
  if (cheapest) {
    summary.push(
      `Lowest on-chain implied share price: ${cheapest.tokenSymbol} at $${cheapest.impliedSharePriceUsd}${crossIssuerSpreadBps !== null ? `; cross-issuer spread ${crossIssuerSpreadBps} bps` : ""}.`,
    );
  }
  if (marketData?.referencePrice) {
    summary.push(
      `Reference price $${marketData.referencePrice}${marketData.low52W && marketData.high52W ? `; 52-week range $${marketData.low52W}–$${marketData.high52W}` : ""}.`,
    );
  }
  const disclaimer = `Generated deterministically from Binance Web3 RWA Data API responses at ${generatedAt}. On-chain implied per-share prices are derived from on-chain token prices, not exchange quotes. Not investment advice.`;
  const sources = [
    "GET /api/v1/dex/market/rwa/search",
    "GET /api/v1/dex/market/rwa/underlying-profile",
    "GET /api/v1/dex/market/rwa/underlying-market",
    "GET /api/v1/dex/market/rwa/price",
  ];
  const base = { symbol: ticker, companyName, generatedAt, summary, company, market, status, issuers, crossIssuerSpreadBps, disclaimer, sources };
  return { ...base, markdown: renderReportMarkdown(base) };
}

export function renderReportMarkdown(report: Omit<ResearchReportDto, "markdown">): string {
  const lines: string[] = [];
  lines.push(`# ${report.companyName} (${report.symbol}): research report`, "");
  lines.push(`_Generated ${report.generatedAt}, deterministically, from the Binance Web3 RWA Data API._`, "");
  lines.push("## Summary", "", ...report.summary.map((s) => `- ${s}`), "");
  if (report.company.length > 0) {
    lines.push("## Company", "", "| Field | Value |", "|---|---|", ...report.company.map((r) => `| ${r.label} | ${r.value} |`), "");
  }
  if (report.market.length > 0) {
    lines.push("## Market data", "", "| Metric | Value |", "|---|---|", ...report.market.map((r) => `| ${r.label} | ${r.value} |`), "");
  }
  lines.push(
    "## Tokenized versions on BSC",
    "",
    "| Token | Issuer | On-chain token price (USD) | Shares per token | On-chain implied share price (USD) | Market status |",
    "|---|---|---|---|---|---|",
    ...report.issuers.map(
      (i) => `| ${i.tokenSymbol} | ${i.platform} | ${i.tokenPriceUsd ?? "n/a"} | ${i.sharesPerToken ?? "n/a"} | ${i.impliedSharePriceUsd ?? "n/a"} | ${i.status} |`,
    ),
    "",
  );
  if (report.crossIssuerSpreadBps !== null) {
    lines.push(`Cross-issuer spread: ${report.crossIssuerSpreadBps} bps (on-chain implied prices; not an exchange quote).`, "");
  }
  const attestations = report.issuers.flatMap((i) => i.attestations.map((a) => `- ${i.tokenSymbol}: [${a.name}](${a.url})`));
  if (attestations.length > 0) lines.push("## Attestations", "", ...attestations, "");
  lines.push("## Sources", "", ...report.sources.map((s) => `- ${s}`), "", `> ${report.disclaimer}`, "");
  return lines.join("\n");
}

export function createReportCache(
  build: (symbol: string) => Promise<ResearchReportDto>,
  ttlMs: number,
  nowMs: () => number,
): (symbol: string) => Promise<ResearchReportDto> {
  const entries = new Map<string, { at: number; value: Promise<ResearchReportDto> }>();
  return (symbol: string) => {
    const key = symbol.toUpperCase();
    const current = nowMs();
    const entry = entries.get(key);
    if (entry && current - entry.at < ttlMs) return entry.value;
    const value = build(key);
    entries.set(key, { at: current, value });
    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });
    return value;
  };
}
