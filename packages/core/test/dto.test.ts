import { describe, expect, it } from "vitest";
import {
  STEP_DEFINITIONS,
  bscscanTx,
  initialSteps,
  type CheckoutState,
} from "../src/dto.js";

describe("dto", () => {
  it("defines the eight checkout steps in pipeline order", () => {
    expect(STEP_DEFINITIONS.map((s) => s.id)).toEqual([
      "challenge",
      "quote",
      "simulate",
      "sell",
      "authorize",
      "settle",
      "deliver",
      "reinvest",
    ]);
    expect(STEP_DEFINITIONS[0]?.title).toBe("Price checked");
    expect(STEP_DEFINITIONS[7]?.technicalTitle).toBe("Merchant reinvested into SPYB (tx)");
  });

  it("builds pending initial steps stamped with the given time", () => {
    const steps = initialSteps("2026-10-07T00:00:00.000Z");
    expect(steps).toHaveLength(8);
    expect(steps.every((s) => s.status === "pending")).toBe(true);
    expect(steps[3]).toMatchObject({
      id: "sell",
      title: "Shares sold",
      summary: "",
      detail: {},
      links: [],
      updatedAt: "2026-10-07T00:00:00.000Z",
    });
  });

  it("builds BscScan transaction links", () => {
    expect(bscscanTx("0xabc")).toBe("https://bscscan.com/tx/0xabc");
  });

  it("accepts a complete CheckoutState literal", () => {
    const state: CheckoutState = {
      id: "c1",
      itemId: "sharepay-nvda-report",
      mode: "simulate",
      tokenAddress: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
      status: "running",
      steps: initialSteps("2026-10-07T00:00:00.000Z"),
      receipt: null,
      deliverable: { kind: "markdown", title: "t", markdown: "# hi" },
      error: null,
      etaSec: null,
      jobStartedAt: null,
      lastPolledAt: null,
      startedAt: "2026-10-07T00:00:00.000Z",
      finishedAt: null,
    };
    expect(state.steps).toHaveLength(8);
  });
});
