import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckoutRequest } from "@sharepay/buyer/checkout";
import type { CheckoutState, HealthResponse, ItemId, LedgerResponse, MerchantActivity, PickerResponse } from "@sharepay/core/dto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Address } from "viem";
import { z } from "zod";
import type { Catalog } from "./catalog.js";
import { isTerminal, type CheckoutRegistry } from "./checkouts.js";
import type { LiveGate, LiveGateError } from "./liveGate.js";
import { ItemUnavailableError } from "./pickerView.js";

export const ITEM_IDS = ["sharepay-nvda-report", "bnb-stock-analyst-nvda", "cmc-nvda-dossier"] as const;

export interface AppDeps {
  health: () => HealthResponse;
  deepHealth: () => Promise<Record<string, unknown>>;
  catalog: Pick<Catalog, "list" | "entry" | "adapter">;
  picker: { get(itemId: ItemId): Promise<PickerResponse> };
  ledger: { get(): Promise<LedgerResponse> };
  merchantActivity: () => Promise<MerchantActivity[]>;
  gate: LiveGate;
  checkouts: CheckoutRegistry;
  newId: () => string;
  webDist: string | null;
  maxRunning?: number;
  ssePingMs?: number;
}

const ItemIdSchema = z.enum(ITEM_IDS);
const CheckoutBody = z.object({
  itemId: ItemIdSchema,
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  mode: z.enum(["simulate", "live"]),
  passcode: z.string().max(256).optional(),
});
const UnlockBody = z.object({ passcode: z.string().max(256) });

function gateStatus(error: LiveGateError): number {
  return error === "live_busy" ? 409 : 403;
}

function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const maxRunning = deps.maxRunning ?? 4;
  const pingMs = deps.ssePingMs ?? 20_000;
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });

  app.get("/api/health", async (req, res) => {
    const base = deps.health();
    if (req.query.deep === "1") {
      res.json({ ...base, ...(await deps.deepHealth()) });
      return;
    }
    res.json(base);
  });

  app.get("/api/catalog", async (_req, res) => {
    res.json(await deps.catalog.list());
  });

  app.get("/api/picker", async (req, res) => {
    const parsed = ItemIdSchema.safeParse(req.query.itemId);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    try {
      res.json(await deps.picker.get(parsed.data));
    } catch (error) {
      if (error instanceof ItemUnavailableError) {
        res.status(503).json({ error: "item_unavailable" });
        return;
      }
      res.status(502).json({ error: "picker_failed", detail: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/live/unlock", (req, res) => {
    const parsed = UnlockBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    const verdict = deps.gate.unlock(clientIp(req), parsed.data.passcode);
    if (!verdict.ok) {
      res.status(gateStatus(verdict.error)).json({ error: verdict.error });
      return;
    }
    res.json(deps.gate.budget());
  });

  app.get("/api/budget", (_req, res) => {
    res.json(deps.gate.budget());
  });

  app.post("/api/checkout", async (req, res) => {
    const parsed = CheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    const body = parsed.data;
    const entry = await deps.catalog.entry(body.itemId);
    const adapter = deps.catalog.adapter(body.itemId);
    if (!entry || entry.item.status !== "ok" || !adapter) {
      res.status(503).json({ error: "item_unavailable" });
      return;
    }
    if (deps.checkouts.running() >= maxRunning) {
      res.status(429).json({ error: "too_many_checkouts" });
      return;
    }
    const id = deps.newId();
    if (body.mode === "live") {
      const verdict = deps.gate.reserve(clientIp(req), body.passcode ?? "", id, entry.item.priceUsd ?? "0");
      if (!verdict.ok) {
        res.status(gateStatus(verdict.error)).json({ error: verdict.error });
        return;
      }
    }
    const request: CheckoutRequest = { id, adapter, tokenAddress: body.tokenAddress as Address, mode: body.mode };
    deps.checkouts.start(
      request,
      body.mode === "live" ? { onSaleBroadcast: () => deps.gate.markBroadcast(id), onFinish: () => deps.gate.finish(id) } : {},
    );
    res.status(202).json({ checkoutId: id });
  });

  app.get("/api/checkout/:id", (req, res) => {
    const state = deps.checkouts.get(req.params.id);
    if (!state) {
      res.status(404).json({ error: "unknown_checkout" });
      return;
    }
    res.json(state);
  });

  app.get("/api/checkout/:id/events", (req, res) => {
    const id = req.params.id;
    const current = deps.checkouts.get(id);
    if (!current) {
      res.status(404).json({ error: "unknown_checkout" });
      return;
    }
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    let done = false;
    let unsubscribe: () => void = () => undefined;
    const ping = setInterval(() => {
      res.write(": ping\n\n");
    }, pingMs);
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(ping);
      unsubscribe();
      res.end();
    };
    const send = (state: CheckoutState) => {
      if (done) return;
      res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
      if (isTerminal(state)) finish();
    };
    res.on("close", finish);
    send(current);
    if (!done) unsubscribe = deps.checkouts.subscribe(id, send);
  });

  app.get("/api/ledger", async (_req, res) => {
    res.json(await deps.ledger.get());
  });

  app.get("/api/merchant/activity", async (_req, res) => {
    try {
      res.json({ items: await deps.merchantActivity() });
    } catch {
      res.json({ items: [] });
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  const dist = deps.webDist;
  if (dist && existsSync(join(dist, "index.html"))) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }
      res.sendFile(join(dist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("text/plain").send("SharePay checkout API. The web app is not built yet (npm run build:web).");
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (error as { type?: string } | null)?.type;
    if (type === "entity.parse.failed" || type === "entity.too.large") {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
