import { describe, expect, it } from "vitest";
import { classifyStatus, formatUtcShort } from "../src/status.js";

const MON = Date.UTC(2026, 9, 12, 13, 30);

describe("classifyStatus", () => {
  it.each([
    [null, { cls: "hard", code: "status_unavailable", message: "Market status unavailable" }],
    [{ openState: true, marketStatus: "regular", reasonCode: "TRADING" }, { cls: "open", code: "open", message: "Open (regular)" }],
    [{ openState: true, marketStatus: "premarket", reasonCode: null }, { cls: "open", code: "open", message: "Open (premarket)" }],
    [{ openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: MON }, { cls: "soft", code: "closed", message: "Market closed (Weekend or Holiday) · reopens Mon 13:30 UTC" }],
    [{ openState: false, marketStatus: "closed", reasonCode: null }, { cls: "soft", code: "closed", message: "Market closed (Weekend or Holiday)" }],
    [{ openState: false, reasonCode: "ASSET_LIMITED", reasonMsg: "earnings" }, { cls: "soft", code: "limited", message: "Earnings window: limited trading" }],
    [{ openState: true, marketStatus: "offhours", reasonCode: "TRADING" }, { cls: "soft", code: "off_hours", message: "Off-hours session" }],
    [{ openState: false, marketStatus: "offhours", reasonCode: null }, { cls: "hard", code: "unknown_status", message: "Unknown market status: offhours" }],
    [{ openState: false, reasonCode: "ASSET_PAUSED", reasonMsg: "stock_split" }, { cls: "hard", code: "asset_paused", message: "Paused: stock split" }],
    [{ openState: false, reasonCode: "ASSET_PAUSED", reasonMsg: "cash_dividend" }, { cls: "hard", code: "asset_paused", message: "Paused: cash dividend" }],
    [{ openState: false, reasonCode: "ASSET_PAUSED", reasonMsg: "rights_issue" }, { cls: "hard", code: "asset_paused", message: "Paused: rights_issue" }],
    [{ openState: false, marketStatus: "pause", reasonCode: null }, { cls: "hard", code: "halted", message: "Trading halted" }],
    [{ openState: false, reasonCode: "MARKET_PAUSED" }, { cls: "hard", code: "halted", message: "Trading halted" }],
    [{ openState: false, reasonCode: "MARKET_MAINTENANCE" }, { cls: "hard", code: "maintenance", message: "Market maintenance" }],
    [{ openState: false, reasonCode: "UNSUPPORTED" }, { cls: "hard", code: "unsupported", message: "Not supported for trading" }],
    [{ openState: true, marketStatus: "regular", reasonCode: "SOMETHING_NEW" }, { cls: "hard", code: "unknown_status", message: "Unknown market status: SOMETHING_NEW" }],
  ])("classifies %j", (input, expected) => {
    expect(classifyStatus(input)).toMatchObject(expected);
  });

  it("carries the next open time for closed markets", () => {
    expect(classifyStatus({ openState: false, reasonCode: "MARKET_CLOSED", nextOpenTime: MON }).nextOpenTime).toBe(MON);
    expect(classifyStatus({ openState: true, marketStatus: "regular" }).nextOpenTime).toBeNull();
  });

  it("formats UTC times compactly", () => {
    expect(formatUtcShort(MON)).toBe("Mon 13:30 UTC");
  });
});
