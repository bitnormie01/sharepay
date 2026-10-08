import type {
  BudgetResponse,
  CatalogItem,
  CheckoutMode,
  CheckoutState,
  HealthResponse,
  LedgerResponse,
  PickerOption,
  PickerResponse,
  Receipt,
} from "@sharepay/core/dto";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type Api } from "./api";
import { BootScreen } from "./components/BootScreen";
import { Catalog } from "./components/Catalog";
import { DeliverableView } from "./components/DeliverableView";
import { Header } from "./components/Header";
import { LedgerView } from "./components/LedgerView";
import { MerchantFeed } from "./components/MerchantFeed";
import { Picker } from "./components/Picker";
import { Progress } from "./components/Progress";
import { ReceiptCard } from "./components/ReceiptCard";
import { RecordedRun } from "./components/RecordedRun";
import { UnlockDialog } from "./components/UnlockDialog";
import { errorCopy } from "./copy";
import { followCheckout, type FollowDeps, type FollowHandlers } from "./follow";
import { isTerminal, latestReceiptFor } from "./format";

const STORAGE_KEY = "sharepay.checkoutId";

type AppStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type View = "catalog" | "picker" | "progress" | "missing" | "resuming";
type Tab = "checkout" | "ledger";

export function App({
  api,
  followImpl = followCheckout,
  storage = window.localStorage,
}: {
  api: Api;
  followImpl?: (id: string, handlers: FollowHandlers, deps: FollowDeps) => { close(): void };
  storage?: AppStorage;
}) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [tab, setTab] = useState<Tab>("checkout");
  const [mode, setMode] = useState<CheckoutMode>("simulate");
  const [passcode, setPasscode] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [view, setView] = useState<View>("catalog");
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [picker, setPicker] = useState<PickerResponse | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkoutState, setCheckoutState] = useState<CheckoutState | null>(null);
  const [endedMessage, setEndedMessage] = useState(false);
  const [recorded, setRecorded] = useState<Receipt | null | undefined>(undefined);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const followRef = useRef<{ close(): void } | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef(0);
  const apiRef = useRef(api);
  const followImplRef = useRef(followImpl);
  apiRef.current = api;
  followImplRef.current = followImpl;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      followRef.current?.close();
      followRef.current = null;
    };
  }, []);

  const loadRecorded = useCallback(async (itemId: CheckoutState["itemId"]) => {
    try {
      const data = await apiRef.current.ledger();
      if (!mountedRef.current) return;
      setRecorded(latestReceiptFor(data.receipts, itemId));
    } catch {
      if (!mountedRef.current) return;
      setRecorded(null);
    }
  }, []);

  const beginFollow = useCallback((id: string) => {
    followRef.current?.close();
    const session = sessionRef.current;
    const handle = followImplRef.current(
      id,
      {
        onState(state) {
          if (!mountedRef.current || session !== sessionRef.current) return;
          setCheckoutState(state);
          if (state.status === "succeeded" && state.mode === "simulate") {
            void loadRecorded(state.itemId);
          }
        },
        onGone() {
          if (!mountedRef.current || session !== sessionRef.current) return;
          setEndedMessage(true);
        },
      },
      { api: apiRef.current },
    );
    followRef.current = handle;
  }, [loadRecorded]);

  const onReady = useCallback(
    (next: HealthResponse) => {
      const existing = storage.getItem(STORAGE_KEY);
      if (existing) {
        setResumeId(existing);
        setView("resuming");
      }
      setHealth(next);
    },
    [storage],
  );

  useEffect(() => {
    if (!health) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const next = await api.catalog();
        if (stopped) return;
        setItems(next);
        if (next.some((item) => item.status === "waking")) {
          timer = setTimeout(() => {
            void load();
          }, 5000);
        }
      } catch {
        if (stopped) return;
        timer = setTimeout(() => {
          void load();
        }, 5000);
      }
    };

    void load();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [api, health]);

  useEffect(() => {
    if (!resumeId) return;
    let stopped = false;

    void (async () => {
      try {
        const state = await api.checkout(resumeId);
        if (stopped) return;
        if (state == null) {
          setCheckoutState(null);
          setEndedMessage(true);
          setView("missing");
          return;
        }
        setCheckoutState(state);
        setView("progress");
        if (!isTerminal(state.status)) {
          beginFollow(resumeId);
        } else if (state.status === "succeeded" && state.mode === "simulate") {
          void loadRecorded(state.itemId);
        }
      } catch (err) {
        if (stopped) return;
        setError(err instanceof ApiError ? errorCopy(err.code) : errorCopy("unknown"));
        setEndedMessage(true);
        setView("missing");
      }
    })();

    return () => {
      stopped = true;
      followRef.current?.close();
      followRef.current = null;
    };
  }, [resumeId, api, beginFollow, loadRecorded]);

  useEffect(() => {
    if (!health || tab !== "ledger") return;
    let stopped = false;
    void (async () => {
      try {
        const data = await api.ledger();
        if (!stopped) {
          setLedger(data);
          setLedgerError(null);
        }
      } catch (err) {
        if (!stopped) setLedgerError(err instanceof ApiError ? errorCopy(err.code) : errorCopy("unknown"));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [api, health, tab]);

  async function onChoose(item: CatalogItem) {
    setSelected(item);
    setPicker(null);
    setError(null);
    setView("picker");
    setPickerLoading(true);
    try {
      const response = await api.picker(item.id);
      if (!mountedRef.current) return;
      setPicker(response);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof ApiError ? errorCopy(err.code) : errorCopy("unknown"));
    } finally {
      if (mountedRef.current) setPickerLoading(false);
    }
  }

  async function onPay(option: PickerOption) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        itemId: selected.id,
        tokenAddress: option.tokenAddress,
        mode,
        ...(mode === "live" ? { passcode: passcode ?? "" } : {}),
      };
      const { checkoutId } = await api.startCheckout(body);
      storage.setItem(STORAGE_KEY, checkoutId);
      setEndedMessage(false);
      setRecorded(undefined);
      setCheckoutState(null);
      setView("progress");
      beginFollow(checkoutId);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof ApiError ? errorCopy(err.code) : errorCopy("unknown"));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  function startOver() {
    sessionRef.current += 1;
    const handle = followRef.current;
    followRef.current = null;
    handle?.close();
    storage.removeItem(STORAGE_KEY);
    setCheckoutState(null);
    setEndedMessage(false);
    setRecorded(undefined);
    setSelected(null);
    setPicker(null);
    setPickerLoading(false);
    setError(null);
    setBusy(false);
    setView("catalog");
    setResumeId(null);
  }

  function onUnlocked(nextPasscode: string, nextBudget: BudgetResponse) {
    setPasscode(nextPasscode);
    setBudget(nextBudget);
    setMode("live");
    setUnlockOpen(false);
  }

  if (!health) return <BootScreen api={api} onReady={onReady} />;

  const showRestart = endedMessage;
  const showStartOver = view === "progress" || view === "missing" || view === "resuming";

  return (
    <div className="app-shell">
      <Header
        health={health}
        mode={mode}
        budget={budget}
        onSimulate={() => {
          setMode("simulate");
          setUnlockOpen(false);
        }}
        onRequestLive={() => setUnlockOpen(true)}
      />
      <div role="tablist" aria-label="Sections">
        <button type="button" role="tab" aria-selected={tab === "checkout"} onClick={() => setTab("checkout")}>
          Checkout
        </button>
        <button type="button" role="tab" aria-selected={tab === "ledger"} onClick={() => setTab("ledger")}>
          Ledger
        </button>
      </div>
      {unlockOpen && <UnlockDialog api={api} onUnlocked={onUnlocked} onCancel={() => setUnlockOpen(false)} />}
      {tab === "checkout" ? (
        <div role="tabpanel">
          {showRestart && <p>This checkout ended when the server restarted.</p>}
          {error && view !== "picker" && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {showStartOver && (
            <button type="button" onClick={startOver}>
              Start over
            </button>
          )}
          {view === "resuming" && <p>Loading checkout…</p>}
          {view === "progress" && checkoutState && (
            <>
              <Progress state={checkoutState} />
              {checkoutState.receipt && <ReceiptCard receipt={checkoutState.receipt} />}
              {checkoutState.deliverable && <DeliverableView deliverable={checkoutState.deliverable} />}
              {recorded !== undefined && checkoutState.status === "succeeded" && checkoutState.mode === "simulate" && (
                <RecordedRun receipt={recorded} />
              )}
            </>
          )}
          {view === "picker" && (
            <>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setView("catalog");
                  setSelected(null);
                  setPicker(null);
                  setError(null);
                }}
              >
                ← Back to the catalog
              </button>
              {selected && <h2>{`${selected.title} · ${selected.merchantName}`}</h2>}
              {pickerLoading && <p>Checking your shares…</p>}
              {error && (
                <p role="alert" className="alert">
                  {error}
                </p>
              )}
              {picker && (
                <Picker response={picker} mode={mode} busy={busy} onPay={(option) => void onPay(option)} />
              )}
            </>
          )}
          {view === "catalog" && <Catalog items={items} onChoose={(item) => void onChoose(item)} />}
        </div>
      ) : (
        <div role="tabpanel">
          {ledgerError && (
            <p role="alert" className="alert">
              {ledgerError}
            </p>
          )}
          {ledger && <LedgerView ledger={ledger} />}
          <MerchantFeed api={api} />
        </div>
      )}
    </div>
  );
}
