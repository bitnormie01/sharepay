import type { BudgetResponse } from "@sharepay/core/dto";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, type Api } from "../api";
import { errorCopy } from "../copy";

export function UnlockDialog({
  api,
  onUnlocked,
  onCancel,
}: {
  api: Pick<Api, "unlock">;
  onUnlocked: (passcode: string, budget: BudgetResponse) => void;
  onCancel: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const budget = await api.unlock(passcode);
      if (!active.current) return;
      onUnlocked(passcode, budget);
    } catch (err) {
      if (!active.current) return;
      const code = err instanceof ApiError ? err.code : "unknown";
      setError(errorCopy(code));
    } finally {
      if (active.current) setPending(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-label="Unlock live mode" className="card dialog">
        <h2>Unlock live mode</h2>
        <form onSubmit={(event) => void onSubmit(event)}>
          <label htmlFor="live-passcode">Passcode</label>
          <input
            id="live-passcode"
            type="password"
            autoComplete="off"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
          />
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" disabled={pending}>
              Unlock
            </button>
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
