import type { CheckoutMode, PickerOption, PickerResponse } from "@sharepay/core/dto";
import { useRef, useState } from "react";
import { fmtUsd } from "../format";

function preferredAddress(options: PickerOption[]): string | null {
  const ranked = options.find((option) => option.payable && option.rank === 1);
  if (ranked) return ranked.tokenAddress;
  return options.find((option) => option.payable)?.tokenAddress ?? null;
}

function optionLabel(option: PickerOption): string {
  return `${option.name} · ${option.sharesHeld} shares (~${fmtUsd(option.valueUsd)})`;
}

export function Picker({
  response,
  mode,
  onPay,
  busy,
}: {
  response: PickerResponse;
  mode: CheckoutMode;
  onPay: (option: PickerOption) => void;
  busy: boolean;
}) {
  const preferred = preferredAddress(response.options);
  const [selected, setSelected] = useState<string | null>(preferred);
  const seen = useRef(response);
  if (seen.current !== response) {
    seen.current = response;
    setSelected(preferred);
  }

  const selectedOption =
    response.options.find((option) => option.tokenAddress === selected && option.payable && option.plan) ?? null;

  return (
    <section className="picker">
      <div role="radiogroup" aria-label="Pay with">
        {response.options.map((option) => (
          <div key={option.tokenAddress} className={option.payable ? "option" : "option greyed"}>
            <label>
              <input
                type="radio"
                name="pay-with"
                value={option.tokenAddress}
                checked={selected === option.tokenAddress}
                disabled={!option.payable}
                onChange={() => setSelected(option.tokenAddress)}
              />
              {optionLabel(option)}
            </label>
            {option.badges.map((badge, index) => (
              <span key={`${badge.text}-${index}`} className={`badge ${badge.tone}`}>
                {badge.text}
              </span>
            ))}
            {!option.payable && option.reason && <span className="reason">{option.reason.message}</span>}
          </div>
        ))}
      </div>
      {selectedOption?.plan ? (
        <button type="button" disabled={busy} onClick={() => onPay(selectedOption)}>
          {mode === "live"
            ? `Pay ${fmtUsd(response.priceUsd)} with ≈${selectedOption.plan.sellShares} ${selectedOption.name} shares`
            : `Simulate paying ${fmtUsd(response.priceUsd)} with ≈${selectedOption.plan.sellShares} ${selectedOption.name} shares`}
        </button>
      ) : (
        <p>None of your stocks can pay for this right now.</p>
      )}
    </section>
  );
}
