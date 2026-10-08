import type {
  BudgetResponse,
  CatalogItem,
  CheckoutMode,
  CheckoutState,
  HealthResponse,
  ItemId,
  LedgerResponse,
  MerchantActivity,
  PickerResponse,
} from "@sharepay/core/dto";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export interface StartCheckoutBody {
  itemId: ItemId;
  tokenAddress: string;
  mode: CheckoutMode;
  passcode?: string;
}

export interface Api {
  health(): Promise<HealthResponse>;
  catalog(): Promise<CatalogItem[]>;
  picker(itemId: ItemId): Promise<PickerResponse>;
  unlock(passcode: string): Promise<BudgetResponse>;
  budget(): Promise<BudgetResponse>;
  startCheckout(body: StartCheckoutBody): Promise<{ checkoutId: string }>;
  checkout(id: string): Promise<CheckoutState | null>;
  ledger(): Promise<LedgerResponse>;
  merchantActivity(): Promise<MerchantActivity[]>;
}

function errorCode(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const code = (body as { error: unknown }).error;
    if (typeof code === "string") return code;
  }
  return `http_${status}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createApi(fetchImpl?: typeof fetch, baseUrl?: string): Api {
  const fetchFn = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const base = baseUrl ?? "";

  async function call(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
    const response = init ? await fetchFn(`${base}${path}`, init) : await fetchFn(`${base}${path}`);
    const body = await readBody(response);
    return { status: response.status, body };
  }

  function ok<T>(status: number, body: unknown): T {
    if (status < 200 || status >= 300) {
      throw new ApiError(status, errorCode(body, status));
    }
    return body as T;
  }

  function post(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    async health() {
      const { status, body } = await call("/api/health");
      return ok(status, body);
    },
    async catalog() {
      const { status, body } = await call("/api/catalog");
      return ok(status, body);
    },
    async picker(itemId) {
      const { status, body } = await call(`/api/picker?itemId=${encodeURIComponent(itemId)}`);
      return ok(status, body);
    },
    async unlock(passcode) {
      const { status, body } = await call("/api/live/unlock", post({ passcode }));
      return ok(status, body);
    },
    async budget() {
      const { status, body } = await call("/api/budget");
      return ok(status, body);
    },
    async startCheckout(body) {
      const { status, body: parsed } = await call("/api/checkout", post(body));
      return ok(status, parsed);
    },
    async checkout(id) {
      const { status, body } = await call(`/api/checkout/${encodeURIComponent(id)}`);
      if (status === 404) return null;
      return ok(status, body);
    },
    async ledger() {
      const { status, body } = await call("/api/ledger");
      return ok(status, body);
    },
    async merchantActivity() {
      const { status, body } = await call("/api/merchant/activity");
      const parsed = ok<{ items: MerchantActivity[] }>(status, body);
      return parsed.items;
    },
  };
}
