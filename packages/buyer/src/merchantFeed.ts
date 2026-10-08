import type { MerchantActivity } from "@sharepay/core/dto";

export async function fetchMerchantActivity(fetchImpl: typeof fetch, merchantUrl: string, after: string | null): Promise<MerchantActivity[]> {
  const base = merchantUrl.replace(/\/+$/, "");
  const url = after ? `${base}/sharepay/activity?after=${encodeURIComponent(after)}` : `${base}/sharepay/activity`;
  const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => ({}))) as { items?: MerchantActivity[] };
  return Array.isArray(body.items) ? body.items : [];
}

export async function waitForReinvest(
  fetchImpl: typeof fetch,
  merchantUrl: string,
  settlementTx: string,
  options: { timeoutMs: number; pollMs: number; sleep: (ms: number) => Promise<void>; nowMs: () => number },
): Promise<MerchantActivity | null> {
  const started = options.nowMs();
  const target = settlementTx.toLowerCase();
  for (;;) {
    const items = await fetchMerchantActivity(fetchImpl, merchantUrl, null).catch(() => []);
    const match = items.find((a) => (a.kind === "sweep" || a.kind === "sweep_skipped") && (a.triggeredBy ?? "").toLowerCase() === target);
    if (match) return match;
    if (options.nowMs() - started >= options.timeoutMs) return null;
    await options.sleep(options.pollMs);
  }
}
