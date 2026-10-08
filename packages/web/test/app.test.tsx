// @vitest-environment jsdom
import type {
  CatalogItem,
  CheckoutState,
  CheckoutStep,
  HealthResponse,
  LedgerResponse,
  MerchantActivity,
  PickerOption,
  PickerResponse,
  Receipt,
  StepId,
} from "@sharepay/core/dto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../src/api";
import { App } from "../src/App";
import { LedgerView } from "../src/components/LedgerView";
import { MerchantFeed } from "../src/components/MerchantFeed";
import { RecordedRun } from "../src/components/RecordedRun";
import type { FollowHandlers } from "../src/follow";

afterEach(() => {
  cleanup();
});

const health: HealthResponse = {
  ok: true,
  walletMode: "api-signer",
  buyerAddress: "0xabc123456789abcd",
  merchantUrl: "https://merchant.example",
  version: "0.1.0",
};

const catalogItem: CatalogItem = {
  id: "sharepay-nvda-report",
  title: "NVDA research report",
  merchantName: "SharePay Research",
  merchantUrl: "https://merchant.example",
  priceUsd: "0.05",
  deliveryHint: "About a minute",
  description: "A short brief on the company.",
  status: "ok",
  statusMessage: null,
};

const payOption: PickerOption = {
  tokenAddress: "0xnvda",
  symbol: "NVDA",
  name: "NVIDIA",
  platform: "bstock",
  sharesHeld: "2",
  valueUsd: "200",
  payable: true,
  rank: 1,
  badges: [],
  reason: null,
  plan: {
    sellTokens: "0.01",
    sellShares: "0.10",
    expectedOut: "0.05",
    priceImpactPercent: "0.2",
    legs: 1,
  },
};

const pickerResponse: PickerResponse = {
  itemId: "sharepay-nvda-report",
  priceUsd: "0.05",
  options: [payOption],
};

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
    swapTxHashes: ["0xaaa"],
    settlementTxHash: "0xbbb",
    reinvestTxHash: "0xccc",
    createdAt: "2026-10-08T14:03:00.000Z",
    wallet: "api-signer",
    ...overrides,
  };
}

const STEP_IDS: StepId[] = ["challenge", "quote", "simulate", "sell", "authorize", "settle", "deliver", "reinvest"];

function steps(): CheckoutStep[] {
  return STEP_IDS.map((id) => ({
    id,
    title: id === "sell" ? "Shares sold" : "Price checked",
    technicalTitle: "Hidden technical title",
    status: "done",
    summary: "Finished",
    detail: {},
    links: [],
    updatedAt: "2026-10-08T14:03:00.000Z",
  }));
}

function checkoutState(status: CheckoutState["status"]): CheckoutState {
  return {
    id: "chk_1",
    itemId: "sharepay-nvda-report",
    mode: "simulate",
    tokenAddress: "0xnvda",
    status,
    steps: steps(),
    receipt: status === "succeeded" ? receipt() : null,
    deliverable: status === "succeeded" ? { kind: "markdown", title: "Delivered note", markdown: "Hello report" } : null,
    error: null,
    etaSec: null,
    jobStartedAt: null,
    lastPolledAt: null,
    startedAt: "2026-10-08T14:00:00.000Z",
    finishedAt: status === "succeeded" ? "2026-10-08T14:03:00.000Z" : null,
  };
}

const ledger: LedgerResponse = {
  walletLabel: "Paper shares",
  holdings: [
    { symbol: "NVDA", name: "NVIDIA", tokenAddress: "0xnvda", shares: "2", valueUsd: "200" },
  ],
  receipts: [
    receipt({ id: "older", createdAt: "2026-10-07T10:00:00.000Z", itemTitle: "Older note" }),
    receipt(),
  ],
};

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
    data,
  };
}

function makeApi(overrides: Partial<Api> = {}): Api {
  return {
    health: vi.fn().mockResolvedValue(health),
    catalog: vi.fn().mockResolvedValue([catalogItem]),
    picker: vi.fn().mockResolvedValue(pickerResponse),
    unlock: vi.fn().mockResolvedValue({ liveAvailable: true, remainingCount: 2, remainingUsd: "8.00" }),
    budget: vi.fn().mockResolvedValue({ liveAvailable: true, remainingCount: 2, remainingUsd: "8.00" }),
    startCheckout: vi.fn().mockResolvedValue({ checkoutId: "chk_1" }),
    checkout: vi.fn().mockResolvedValue(null),
    ledger: vi.fn().mockResolvedValue(ledger),
    merchantActivity: vi.fn().mockResolvedValue([
      {
        id: "m1",
        kind: "settlement",
        at: "2026-10-08T14:03:00.000Z",
        summary: "Merchant settled a payment",
        amountUsd: "0.05",
        txHashes: ["0xsettle"],
        payer: null,
        triggeredBy: null,
        spyShares: null,
      } satisfies MerchantActivity,
    ]),
    ...overrides,
  };
}

async function chooseAndOpenPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Choose" }));
  expect(await screen.findByRole("radiogroup", { name: "Pay with" })).toBeInTheDocument();
}

describe("App", () => {
  it("boots, simulates a payment, and shows progress plus the recorded run", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const storage = memoryStorage();
    const followImpl = vi.fn((id: string, handlers: FollowHandlers) => {
      expect(id).toBe("chk_1");
      queueMicrotask(() => {
        handlers.onState(checkoutState("running"));
        handlers.onState(checkoutState("succeeded"));
      });
      return { close: vi.fn() };
    });
    render(<App api={api} followImpl={followImpl} storage={storage} />);
    expect(screen.getByText("Starting SharePay…")).toBeInTheDocument();
    await chooseAndOpenPicker(user);
    await user.click(screen.getByRole("button", { name: "Simulate paying $0.05 with ≈0.10 NVIDIA shares" }));
    expect(await screen.findByText("Shares sold")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Recorded live run" })).toBeInTheDocument();
    expect(screen.getByText("Delivered: NVDA research report")).toBeInTheDocument();
    expect(storage.data["sharepay.checkoutId"]).toBe("chk_1");
    expect(api.startCheckout).toHaveBeenCalledWith({
      itemId: "sharepay-nvda-report",
      tokenAddress: "0xnvda",
      mode: "simulate",
    });
    expect(followImpl).toHaveBeenCalledWith("chk_1", expect.any(Object), { api });
    expect(JSON.stringify(storage.data)).not.toContain("passcode");
  });

  it("sends the passcode only after live mode is unlocked", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const storage = memoryStorage();
    const followImpl = vi.fn(() => ({ close: vi.fn() }));
    render(<App api={api} followImpl={followImpl} storage={storage} />);
    await chooseAndOpenPicker(user);
    await user.click(screen.getByRole("button", { name: "Live" }));
    await user.type(screen.getByLabelText("Passcode"), "secret");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("2 live payments left today")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pay $0.05 with ≈0.10 NVIDIA shares" }));
    await waitFor(() => {
      expect(api.startCheckout).toHaveBeenCalledWith({
        itemId: "sharepay-nvda-report",
        tokenAddress: "0xnvda",
        mode: "live",
        passcode: "secret",
      });
    });
    expect(JSON.stringify(storage.data)).not.toContain("secret");
  });

  it("shows the restart message for a stale stored checkout and can start over", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    const storage = memoryStorage({ "sharepay.checkoutId": "old" });
    const followImpl = vi.fn(() => ({ close: vi.fn() }));
    render(<App api={api} followImpl={followImpl} storage={storage} />);
    expect(await screen.findByText("This checkout ended when the server restarted.")).toBeInTheDocument();
    expect(followImpl).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByRole("button", { name: "Choose" })).toBeInTheDocument();
    expect(screen.queryByText("This checkout ended when the server restarted.")).not.toBeInTheDocument();
    expect(storage.getItem("sharepay.checkoutId")).toBeNull();
  });

  it("shows the live_busy error copy", async () => {
    const user = userEvent.setup();
    const api = makeApi({
      startCheckout: vi.fn().mockRejectedValue(new ApiError(409, "live_busy")),
    });
    render(<App api={api} followImpl={vi.fn()} storage={memoryStorage()} />);
    await chooseAndOpenPicker(user);
    await user.click(screen.getByRole("button", { name: "Simulate paying $0.05 with ≈0.10 NVIDIA shares" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another live payment is running. Try again in a minute.");
  });

  it("opens the ledger and merchant feed", async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<App api={api} followImpl={vi.fn()} storage={memoryStorage()} />);
    await screen.findByRole("button", { name: "Choose" });
    await user.click(screen.getByRole("tab", { name: "Ledger" }));
    expect(await screen.findByRole("heading", { name: "Holdings" })).toBeInTheDocument();
    expect(screen.getByText("NVIDIA (NVDA) · 2 shares (~$200.00)")).toBeInTheDocument();
    expect(screen.getByText("Paper shares")).toBeInTheDocument();
    expect(await screen.findByText("Merchant settled a payment")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tx" })).toHaveAttribute("href", "https://bscscan.com/tx/0xsettle");
  });
});

describe("task D components", () => {
  it("lists receipts newest first and shows an empty state", () => {
    const { rerender } = render(<LedgerView ledger={ledger} />);
    const text = screen.getByRole("heading", { name: "Receipts" }).parentElement?.textContent ?? "";
    expect(text.indexOf("Oct 8, 14:03 UTC")).toBeLessThan(text.indexOf("Oct 7, 10:00 UTC"));
    for (const link of screen.getAllByRole("link", { name: "Sale tx" })) expect(link).toHaveAttribute("target", "_blank");
    rerender(<LedgerView ledger={{ ...ledger, receipts: [] }} />);
    expect(screen.getByText("No receipts yet.")).toBeInTheDocument();
  });

  it("sorts merchant activity and keeps the last list when a poll fails", async () => {
    const list: MerchantActivity[] = [
      {
        id: "old",
        kind: "sweep",
        at: "2026-10-08T10:00:00.000Z",
        summary: "Older sweep",
        amountUsd: null,
        txHashes: [],
        payer: null,
        triggeredBy: null,
        spyShares: null,
      },
      {
        id: "new",
        kind: "settlement",
        at: "2026-10-08T12:00:00.000Z",
        summary: "Newer settlement",
        amountUsd: null,
        txHashes: ["0x1", "0x2"],
        payer: null,
        triggeredBy: null,
        spyShares: null,
      },
    ];
    const activity = vi.fn().mockResolvedValueOnce(list).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(list);
    const { unmount } = render(<MerchantFeed api={{ merchantActivity: activity }} pollMs={20} />);
    expect(await screen.findByText("Newer settlement")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Newer settlement")).toBeLessThan(text.indexOf("Older sweep"));
    expect(screen.getByRole("link", { name: "Tx 1" })).toHaveAttribute("href", "https://bscscan.com/tx/0x1");
    await waitFor(() => expect(activity.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText("Newer settlement")).toBeInTheDocument();
    unmount();
    const callsAtUnmount = activity.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(activity.mock.calls.length).toBe(callsAtUnmount);
  });

  it("describes a recorded run or its empty state", () => {
    const { rerender } = render(<RecordedRun receipt={null} />);
    expect(screen.getByRole("region", { name: "Recorded live run" })).toBeInTheDocument();
    expect(screen.getByText("No recorded live run yet.")).toBeInTheDocument();
    rerender(<RecordedRun receipt={receipt()} />);
    expect(screen.getByText("Paid $0.05 with 0.10 NVIDIA shares")).toBeInTheDocument();
    expect(screen.getByText("Delivered: NVDA research report")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settlement tx" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});
