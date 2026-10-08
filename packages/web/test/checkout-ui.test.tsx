// @vitest-environment jsdom
import type { CheckoutState, CheckoutStep, PickerOption, PickerResponse, Receipt, ResearchReportDto, StepId } from "@sharepay/core/dto";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliverableView } from "../src/components/DeliverableView";
import { Picker } from "../src/components/Picker";
import { Progress } from "../src/components/Progress";
import { ReceiptCard } from "../src/components/ReceiptCard";

afterEach(() => {
  cleanup();
});

const STEP_IDS: StepId[] = ["challenge", "quote", "simulate", "sell", "authorize", "settle", "deliver", "reinvest"];

const TITLES: Record<StepId, string> = {
  challenge: "Price checked",
  quote: "Shares priced",
  simulate: "Sale checked",
  sell: "Shares sold",
  authorize: "Payment approved",
  settle: "Merchant paid",
  deliver: "Report delivered",
  reinvest: "Merchant reinvested in S&P 500 shares",
};

function step(id: StepId, overrides: Partial<CheckoutStep> = {}): CheckoutStep {
  return {
    id,
    title: TITLES[id],
    technicalTitle: id === "authorize" ? "EIP-3009 authorization signed" : TITLES[id],
    status: "done",
    summary: "Finished",
    detail:
      id === "authorize"
        ? {
            asset: "USDT",
            unit: "U",
            fee: "gas",
            method: "EIP-3009 transferWithAuthorization",
          }
        : {},
    links: id === "authorize" ? [{ label: "Explorer", href: "https://bscscan.com/tx/0x1" }] : [],
    updatedAt: "2026-10-08T14:03:00.000Z",
    ...overrides,
  };
}

function checkout(overrides: Partial<CheckoutState> = {}): CheckoutState {
  return {
    id: "chk_1",
    itemId: "sharepay-nvda-report",
    mode: "live",
    tokenAddress: "0xnvda",
    status: "succeeded",
    steps: STEP_IDS.map((id) => step(id)),
    receipt: null,
    deliverable: null,
    error: null,
    etaSec: null,
    jobStartedAt: null,
    lastPolledAt: null,
    startedAt: "2026-10-08T14:00:00.000Z",
    finishedAt: "2026-10-08T14:03:00.000Z",
    ...overrides,
  };
}

function option(overrides: Partial<PickerOption> = {}): PickerOption {
  return {
    tokenAddress: "0xnvda",
    symbol: "NVDA",
    name: "NVIDIA",
    platform: "bstock",
    sharesHeld: "2",
    valueUsd: "200",
    payable: true,
    rank: 1,
    badges: [{ tone: "amber", text: "Best price" }],
    reason: null,
    plan: {
      sellTokens: "0.01",
      sellShares: "0.10",
      expectedOut: "0.05",
      priceImpactPercent: "0.1",
      legs: 1,
    },
    ...overrides,
  };
}

function picker(options: PickerOption[]): PickerResponse {
  return { itemId: "sharepay-nvda-report", priceUsd: "0.05", options };
}

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: "r1",
    itemId: "sharepay-nvda-report",
    itemTitle: "NVDA research report",
    merchantName: "SharePay Research",
    paidUsd: "0.05",
    paidAmount: "9.999",
    paidAsset: "USDT",
    stockSymbol: "NVDA",
    stockName: "NVIDIA",
    sharesSold: "0.10",
    tokensSold: "0.00123",
    swapTxHashes: ["0xaaa", "0xbbb"],
    settlementTxHash: "0xccc",
    reinvestTxHash: "0xddd",
    createdAt: "2026-10-08T14:03:00.000Z",
    wallet: "api-signer",
    ...overrides,
  };
}

describe("Picker", () => {
  it("preselects the rank 1 payable option and pays with the mode-specific label", async () => {
    const user = userEvent.setup();
    const onPay = vi.fn();
    const nvda = option();
    const apple = option({
      tokenAddress: "0xaapl",
      symbol: "AAPL",
      name: "Apple",
      sharesHeld: "0.1",
      valueUsd: "0.01",
      payable: false,
      rank: null,
      badges: [],
      reason: { code: "too_small", message: "Not enough value" },
      plan: null,
    });
    const { rerender } = render(<Picker response={picker([apple, nvda])} mode="simulate" onPay={onPay} busy={false} />);
    expect(screen.getByRole("radiogroup", { name: "Pay with" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "NVIDIA · 2 shares (~$200.00)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Apple · 0.1 shares (~$0.01)" })).toBeDisabled();
    expect(screen.getByText("Not enough value")).toBeInTheDocument();
    expect(screen.getByText("Best price")).toHaveClass("badge", "amber");
    const cta = screen.getByRole("button", { name: "Simulate paying $0.05 with ≈0.10 NVIDIA shares" });
    await user.click(cta);
    expect(onPay).toHaveBeenCalledWith(expect.objectContaining({ tokenAddress: "0xnvda" }));

    rerender(<Picker response={picker([apple, nvda])} mode="live" onPay={onPay} busy />);
    expect(screen.getByRole("button", { name: "Pay $0.05 with ≈0.10 NVIDIA shares" })).toBeDisabled();

    rerender(<Picker response={picker([apple])} mode="simulate" onPay={onPay} busy={false} />);
    expect(screen.getByText("None of your stocks can pay for this right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("keeps settlement jargon out of the collapsed list and shows it after expand", async () => {
    const user = userEvent.setup();
    const { container } = render(<Progress state={checkout()} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bUSDT\b/);
    expect(text).not.toMatch(/\bgas\b/i);
    expect(text).not.toMatch(/EIP-3009/);
    expect(text).not.toMatch(/\bU\b/);
    expect(screen.getAllByRole("img", { name: "done" })).toHaveLength(8);

    const row = screen.getByText("Payment approved").closest("li");
    if (!row) throw new Error("missing step");
    const toggle = within(row).getByRole("button", { name: "Details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(row).getByText("EIP-3009 transferWithAuthorization")).toBeInTheDocument();
    expect(within(row).getByText("USDT")).toBeInTheDocument();
    expect(within(row).getByText("gas")).toBeInTheDocument();
    expect(within(row).getByText("U")).toBeInTheDocument();
    const link = within(row).getByRole("link", { name: "Explorer" });
    expect(link).toHaveAttribute("href", "https://bscscan.com/tx/0x1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows delivery progress and a failed alert", () => {
    const { rerender } = render(
      <Progress
        state={checkout({
          status: "awaiting_delivery",
          etaSec: 90,
          jobStartedAt: "2026-10-08T14:03:05.000Z",
          lastPolledAt: "2026-10-08T14:04:06.000Z",
        })}
      />,
    );
    expect(screen.getByText("Report generating — about 2 min left")).toBeInTheDocument();
    expect(screen.getByText("Started 14:03:05 UTC · last checked 14:04:06 UTC")).toBeInTheDocument();

    rerender(<Progress state={checkout({ status: "awaiting_delivery", etaSec: null })} />);
    expect(screen.getByText("Report generating")).toBeInTheDocument();

    rerender(
      <Progress
        state={checkout({
          status: "failed",
          error: { code: "picker_failed", message: "The merchant rejected the payment." },
        })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The merchant rejected the payment.");
    expect(within(alert).getByText("picker_failed")).toBeInTheDocument();
  });
});

describe("ReceiptCard", () => {
  it("shows the paid line and tx links without asset or gas fields", () => {
    const paid = receipt();
    render(<ReceiptCard receipt={paid} />);
    expect(screen.getByRole("heading", { name: "Receipt" })).toBeInTheDocument();
    expect(screen.getByText("Paid $0.05 with 0.10 NVIDIA shares")).toBeInTheDocument();
    expect(screen.getByText("SharePay Research")).toBeInTheDocument();
    expect(screen.getByText("Oct 8, 14:03 UTC")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sale tx 1" })).toHaveAttribute("href", "https://bscscan.com/tx/0xaaa");
    expect(screen.getByRole("link", { name: "Sale tx 2" })).toHaveAttribute("href", "https://bscscan.com/tx/0xbbb");
    expect(screen.getByRole("link", { name: "Settlement tx" })).toHaveAttribute("href", "https://bscscan.com/tx/0xccc");
    expect(screen.getByRole("link", { name: "Reinvest tx" })).toHaveAttribute("href", "https://bscscan.com/tx/0xddd");
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.queryByText("USDT")).not.toBeInTheDocument();
    expect(screen.queryByText(paid.paidAmount)).not.toBeInTheDocument();
    expect(screen.queryByText(paid.tokensSold)).not.toBeInTheDocument();
  });
});

describe("DeliverableView", () => {
  it("renders a research report, markdown tables, and a json dossier", async () => {
    const user = userEvent.setup();
    const report: ResearchReportDto = {
      symbol: "NVDA",
      companyName: "NVIDIA Corporation",
      generatedAt: "2026-10-08T14:03:00.000Z",
      summary: ["Demand is strong."],
      company: [{ label: "Sector", value: "Technology" }],
      market: [{ label: "Session", value: "Regular" }],
      status: { open: true, label: "Market open", nextOpenTime: null },
      issuers: [
        {
          platform: "bstock",
          tokenSymbol: "NVDA",
          tokenAddress: "0xnvda",
          tokenPriceUsd: "105.00",
          sharesPerToken: "1",
          impliedSharePriceUsd: "105.00",
          status: "active",
          attestations: [{ name: "Proof", url: "https://example.com/proof" }],
        },
      ],
      crossIssuerSpreadBps: "12",
      disclaimer: "Not investment advice.",
      sources: ["https://example.com/source"],
      markdown: "# NVDA",
    };
    const { rerender } = render(<DeliverableView deliverable={{ kind: "report", report }} />);
    expect(screen.getByRole("heading", { name: "NVDA research report — NVIDIA Corporation" })).toBeInTheDocument();
    expect(screen.getByText("Demand is strong.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Company" })).toHaveTextContent("Technology");
    expect(screen.getByRole("table", { name: "Market" })).toHaveTextContent("Regular");
    expect(screen.getByText("Market open")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Issuers" })).toHaveTextContent("bstock");
    const proof = screen.getByRole("link", { name: "Proof" });
    expect(proof).toHaveAttribute("href", "https://example.com/proof");
    expect(proof).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Cross-issuer spread: 12 bps")).toBeInTheDocument();
    expect(screen.getByText("Not investment advice.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.com/source" })).toHaveAttribute("target", "_blank");

    rerender(
      <DeliverableView
        deliverable={{
          kind: "markdown",
          title: "Notes",
          markdown: "| Col | Val |\n| --- | --- |\n| A | B |",
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();

    const { container } = render(
      <DeliverableView deliverable={{ kind: "json", title: "Raw dossier", data: { hello: "world" } }} />,
    );
    expect(screen.getByRole("heading", { name: "Raw dossier" })).toBeInTheDocument();
    await user.click(screen.getByText("Show the full dossier"));
    expect(container.querySelector("pre")?.textContent).toContain('"hello": "world"');
  });
});
