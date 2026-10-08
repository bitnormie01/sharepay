import type { Deliverable, ItemId } from "@sharepay/core/dto";
import type { PaidRequest } from "../x402client.js";

export interface DeliveryContext {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  nowMs: () => number;
  onProgress: (update: { etaSec: number | null; jobStartedAt: string | null; lastPolledAt: string | null; note: string }) => void;
}

export interface MerchantAdapter {
  id: ItemId;
  title: string;
  merchantName: string;
  merchantUrl: string;
  description: string;
  deliveryHint: string;
  kind: "instant" | "async";
  etaSec: number | null;
  request(): PaidRequest;
  deliver(response: Response, ctx: DeliveryContext): Promise<Deliverable>;
}

export class DeliveryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DeliveryError";
    this.code = code;
  }
}
