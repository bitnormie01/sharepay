// @vitest-environment jsdom
import type { BudgetResponse, CatalogItem, HealthResponse } from "@sharepay/core/dto";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api";
import { BootScreen } from "../src/components/BootScreen";
import { Catalog } from "../src/components/Catalog";
import { Header } from "../src/components/Header";
import { UnlockDialog } from "../src/components/UnlockDialog";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const health: HealthResponse = {
  ok: true,
  walletMode: "api-signer",
  buyerAddress: "0xabc",
  merchantUrl: "https://merchant.example",
  version: "0.1.0",
};

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "sharepay-nvda-report",
    title: "NVDA research report",
    merchantName: "SharePay Research",
    merchantUrl: "https://merchant.example",
    priceUsd: "0.05",
    deliveryHint: "About a minute",
    description: "A short brief on the company.",
    status: "ok",
    statusMessage: null,
    ...overrides,
  };
}

describe("Header", () => {
  it("shows the wallet chip, mode switch, and remaining live payments", async () => {
    const user = userEvent.setup();
    const onSimulate = vi.fn();
    const onRequestLive = vi.fn();
    const { rerender } = render(
      <Header health={health} mode="simulate" budget={null} onSimulate={onSimulate} onRequestLive={onRequestLive} />,
    );
    expect(screen.getByRole("heading", { name: "SharePay: pay with shares" })).toBeInTheDocument();
    expect(screen.getByText("Demo wallet · shares only")).toHaveAttribute("title", "0xabc");
    expect(screen.getByRole("button", { name: "Simulate" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/live payments left today/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Live" }));
    await user.click(screen.getByRole("button", { name: "Simulate" }));
    expect(onRequestLive).toHaveBeenCalledTimes(1);
    expect(onSimulate).toHaveBeenCalledTimes(1);

    const budget: BudgetResponse = { liveAvailable: true, remainingCount: 1, remainingUsd: "4.00" };
    rerender(
      <Header
        health={{ ...health, walletMode: "agentic-wallet" }}
        mode="live"
        budget={budget}
        onSimulate={onSimulate}
        onRequestLive={onRequestLive}
      />,
    );
    expect(screen.getByText("Agentic Wallet · shares only")).toHaveAttribute("title", "0xabc");
    expect(screen.getByText("1 live payment left today")).toBeInTheDocument();
    rerender(
      <Header
        health={health}
        mode="live"
        budget={{ ...budget, remainingCount: 2 }}
        onSimulate={onSimulate}
        onRequestLive={onRequestLive}
      />,
    );
    expect(screen.getByText("2 live payments left today")).toBeInTheDocument();
  });
});

describe("UnlockDialog", () => {
  it("unlocks with the passcode, shows error copy, and disables Unlock while pending", async () => {
    const user = userEvent.setup();
    const onUnlocked = vi.fn();
    const onCancel = vi.fn();
    const budget: BudgetResponse = { liveAvailable: true, remainingCount: 2, remainingUsd: "8" };
    const unlock = vi.fn().mockResolvedValue(budget);
    const { rerender } = render(<UnlockDialog api={{ unlock }} onUnlocked={onUnlocked} onCancel={onCancel} />);
    expect(screen.getByRole("dialog", { name: "Unlock live mode" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Passcode"), "secret");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(unlock).toHaveBeenCalledWith("secret");
    expect(onUnlocked).toHaveBeenCalledWith("secret", budget);

    unlock.mockRejectedValueOnce(new ApiError(403, "live_passcode_invalid"));
    rerender(<UnlockDialog api={{ unlock }} onUnlocked={onUnlocked} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong passcode.");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    let resolveUnlock: (value: BudgetResponse) => void = () => {};
    unlock.mockImplementation(
      () =>
        new Promise<BudgetResponse>((resolve) => {
          resolveUnlock = resolve;
        }),
    );
    rerender(<UnlockDialog api={{ unlock }} onUnlocked={onUnlocked} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
    await act(async () => {
      resolveUnlock(budget);
    });
    expect(onUnlocked).toHaveBeenCalledTimes(2);
  });
});

describe("Catalog", () => {
  it("renders each item and only enables Choose when the merchant is ready", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <Catalog
        onChoose={onChoose}
        items={[
          item({ title: "Ready report", priceUsd: "0.05" }),
          item({
            id: "bnb-stock-analyst-nvda",
            title: "Sleepy report",
            status: "waking",
            priceUsd: "0.10",
            statusMessage: "Waking up the merchant agent…",
          }),
          item({
            id: "cmc-nvda-dossier",
            title: "Down report",
            status: "unavailable",
            priceUsd: null,
            statusMessage: null,
          }),
        ]}
      />,
    );
    const ready = screen.getByRole("article", { name: "Ready report" });
    expect(within(ready).getByText("SharePay Research")).toBeInTheDocument();
    expect(within(ready).getByText("$0.05")).toBeInTheDocument();
    expect(within(ready).getByText("About a minute")).toBeInTheDocument();
    expect(within(ready).getByText("A short brief on the company.")).toBeInTheDocument();
    await user.click(within(ready).getByRole("button", { name: "Choose" }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ title: "Ready report" }));

    const sleepy = screen.getByRole("article", { name: "Sleepy report" });
    expect(within(sleepy).getAllByText("Waking up the merchant agent…")).toHaveLength(1);
    expect(within(sleepy).queryByRole("button", { name: "Choose" })).not.toBeInTheDocument();

    const down = screen.getByRole("article", { name: "Down report" });
    expect(within(down).getByText("Temporarily unavailable")).toBeInTheDocument();
    expect(within(down).getByText("…")).toBeInTheDocument();
  });
});

describe("BootScreen", () => {
  it("polls until health is ok and stops polling on unmount", async () => {
    vi.useFakeTimers();
    const onReady = vi.fn();
    const healthFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ ...health, ok: false })
      .mockResolvedValue(health);
    const view = render(<BootScreen api={{ health: healthFn }} onReady={onReady} pollMs={2000} />);
    expect(screen.getByText("Starting SharePay…")).toBeInTheDocument();
    expect(screen.getByText("The free host wakes up in about a minute.")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(healthFn).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(healthFn).toHaveBeenCalledTimes(2);
    expect(onReady).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onReady).toHaveBeenCalledWith(health);

    view.unmount();
    const calls = healthFn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(healthFn).toHaveBeenCalledTimes(calls);
  });
});
