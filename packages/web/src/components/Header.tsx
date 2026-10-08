import type { BudgetResponse, CheckoutMode, HealthResponse } from "@sharepay/core/dto";

export function Header({
  health,
  mode,
  budget,
  onSimulate,
  onRequestLive,
}: {
  health: HealthResponse;
  mode: CheckoutMode;
  budget: BudgetResponse | null;
  onSimulate: () => void;
  onRequestLive: () => void;
}) {
  const chip =
    health.walletMode === "agentic-wallet" ? "Agentic Wallet · shares only" : "Demo wallet · shares only";
  const paymentLabel =
    budget != null && budget.remainingCount === 1 ? "payment" : "payments";

  return (
    <header className="top">
      <h1>SharePay: pay with shares</h1>
      <p className="chip" title={health.buyerAddress}>
        {chip}
      </p>
      <div className="mode-switch">
        <button type="button" aria-pressed={mode === "simulate"} onClick={onSimulate}>
          Simulate
        </button>
        <button type="button" aria-pressed={mode === "live"} onClick={onRequestLive}>
          Live
        </button>
      </div>
      {mode === "live" && budget != null && (
        <p className="budget">{`${budget.remainingCount} live ${paymentLabel} left today`}</p>
      )}
    </header>
  );
}
