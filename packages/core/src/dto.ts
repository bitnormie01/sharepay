export type ItemId = "sharepay-nvda-report" | "bnb-stock-analyst-nvda" | "cmc-nvda-dossier";
export type StepId =
  | "challenge"
  | "quote"
  | "simulate"
  | "sell"
  | "authorize"
  | "settle"
  | "deliver"
  | "reinvest";
export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";
export type WalletMode = "api-signer" | "agentic-wallet";

export interface CheckoutStep {
  id: StepId;
  title: string;
  technicalTitle: string;
  status: StepStatus;
  summary: string;
  detail: Record<string, string>;
  links: Array<{ label: string; href: string }>;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  itemId: ItemId;
  itemTitle: string;
  merchantName: string;
  paidUsd: string;
  paidAmount: string;
  paidAsset: string;
  stockSymbol: string;
  stockName: string;
  sharesSold: string;
  tokensSold: string;
  swapTxHashes: string[];
  settlementTxHash: string | null;
  reinvestTxHash: string | null;
  createdAt: string;
  wallet: WalletMode;
}

export interface ReportIssuer {
  platform: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenPriceUsd: string | null;
  sharesPerToken: string | null;
  impliedSharePriceUsd: string | null;
  status: string;
  attestations: Array<{ name: string; url: string }>;
}

export interface ResearchReportDto {
  symbol: string;
  companyName: string;
  generatedAt: string;
  summary: string[];
  company: Array<{ label: string; value: string }>;
  market: Array<{ label: string; value: string }>;
  status: { open: boolean; label: string; nextOpenTime: string | null };
  issuers: ReportIssuer[];
  crossIssuerSpreadBps: string | null;
  disclaimer: string;
  sources: string[];
  markdown: string;
}

export type Deliverable =
  | { kind: "report"; report: ResearchReportDto }
  | { kind: "markdown"; title: string; markdown: string }
  | { kind: "json"; title: string; data: unknown };

export type CheckoutStatus = "running" | "awaiting_delivery" | "succeeded" | "failed";
export type CheckoutMode = "simulate" | "live";

export interface CheckoutState {
  id: string;
  itemId: ItemId;
  mode: CheckoutMode;
  tokenAddress: string;
  status: CheckoutStatus;
  steps: CheckoutStep[];
  receipt: Receipt | null;
  deliverable: Deliverable | null;
  error: { code: string; message: string } | null;
  etaSec: number | null;
  jobStartedAt: string | null;
  lastPolledAt: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface CatalogItem {
  id: ItemId;
  title: string;
  merchantName: string;
  merchantUrl: string;
  priceUsd: string | null;
  deliveryHint: string;
  description: string;
  status: "ok" | "waking" | "unavailable";
  statusMessage: string | null;
}

export interface Badge {
  tone: "amber";
  text: string;
}

export interface SalePlanDto {
  sellTokens: string;
  sellShares: string;
  expectedOut: string;
  priceImpactPercent: string | null;
  legs: 1 | 2;
}

export interface PickerOption {
  tokenAddress: string;
  symbol: string;
  name: string;
  platform: "bstock" | "ondo";
  sharesHeld: string;
  valueUsd: string;
  payable: boolean;
  rank: number | null;
  badges: Badge[];
  reason: { code: string; message: string } | null;
  plan: SalePlanDto | null;
}

export interface PickerResponse {
  itemId: ItemId;
  priceUsd: string;
  options: PickerOption[];
}

export interface LedgerHolding {
  symbol: string;
  name: string;
  tokenAddress: string;
  shares: string;
  valueUsd: string;
}

export interface LedgerResponse {
  walletLabel: string;
  holdings: LedgerHolding[];
  receipts: Receipt[];
}

export type MerchantActivityKind = "settlement" | "sweep" | "sweep_skipped";

export interface MerchantActivity {
  id: string;
  kind: MerchantActivityKind;
  at: string;
  summary: string;
  amountUsd: string | null;
  txHashes: string[];
  payer: string | null;
  triggeredBy: string | null;
  spyShares: string | null;
}

export interface BudgetResponse {
  liveAvailable: boolean;
  remainingCount: number;
  remainingUsd: string;
}

export interface HealthResponse {
  ok: boolean;
  walletMode: WalletMode;
  buyerAddress: string;
  merchantUrl: string;
  version: string;
}

export const STEP_DEFINITIONS: ReadonlyArray<{ id: StepId; title: string; technicalTitle: string }> = [
  { id: "challenge", title: "Price checked", technicalTitle: "HTTP 402 received" },
  { id: "quote", title: "Shares priced", technicalTitle: "Shares quoted" },
  { id: "simulate", title: "Sale checked", technicalTitle: "Swap simulated" },
  { id: "sell", title: "Shares sold", technicalTitle: "Shares sold (tx)" },
  { id: "authorize", title: "Payment approved", technicalTitle: "EIP-3009 authorization signed" },
  { id: "settle", title: "Merchant paid", technicalTitle: "Merchant settled (tx)" },
  { id: "deliver", title: "Report delivered", technicalTitle: "200 delivered" },
  {
    id: "reinvest",
    title: "Merchant reinvested in S&P 500 shares",
    technicalTitle: "Merchant reinvested into SPYB (tx)",
  },
];

export function initialSteps(now: string): CheckoutStep[] {
  return STEP_DEFINITIONS.map((definition) => ({
    id: definition.id,
    title: definition.title,
    technicalTitle: definition.technicalTitle,
    status: "pending",
    summary: "",
    detail: {},
    links: [],
    updatedAt: now,
  }));
}

export function bscscanTx(hash: string): string {
  return `https://bscscan.com/tx/${hash}`;
}
