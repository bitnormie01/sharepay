const COPY: Record<string, string> = {
  live_passcode_invalid: "Wrong passcode.",
  live_locked_out: "Too many attempts. Try again later.",
  live_disabled: "Live mode is off on this server.",
  live_cap_reached: "Today's live budget is used up.",
  live_busy: "Another live payment is running. Try again in a minute.",
  too_many_checkouts: "The checkout is busy. Try again shortly.",
  item_unavailable: "This item is unavailable right now.",
  picker_failed: "Couldn't check your shares. Try again.",
  bad_request: "Something was off with that request.",
};

export function errorCopy(code: string): string {
  return COPY[code] ?? `Something went wrong (${code}).`;
}
