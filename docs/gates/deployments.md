# Deployments (G4 / G5)

Public identifiers only.

## Merchant agent (G4, ops:10)

| Field | Value |
|---|---|
| URL | https://sharepay-merchant.onrender.com |
| Host / region | Render free web service `sharepay-merchant` · Singapore (Blueprint `exs-db58dcl9fdbs73bvfbcg`, repo `bitnormie01/sharepay`, branch `main`) |
| Deploy date (UTC) | 2026-10-10 (Blueprint sync of `6437aa0`, ~18:42 UTC; redeployed after the `MERCHANT_PUBLIC_URL` fix, ~19:00 UTC) |
| Health | `/ping` → `{"status":"HEALTHY"}`; `/sharepay/health` → `payTo` `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0`, `eip155:56`, $0.05 |
| Signed RWA call from the host | code 0 (`docs/gates/smoke/merchant-live.json`, 2026-10-10 19:04 UTC): Render Singapore is not region-blocked |
| Merchant wallet (`payTo`) | `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0` |
| A2A agent card | https://sharepay-merchant.onrender.com/.well-known/agent-card.json (`url` = `https://sharepay-merchant.onrender.com/`, via `AGENTCORE_RUNTIME_URL`) |
| ERC-8004 agent id | **370837** on the IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (BSC mainnet); `ownerOf(370837)` = `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0` (`docs/gates/smoke/erc8004.json`) |
| Registration tx | https://bscscan.com/tx/0x9db4d9c5ca745e9463301d2fbb99b9bf0c4cd866dfc9ffc49a16dff8e8a4910d (block 126881993, 2026-10-10 19:15:09 UTC, status success; gas sponsored by the MegaFuel paymaster, gas price 0) |
| Registered agent URI (G4) | `data:application/json;base64,…`, which decodes to name "SharePay Merchant", services `[{"name":"A2A","endpoint":"https://sharepay-merchant.onrender.com/.well-known/agent-card.json","version":"0.3.0"}]`, type `https://eips.ethereum.org/EIPS/eip-8004#registration-v1` |

## Checkout (G5, ops:11)

| Field | Value |
|---|---|
| URL | https://sharepay-checkout.onrender.com |
| Host / region | Render free web service `sharepay-checkout` · Singapore (same Blueprint) |
| Deploy date (UTC) | 2026-10-10, live at 19:43 UTC (`/api/health` → `version 0.1.0+5478de1`) |
| Wallet mode | `api-signer`, buyer `0xB89a65d5b5bf0e99E8A3ff74398470e4E153951f` (demo wallet); `MERCHANT_URL` = https://sharepay-merchant.onrender.com |
| Deep health | `/api/health?deep=1` → binance `488 RWA tokens (code 0)`, rpc `BSC RPC reachable`, merchant `HTTP 200` (`docs/gates/smoke/checkout-live.json`) |
| UI check (built-in browser, 19:45 UTC) | Catalog shows three cards: NVDA research report $0.05 (SharePay merchant agent), NVDA full analysis $0.10 (BNB Chain stock analyst), NVDA research dossier $0.01 (CoinMarketCap). The picker reads NVIDIA 0.01084 shares (~$2.50) and Tesla 0.001306 (~$0.49). **Simulate** on "NVDA research report" → "Sale checked: The sale was simulated on BSC and succeeds" (≈0.000223 NVIDIA shares for $0.05); steps 4–8 say "Simulate mode: nothing signed or broadcast". |
| Keep-awake monitor | _pending: a free external monitor requesting `/api/health` every 10 min, set up by the human_ |
