import { DeliveryError, type MerchantAdapter } from "./types.js";

export function parseSseJson(body: string): unknown {
  const dataLines = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0);
  const text = dataLines.length > 0 ? dataLines[dataLines.length - 1] ?? "" : body.trim();
  return JSON.parse(text);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function cmcDossierAdapter(endpoint = "https://mcp.coinmarketcap.com/x402/mcp"): MerchantAdapter {
  return {
    id: "cmc-nvda-dossier",
    title: "NVDA research dossier",
    merchantName: "CoinMarketCap",
    merchantUrl: endpoint,
    description: "CoinMarketCap's us_equity_research_dossier skill: fundamentals, valuation, filings and risks with citations.",
    deliveryHint: "Arrives in about 1–5 min",
    kind: "async",
    etaSec: 180,
    request: () => ({
      url: endpoint,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "execute_skill", arguments: { unique_name: "us_equity_research_dossier", parameters: { symbol: "NVDA" } } },
        }),
      },
      timeoutMs: 330_000,
    }),
    async deliver(response) {
      if (!response.ok) throw new DeliveryError("merchant_error", `CoinMarketCap answered HTTP ${response.status}`);
      let rpc: Record<string, unknown>;
      try {
        rpc = asRecord(parseSseJson(await response.text()));
      } catch {
        throw new DeliveryError("bad_response", "CoinMarketCap returned an unreadable response");
      }
      if (rpc.error) throw new DeliveryError("rpc_error", `CoinMarketCap error: ${JSON.stringify(rpc.error).slice(0, 200)}`);
      const result = asRecord(rpc.result);
      const content = Array.isArray(result.content) ? result.content.map(asRecord) : [];
      const text = typeof content[0]?.text === "string" ? content[0].text : "";
      if (result.isError === true) throw new DeliveryError("tool_error", `CoinMarketCap tool error: ${text.slice(0, 200)}`);
      let payload: Record<string, unknown>;
      try {
        payload = asRecord(JSON.parse(text));
      } catch {
        throw new DeliveryError("bad_response", `CoinMarketCap returned non-JSON content: ${text.slice(0, 120)}`);
      }
      const nested = asRecord(payload.result);
      const ok = payload.ok === true || nested.ok === true;
      if (!ok) throw new DeliveryError("skill_failed", `CoinMarketCap skill did not succeed: ${JSON.stringify(payload).slice(0, 200)}`);
      return { kind: "json", title: "NVDA research dossier (CoinMarketCap)", data: payload.data ?? nested.data ?? payload };
    },
  };
}
