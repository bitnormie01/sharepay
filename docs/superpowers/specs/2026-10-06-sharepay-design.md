# SharePay — "Pay with shares" checkout for x402 on BSC (design spec)

- **Date:** 2026-10-06 (architect, Step 1). **Status:** approved design.
  - Design sections 1 (architecture, §3 here) and 2 (pipeline, §4) were approved by the user.
  - Sections 3 (UX and API, §5–§7) and 4 (ops, testing, risks, schedule, §8–§12) were approved under the
    user's standing instruction, after independent sub-agent verification with all fixes applied.
  - A spec-document review (sub-agent) returned **Approved**; its advisory notes are applied.
- **Source brief:** `docs/idea-forge/2026-10-05-sharepay-brief.md` (revised 2026-10-06).
- **Resource pack:** `docs/resources/2026-10-05-bnb-hack-tokenized-stocks/`.
- **Plans:** `docs/superpowers/plans/2026-10-06-{core,merchant,buyer,app,ops}.md`. Task DAG:
  `docs/superpowers/manifest.json`.

## 0. Constraints (verbatim from the architect kickoff)

> BSC mainnet only (chainId 56), spot only, small live amounts with Transaction API dry-runs; Binance Web3
> API (RWA Data, Market, Trading, Transaction, Wallet) + Agentic Wallet (baw 1.10.0) + BNB Agent Studio
> (@bnbagent/studio-cli >= 0.0.13, pack pins 0.0.14), self-hosted; merchant self-settles x402 `exact`
> payments (EIP-3009 transferWithAuthorization, U/USD1, EIP-712 version "1") by default, b402
> verify/settle only if merchant credentials are granted; no custom smart contracts; no LLM on the paid
> endpoint; TypeScript on Node.js >= 22.12 with a React web app: a "Pay with shares" checkout over 2-3
> real x402 services (own NVDA research report, BNB Chain's Agent Studio stock analyst, CMC) with a stock
> picker that greys out closed/paused stocks with the reason, share-denominated receipts, an expandable
> "how it worked" step list, and a share ledger; ~$10 total on-chain budget, free-tier hosting only,
> API-calling server in a region that passes a day-1 signed-call smoke test (40304 reported from
> US/serverless hosts); keep a running DEVEX_LOG.md (the DevEx report itself is human-written); gate the
> build on the brief's four day-1 smoke checks; hard deadline Sun 11 Oct 2026 12:00 UTC (17:30 IST),
> repos frozen at lock (idea-forge did not gate on it); team = solo + AI.

**Tracks:**
- Main Track (Tokenized Stocks Products & Agents).
- Best Use of Agentic Wallet / Wallet Skills.
- Best Use of BNB Agent Studio.

**Money shot:** buy an NVDA research report with NVIDIA shares; the merchant then reinvests into SPYB.

**Out of scope (from the kickoff):**
- **Products:** physical goods and shipping; perps, leverage or shorting; lending or stocks-as-collateral; fiat ramps, cards or KYC.
- **Merchants and claims:** fake or mock merchants; any claim beyond "works with any x402 merchant".
- **Infrastructure:** custom contracts (vaults, escrow); a general-purpose facilitator service.
- **Assets and strategy:** xStocks execution; trading strategy, PnL optimization or LLM stock-picking.
- **Surfaces:** multi-chain; a mobile app; a Telegram bot.
- **Stretch only:** MCP/SDK packaging and ERC-8183 escrow.

## 1. Design decisions (question → answer → source)

| # | Question | Answer | Source |
|---|---|---|---|
| D1 | Where does the judge-facing, API-calling server run? | Render free web services in **Singapore**. Fallback: this Windows PC, with an ngrok static domain for the checkout and a cloudflared quick tunnel for the merchant. Day-1 smoke checks pick the host. | User (Q1) |
| D2 | A market is closed or limited, but a 24/7 AMM SWAP route exists | **Payable, with an amber warning badge**, ranked below open markets. Only hard stops grey out. This deliberately deviates from the brief's literal "limited → grey". | User (Q2) |
| D3 | How deep does the merchant sit in Agent Studio? | **The Studio runtime is the merchant**: `bag init` TS scaffold with our paid route mounted inside its Express app. The Studio keystore wallet is the sole signer. ERC-8004 via `bag erc8004 register`. | User (Q3) |
| D4 | How are hosted live payments unlocked? | **Passcode + daily cap.** The passcode is shared only in the private submission form. Simulate is the default. | User (Q4) |
| D5 | Implementation approach | npm-workspaces TS monorepo with thin hand-rolled typed clients (Binance API, x402 v2) over viem. Express 5, React 19 + Vite 7, vitest 3, tsx runtime. | User (Q5) |
| D6 | RFQ execution | **Cut.** RFQ-only routes are detected and greyed with the reason; only SWAP routes execute. Reasons: the docs are inconsistent (`/order/submit` `quoteId` = "`rfq.orderId`", but `/swap`'s `rfq` has no `orderId`), and payments are cents. | Derived (verified by checker) |
| D7 | Settlement call | `transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,v,r,s)`. USD1 lacks the `bytes` overload; U has both. | Live `eth_call` probe, 2026-10-06 |
| D8 | Receipt persistence on a free host (no disk) | A committed seed file of **real** receipts exported after live runs (every tx hash is verified on BSC at load), plus the runtime session. | Derived (Render docs) |
| D9 | Keeping hosts awake | Only the checkout is kept awake during judging (≈576 h, Oct 8–31, under 750 h). The merchant wakes on demand; the checkout pre-warms it on page load. | Derived (Render docs) |
| D10 | API keys, wallet setup, funding, submission | These are campaign gates owned by the gate-concierge (preflight/closing) and never enter the manifest. The manifest gates only build-produced live actions. | Kit doctrine |

## 2. Verified facts the design relies on (live checks, 2026-10-06)

- **Stock analyst** (`https://stock-agent.bnbchain.org`).
  - An unpaid `POST /x402/analyze/async` with `{"symbols":["NVDA"]}` returns **402** with a `payment-required` header: base64 v2, `accepts` U and USD1 at `eip3009`, `amount` `100000000000000000`, `network` `eip155:56`, `maxTimeoutSeconds` 600, facilitator `binance-b402-v2`.
  - Paid → 202 `{jobId, jobToken, status, statusUrl, expiresAt}`. Poll `GET /x402/jobs/{jobId}` with header `X-Job-Token`.
  - Statuses: `settling|queued|running|succeeded|failed`. On `succeeded`, `downloadUrl` serves markdown. A `failed` job with `retryable:true` resumes via `POST /x402/jobs/{jobId}/resume` without re-payment.
  - The verifier accepts `validAfter <= now < validBefore` with `validBefore - now <= 3600`.
- **CMC MCP** (`https://mcp.coinmarketcap.com/x402/mcp`).
  - An unpaid JSON-RPC `tools/call` of `execute_skill` with `{unique_name:"us_equity_research_dossier", parameters:{symbol:"NVDA"}}` returns plain **HTTP 402** with a `PAYMENT-REQUIRED` header.
  - On BSC it lists U **twice** (`permit2-exact` and `eip3009`), with `amount` `10000000000000000`, plus USD1 entries; a Base USDC entry comes first. `maxTimeoutSeconds` is 500.
  - CMC's live `tools/list` text: a paid run is "synchronous … 30-300 seconds, no job id"; success needs `result.ok === true`.
  - `find_skill` is free; its input schema requires `symbol`.
- **U and USD1 contracts.**
  - U = "United Stables" and USD1 = "World Liberty Financial USD", both version "1", chainId 56, verifyingContract = the token.
  - Both expose `authorizationState(address,bytes32)` and the v,r,s `transferWithAuthorization`.
- **Agentic Wallet `baw` (1.10.0 reference docs).**
  - `x402-payment preview --paymentRequirements <base64-or-json> --json` → `{paymentId, options[]}`. Each option has a 1-based `index`, a `status` (`READY_TO_SIGN|ACTION_REQUIRED|NOT_SIGNABLE`), `reasons` and `originalAccept`.
  - `x402-payment sign --paymentId --selectedIndex --json` → `{paymentHeaderName:"PAYMENT-SIGNATURE", paymentHeaderValue, signatureExpiresAt}`.
  - Only x402 v2; only BSC, Base and Solana.
  - `market-order swap … --json` → `{orderId}`. Poll `market-order list --orderId` until `FINISHED|FAILED`.
  - `wallet address --json` → `data.addresses[]` (BSC = `"56"`).
- **x402 v2.**
  - Headers: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE` (all base64 JSON).
  - Official client window: `validAfter = now-600`, `validBefore = now+maxTimeoutSeconds`.
  - The official facilitator rejects `validBefore < now+6` and `validAfter > now`.
- **BNB Agent Studio 0.0.14.**
  - `bag init <name> --destination self --network bsc-mainnet --wallet-kind evm-local --protocols A2A --rails b402 --seller-price-usd 0 --llm-provider none --storage-provider local --no-onboard --no-install --no-auto-topup --ide claude-code` scaffolds a TS Express app at `<name>/app/agent/src/unifiedMain.ts`.
  - The app binds `AGENT_PORT || PORT` first and serves `/ping` and `/.well-known/agent-card.json`. Studio's `/x402` seller route mounts only when `[payments.b402_seller]` is not disabled; the generated default is `enabled = false`.
  - `--rails b402` writes `protocols = ["A2A","X402"]`.
  - `getWallet()` (evm-local) implements `signTransaction(TransactionRequestLegacy & {chainId}) → {rawTransaction, …}`.
  - Keystore and password can come from env `WALLET_KEYSTORE_JSON` + `WALLET_PASSWORD`.
  - `bag erc8004 register --endpoint <url> [--name] [--description] [--no-paymaster]` (MegaFuel relay by default).
- **Render free tier.**
  - Spins down after 15 min idle; about 1 min to wake.
  - 750 free instance hours per workspace per month; no persistent disk.
  - Blueprint region `singapore`; Node pinned via `.node-version`.

## 3. Architecture

```
            judges / you (browser)
                     │
   ┌─────────────────▼─────────────────┐   x402 (EIP-3009 U)  ┌──────────────────────────────────┐
   │ sharepay-checkout   (Render SG)   │ ───────────────────▶ │ sharepay-merchant   (Render SG)  │
   │ React app + checkout API          │ ◀─────────────────── │ BNB Agent Studio runtime         │
   │ buyer engine, wallet = burner EOA │   200 + report       │  + /x402/report  (self-settles)  │
   └──────┬──────────────────┬─────────┘                      │  + SPYB sweeper  + A2A card      │
          │                  │ x402                           │  wallet = Studio keystore        │
   Binance Web3 API     stock-agent.bnbchain.org (async job)  └────────────┬─────────────────────┘
   RWA·Trading·Tx·Wallet CMC MCP dossier (B402-settled)        Binance Trading + Tx API, BSC RPC
```

### 3.1 Parties

**Buyer = the checkout service.** It runs in one of two wallet modes:
- **`api-signer`**, the hosted judge path. A burner EOA (`BUYER_PRIVATE_KEY`) holds only tokenized stocks plus a little BNB for gas. Every leg is signed locally and goes through Binance's Transaction API: `simulate`, then `broadcast-transaction`.
- **`agentic-wallet`**, local only (this PC and the demo video). The same checkout shells out to `baw`:
  - `market-order swap` sells the shares, then `market-order list` is polled.
  - `x402-payment preview/sign` pays.
  - Each AW sale is preceded by a **proxy simulation**: the identical swap is built through the Trading API for the AW address and run through `simulate`.
  - `AW_PAYS_OWN_MERCHANT=false` (decided by smoke check #2) routes the own-merchant item through the api-signer.

**Merchant agent.** This is a BNB Agent Studio project (`sharepaymerchant/`, from `bag init`) whose Express app mounts `@sharepay/merchant`. Its routes:
- `GET /x402/report?symbol=NVDA`: the paid route, x402 v2 `exact`, 0.05 U or USD1, self-settled.
- `GET /x402/report/price`
- `GET /sharepay/activity`
- `GET /sharepay/health`

The Studio wallet (`getWallet()`) is the **sole signer** for settlement and sweep transactions. Studio's own `/x402` B402 rail stays disabled; enabling it is config-only if B402 credentials are ever issued. The generated LLM `runWork` is replaced by a deterministic function, so no route can reach an LLM. Identity is ERC-8004 on BSC mainnet.

**Third-party merchants.** The stock analyst and the CMC dossier settle through their own B402 facilitator. That is how b402 sits in the end-to-end flow.

### 3.2 Repository layout (npm workspaces)

```
package.json  tsconfig.base.json  tsconfig.json  vitest.config.ts  vitest.setup.ts  .node-version
.env.example  LICENSE  render.yaml  DEVEX_LOG.md  data/receipts.seed.json  data/merchant-activity.seed.json
packages/core      @sharepay/core      shared library (no workspace deps)
packages/merchant  @sharepay/merchant  merchant routes, verify, settle, sweeper, report
packages/buyer     @sharepay/buyer     picker engine, planner, wallets, x402 client, adapters, checkout
packages/checkout  @sharepay/checkout  Express server: API + SSE + live gate + static web
packages/web       @sharepay/web       React 19 + Vite 7 checkout UI
sharepaymerchant/  BNB Agent Studio project (bag init output); app/agent imports @sharepay/merchant
scripts/           smoke.ts, ops.ts, devex-summary.ts (+ scripts/lib, scripts/test)
```

**Runtime and tooling:**
- Node ≥ 22.12 (`.node-version` 22.21.0); TypeScript 5.9, strict, ESM, `module/moduleResolution: NodeNext`.
- Workspace packages export TS sources directly (`"exports": {".": "./src/index.ts"}`), so there is no build step for servers; they run with `tsx`.
- The web app is built with `vite build`.
- Tests are vitest 3; React tests use a per-file `// @vitest-environment jsdom`.

**Pinned dependencies:**

| Group | Packages |
|---|---|
| Core | `viem ^2.57.3`, `zod ^3.25.76` (same major as Studio's scaffold) |
| Server | `express ^5.2.1` |
| Web | `react ^19.3.0`, `react-dom ^19.3.0`, `react-markdown ^10.1.0`, `remark-gfm ^4.0.1`, `vite ^7.3.7`, `@vitejs/plugin-react ^5.2.0` |
| Tooling | `typescript ~5.9.3`, `tsx ^4.23.15`, `vitest ^3.2.7` |
| Test helpers | `supertest ^7.3.1`, `jsdom ^26.1.0`, `@testing-library/react ^16.3.3`, `@testing-library/jest-dom ^6.10.0`, `@testing-library/user-event ^14.6.7` |
| Studio CLI | `@bnbagent/studio-cli 0.0.14` (devDependency) |

### 3.3 Token registry (`packages/core/src/tokens.ts`; all 18 decimals, BSC chain 56)

Addresses come from the resource pack and were verified on-chain.

| Symbol | Kind | Display name | Platform | Address |
|---|---|---|---|---|
| NVDAB | stock | NVIDIA | bstock | `0x02fca66c1d1afb4e2a7884261eb00f63598a7436` |
| TSLAB | stock | Tesla | bstock | `0x5b1910eaad6450e50f816082aa078c41f10c292f` |
| AAPLB | stock | Apple | bstock | `0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a` |
| SPYB | stock | S&P 500 | bstock | `0x7138b48df7d98d7e3cc221bfe7192d0a178182d8` |
| NVDAon | stock | NVIDIA (Ondo) | ondo | `0xa9ee28c80f960b889dfbd1902055218cba016f75` |
| TSLAon | stock | Tesla (Ondo) | ondo | `0x2494b603319d4d9f9715c9f4496d9e0364b59d93` |
| SPYon | stock | S&P 500 (Ondo) | ondo | `0x6a708ead771238919d85930b5a0f10454e1c331a` |
| U | stable (EIP-3009 "United Stables" v1) | U | n/a | `0xce24439f2d9c6a2289f741120fe202248b666666` |
| USD1 | stable (EIP-3009 "World Liberty Financial USD" v1) | USD1 | n/a | `0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d` |
| USDT | stable (no EIP-3009) | USDT | n/a | `0x55d398326f99059ff775485246999027b3197955` |

Other constants:
- Aggregation router `0xb44446b0c8e56988c34f7ff73ae904982b5fdda5`.
- x402 network `eip155:56`.
- Binance chain id `"56"`.

### 3.4 Binance Web3 API usage

| Module | Endpoints | Used for |
|---|---|---|
| RWA Data | `rwa/tokens`, `rwa/price`, `rwa/search`, `rwa/underlying-profile`, `rwa/underlying-market` | Picker status and reasons, prices, multipliers (Ondo `tokenToShareRatio`), the deterministic report |
| Trading | `aggregator/quote`, `aggregator/swap`, `aggregator/approve-transaction` | Route probes, sale sizing, sales, sweeps, approvals |
| Transaction | `pre-transaction/simulate`, `/gas-price`, `/gas-limit`, `/broadcast-transaction` | Dry-run of every API-signed leg; gas; broadcast (buyer with MEV protection; merchant settlement and sweeps) |
| Wallet | `balance/token-balances-by-address` | Holdings |
| b402 | via the stock analyst's and CMC's facilitator | Third-party settlement |

**Client conventions:**
- Base URL `https://web3.binance.com/build`. The signed `requestPath` includes `/build` plus the exact raw query string.
- Signature: `X-OC-SIGN = Base64(HMAC-SHA256(timestamp+method+requestPath+body, secret))`, sent with `X-OC-APIKEY`, `X-OC-TIMESTAMP` (ISO with ms) and `X-OC-RECV-WINDOW: 10000`.
- Envelope `{code,msg,data}`; `code` 0 means success.
- 15 s timeout; per-endpoint pacing of at least 250 ms; one retry on HTTP 429 after `Retry-After` (capped at 5 s).
- Every attempt is reported to a DevEx telemetry sink.

## 4. The payment pipeline

### 4.1 One checkout (step list)

Each step has a plain label (the main view) and a technical label (shown in the expanded detail).

| # | Step id | Plain label | Technical label | What happens |
|---|---|---|---|---|
| 1 | `challenge` | Price checked | HTTP 402 received | Unpaid request; read `PAYMENT-REQUIRED` (fallback: JSON body). Select an accept with `scheme exact`, `network eip155:56`, `extra.assetTransferMethod == "eip3009"` (absent counts as eip3009 for U/USD1), asset U (preferred) or USD1, `amount <= 0.25` units. |
| 2 | `quote` | Shares priced | Shares quoted | The planner sizes the sale (§4.3) from the picker's route. |
| 3 | `simulate` | Sale checked | Swap simulated | See the allowance rule below the table. In AW mode this is a proxy simulation. |
| 4 | `sell` | Shares sold | Shares sold (tx) | api-signer: `/swap` → sign → `/broadcast-transaction` (`enableMevProtection: true`) → RPC receipt → re-check the stable balance ≥ amount. AW: `baw market-order swap` (`--fromTokenQty` human units, `--slippage auto`) → poll `market-order list` every 3 s for up to 120 s. |
| 5 | `authorize` | Payment approved | EIP-3009 authorization signed | api-signer: `TransferWithAuthorization` with domain `{name, version from accept.extra, chainId 56, verifyingContract asset}`, `validAfter now-600`, `validBefore now+maxTimeoutSeconds`, random 32-byte nonce. AW: `preview` (retried up to 5× every 3 s until the matching option is `READY_TO_SIGN`) → `sign`. The signed header is decoded and its window checked before replay. |
| 6 | `settle` | Merchant paid | Merchant settled (tx) | Replay with `PAYMENT-SIGNATURE`; decode `PAYMENT-RESPONSE` when present. |
| 7 | `deliver` | Report delivered | 200 delivered | Own report: immediate. Stock analyst: status `awaiting_delivery`, poll every 10 s (honouring `Retry-After`) for up to 10 min, resume once if `retryable`, then download markdown. CMC: the replay itself runs for up to 330 s in the background. |
| 8 | `reinvest` | Merchant reinvested in S&P 500 shares | Merchant reinvested into SPYB (tx) | Own merchant only. Poll the merchant's `/sharepay/activity` every 5 s for up to 120 s for a `sweep` whose `triggeredBy` is our settlement tx (or a `sweep_skipped` note). |

**Allowance rule for step 3:**
- Read `allowance(owner, approveTarget)` over RPC.
- If it is enough, build `/swap` and run `simulate` (a `FAILED` result stops the checkout).
- If not, build and simulate the approve (`/approve-transaction` with `vendor` for equity tokens; its `dexContractAddress` must equal the quote's `approveTarget`), and mark the swap "simulatable after the approval lands".
- Funding pre-approves the router (ops), so judges' simulate runs go end to end.

**Modes:**
- **Simulate** runs steps 1–3 for real and marks 4–8 `skipped` ("Simulate mode: nothing signed or broadcast"). It then shows the item's most recent **recorded live run** from the verified receipts.
- **Live** runs every step.

**Failure handling:**
- Any failure marks the step `failed` with a plain-English message plus the raw code (e.g. `40369 BSTOCK_INVALID_TRADING_TIME`), and the checkout status becomes `failed`.
- No receipt is produced unless step 6 succeeded.
- A timeout after signing is **never** re-signed, because the payment may have settled. The checkout reports `delivery_unknown` with the tx links it has.

### 4.2 Picker engine (pure, table-tested)

**Inputs, for each held registry stock:** balance, multiplier, RWA `statusInfo`, tokenPrice, and the route probe outcome for the planned sale size.

**Route probe (in order):**
1. `quote(stock → payAsset)` across all vendors, which captures RFQ/SWAP and RWA error codes.
2. If there is no SWAP route, `quote(stock → payAsset, vendor=LiquidMesh)`.
3. If there is still none, two legs: `quote(stock → USDT, LiquidMesh)` plus `quote(USDT → payAsset, LiquidMesh)`.

**Outcomes:**

| Outcome | Meaning |
|---|---|
| `swap` | A route exists, with 1 or 2 legs. |
| `rfq_only` | Only RFQ routes exist. |
| `closed` | 40369 / 40367. |
| `below_min` | 40375; the minimum is parsed from `msg`. |
| `above_max` | 40366. |
| `no_liquidity` | 40374, or empty routes. |
| `error` | Any other code. |

Every outcome is keyed on each route's `executionMode`, never on the issuer.

**Hard grey (not payable):**
- `reasonCode` is `ASSET_PAUSED`. The `reasonMsg` maps to plain English: cash_dividend → "Paused: cash dividend", stock_dividend → "Paused: stock dividend", stock_split → "Paused: stock split", merger → "Paused: merger", acquisition → "Paused: acquisition", spinoff → "Paused: spin-off", maintenance → "Paused: maintenance", corporate action → "Paused: corporate action"; anything else → "Paused: <raw>".
- `reasonCode` is `MARKET_PAUSED`, or `marketStatus` is `pause` → "Trading halted".
- `MARKET_MAINTENANCE` → "Market maintenance".
- `UNSUPPORTED` → "Not supported for trading".
- A `reasonCode` outside the documented enum → "Unknown market status: <raw>".
- A `marketStatus` outside the documented enum with `openState !== true` → "Unknown market status: <raw>".
- Not enough shares (holding < planned sale) → "Not enough shares: need X, have Y".
- Route outcomes:
  - `rfq_only` → "Only an RFQ route is available (not used for sub-dollar payments)".
  - `below_min` → "Below Ondo's minimum order ($N)".
  - `above_max` → "Above the maximum single order".
  - `no_liquidity` → "No live route right now".
  - `closed` with no SWAP route → "Market closed and no 24/7 route" plus the next open time.
  - `error` → "No live route (<code> <msg>)".

**Soft (payable, amber badge; requires a `swap` outcome):**
- `MARKET_CLOSED` or `marketStatus` `closed` → "Market closed (<reasonMsg or 'Weekend or Holiday'>) · reopens <ddd HH:mm UTC>".
- `ASSET_LIMITED` → "Earnings window: limited trading".
- An unknown `marketStatus` with `openState === true` and `reasonCode` TRADING or null → "Off-hours session".
- (Inference, recorded in the pack: bStock AMM pools trade 24/7 while the RFQ leg closes.)

**OK:** `openState === true` and `marketStatus` ∈ {premarket, regular, postmarket, overnight}, with a `swap` outcome.

**Ranking:**
- Order: OK first, then soft; ties by lower `priceImpactPercent` (null is treated as 100), then higher USD value, then symbol ascending.
- `rank` runs 1..n over payable options; the top option is pre-selected.

**Shares:**
- shares = tokens × multiplier.
- bStock: on-chain `uiMultiplier()` (1e18 = 1.0×), falling back to RWA `tokenToShareRatio`.
- Ondo: RWA `tokenToShareRatio`.

### 4.3 Sell planner

**Inputs:** pay amount P (atomic, 18 dp), the stock, its tokenPrice (USD), balance, and the route outcome.

**One leg:**
1. Estimate `sell = ceil(P × 1e18 / tokenPrice × 1.03)` (tokenPrice parsed to 18 dp).
2. Quote. If `toTokenAmount < P × 1.015`, resize once: `sell' = ceil(sell × P × 1.015 / toTokenAmount × 1.01)`, then re-quote.
3. Still short → error `quote_short`.
4. When the swap is built (`slippagePercent "1"`), require `tx.minReceiveAmount >= P`. Otherwise fail with `price_moved`.

**Two legs:**
- Leg 1 (stock → USDT) is sized so that leg 2's USDT quote yields ≥ P × 1.03.
- Leg 2 sells the USDT actually received (balance delta).
- Each leg is approved, simulated and broadcast separately.

**Change:** a few cents of stable change stay in the wallet. Receipts never show it.

### 4.4 Merchant verification (in order; the first failure wins)

On failure the merchant returns HTTP 402 with a fresh `PAYMENT-REQUIRED`, plus `PAYMENT-RESPONSE` `{success:false, errorReason, transaction:"", network, payer}` and a JSON body `{error, detail}`.

1. `invalid_payload`: the header is not base64 JSON, or fails the PaymentPayload schema.
2. `unsupported_version`: `x402Version !== 2`.
3. `requirement_mismatch`: `accepted` does not equal one of our current accepts on scheme, network, asset (case-insensitive), amount, payTo (case-insensitive) and `maxTimeoutSeconds`.
4. `recipient_mismatch`: `authorization.to != payTo`.
5. `amount_mismatch`: `authorization.value != amount`.
6. `not_yet_valid`: `validAfter > now`.
7. `expired`: `validBefore < now + 6`.
8. `window_too_long`: `validBefore > now + 86400`.
9. `invalid_nonce`: the nonce is not `0x` plus 64 hex.
10. `nonce_in_flight`: the key `asset:from:nonce` is already being settled.
11. `invalid_signature`: the EIP-712 recovery ≠ `from`. The domain comes from **our token registry**, never from the client's `extra`.
12. `nonce_used`: `authorizationState(from, nonce) == true`.
13. `insufficient_funds`: `balanceOf(from) < value`.
14. `simulation_failed`: a Transaction API `simulate` of the settlement call (from = the merchant) is `FAILED`.

### 4.5 Merchant settlement and response

Order: verify → build the report (cached; a report failure returns 503 **before** any charge) → settle → respond.

**Settlement**, under the merchant wallet mutex:
1. Calldata `transferWithAuthorization(…, v, r, s)`, with v = 27 + yParity.
2. `gasPrice` = `/gas-price` `evmLegacyGasPrice.mediumGasPrice`; `gas` = `/gas-limit` × 1.2 (fallback 150000); nonce = RPC `pending`.
3. Sign a legacy tx (chainId 56) with the Studio wallet; `/broadcast-transaction` (`enableMevProtection: false`); RPC receipt with a 60 s timeout. A reverted receipt yields `settle_failed`.

**Response:**
- 200 with `PAYMENT-RESPONSE` `{success:true, transaction, network:"eip155:56", payer}` and body `{report, settlement}`.
- An activity entry is written, and the sweeper is triggered asynchronously (never inside the request).

### 4.6 Deterministic research report (no LLM)

**Inputs, all from RWA Data:**
- `rwa/search?keyword=NVDA`. The group whose `ticker == symbol` gives chain-56 assets on `bstock`/`ondo`; if the search fails, fall back to the registry.
- `underlying-profile` and `underlying-market`, called per asset, sequentially.
- One batched `rwa/price`.

**Output (`ResearchReportDto`):**
- Company: name, CEO, website, industry, concepts, description.
- Market: reference price, 52-week range, market cap, P/E, P/B, dividend yield, 24h share volume.
- Status: open/closed label and next open (UTC).
- Issuers: platform, token, on-chain token price, shares per token, **on-chain implied per-share price** = tokenPrice ÷ tokenToShareRatio, status, and attestation links (from `protections`).
- **Cross-issuer spread (bps)** = (max − min) / min × 10 000.
- Summary lines (fixed templates), a disclaimer, and sources (the endpoints called plus the time).
- A markdown rendering.

**Disclaimer.** Conflict C7 in the pack's `event.md`: `referencePrice` is "derived from the on-chain token price, not an official quote", so per-issuer prices are on-chain-implied. The disclaimer reads: "Generated deterministically from Binance Web3 RWA Data API responses at <time>. On-chain implied per-share prices are derived from on-chain token prices, not exchange quotes. Not investment advice."

**Caching:** 60 s per symbol, single-flight, which keeps the RWA endpoints under 5 RPS.

### 4.7 Sweeper (merchant self-funding loop)

**Triggers:**
- After each settlement (via `trigger(txHash)`) and every 5 min while the process is up.
- It is single-flight: a trigger during a run queues exactly one follow-up.

**For each stable in [U, USD1]:**
1. `amount = min(balance − float, maxPerSweep)`; skip if `amount < SWEEP_MIN_ATOMIC`.
2. Route: quote `stable → SPYB` with `vendor=LiquidMesh` (SWAP routes only, best `toTokenAmount`, `priceImpactPercent <= SWEEP_MAX_PRICE_IMPACT`). On no route or code 40370/40374/40368, fall back to two legs: `stable → USDT`, then `USDT → SPYB`.
3. For each leg, ensure the allowance:
   - If allowance is short: `/approve-transaction` (max) → check that the spender equals the quote's `approveTarget` (else `AGGREGATION_ROUTER`) → simulate → send.
   - Then **re-quote** (30 s `quoteId` TTL) → `/swap` (`slippagePercent` from config) → simulate (must be ok) → send (`enableMevProtection: true`).
4. Record a `sweep` activity entry with the SPYB received (balance delta × `uiMultiplier`), the tx hashes and `triggeredBy`.

**Errors:** an error records `sweep_skipped` ("Reinvest postponed: <reason>"), at most once per distinct reason per 10 min. It never blocks settlement.

**Defaults:** `SWEEP_MIN_ATOMIC` 0.05 (one report payment), float 0, `maxPerSweep` 5 units, max price impact 2%, slippage "1".

### 4.8 Concurrency and nonces

- Each wallet (buyer burner, merchant) has a promise-chain mutex held until the receipt confirms. Nonces come from RPC `pending`, and gas limits carry a +20% buffer.
- Hosted live checkouts are serialized (HTTP 409 `live_busy`).
- Free Render runs a single instance, so in-memory locks are sufficient there. A restart mid-tx is covered by the `pending` nonce.

## 5. Checkout UX

**Header:** "SharePay: pay with shares", the chip "Demo wallet · shares only" (the address is in its tooltip), and a mode switch Simulate (default) / Live. Live opens a passcode prompt; `POST /api/live/unlock` validates it and returns the remaining cap.

**Catalog** (three cards). Prices come from the live 402.

| Item id | Title | Merchant | Price | Delivery hint |
|---|---|---|---|---|
| `sharepay-nvda-report` | NVDA research report | SharePay merchant agent (BNB Agent Studio) | $0.05 | Instant |
| `bnb-stock-analyst-nvda` | NVDA full analysis | BNB Chain stock analyst (Agent Studio) | $0.10 | Arrives in about 2–5 min |
| `cmc-nvda-dossier` | NVDA research dossier | CoinMarketCap | $0.01 | Arrives in about 1–5 min |

- Our own card never disappears: while the merchant wakes it shows "Waking up the merchant agent…", with a 90 s probe and retries.
- A third-party card whose probe fails shows "Temporarily unavailable". Mocks never appear.

**Picker:**
- Rows read "<Name> · <shares> shares (~$<usd>)", e.g. "NVIDIA · 0.0123 shares (~$2.07)".
- Greyed rows show the reason; soft rows show amber badges.
- The CTA reads "Pay $0.05 with ≈<shares> <Name> shares".

**Progress:** the 8 steps with plain labels. Each expands to show the technical label, details and BscScan links (`https://bscscan.com/tx/<hash>`).

**Receipt:**
- Reads "Paid $<usd> with <shares> <Name> shares", plus the merchant, the time and the tx links (sale, settlement, reinvest).
- No stablecoin or gas amounts appear on the receipt.

**Deliverable viewer:**
- Own report: sections plus the issuer table with the C7 disclaimer.
- Analyst: markdown via react-markdown + remark-gfm (no raw HTML).
- CMC: a headline plus a collapsible pretty-printed JSON.

**Recorded live run** (Simulate mode): the latest verified real receipt for the item, with its links, its deliverable title and its reinvest tx, labelled "Recorded live run".

**Ledger tab:**
- Holdings in shares (multiplier-normalized; live from the chain via the Wallet API, falling back to RPC).
- Receipts: the seed, plus the merchant activity, plus the session.

**Merchant pane:** a live feed, e.g. "Received a $0.05 payment from 0x12…ab (settlement)", "Reinvested $0.05 into 0.0000712 S&P 500 shares (SPYB)", "Reinvest postponed: <reason>".

**Resilience:**
- A boot screen polls `/api/health` while the host wakes.
- SSE sends a heartbeat comment every 20 s. The client reconnects with backoff, falling back to `GET /api/checkout/:id`.
- The active `checkoutId` is kept in `localStorage`.
- A 404 for an unknown checkout renders "This checkout ended when the server restarted", keeping any tx links already shown.

**Copy rule:** the main flow never shows "U", "USDT", "gas" or "EIP-3009". These appear only inside expanded technical details.

## 6. Checkout API (Express 5)

| Method | Path | Result |
|---|---|---|
| GET | `/api/health` | `{ok, walletMode, buyerAddress, merchantUrl, version}` |
| GET | `/api/catalog` | `CatalogItem[]` (cached 10 min; on a request, items in `waking` state are re-probed; a merchant pre-warm `GET /ping` is fired) |
| GET | `/api/picker?itemId=` | `PickerResponse` (cached 30 s per item) |
| POST | `/api/live/unlock` | body `{passcode}` → `{liveAvailable, remainingCount, remainingUsd}` or 403 `{error}` |
| POST | `/api/checkout` | body `{itemId, tokenAddress, mode, passcode?}` → 202 `{checkoutId}`; 400 `bad_request`; 403 `live_passcode_invalid` / `live_cap_reached` / `live_locked_out` / `live_disabled`; 409 `live_busy` |
| GET | `/api/checkout/:id` | `CheckoutState`, or 404 `{error:"unknown_checkout"}` |
| GET | `/api/checkout/:id/events` | SSE: `event: state` with the full `CheckoutState` JSON on every change; `: ping` every 20 s |
| GET | `/api/ledger` | `LedgerResponse` |
| GET | `/api/merchant/activity` | proxy of the merchant's `/sharepay/activity` → `{items: MerchantActivity[]}` |
| GET | `/api/budget` | `BudgetResponse` |
| GET | `/*` | the built web app (`packages/web/dist`) |

**Live gate:**
- `LIVE_PASSCODE` comes from the environment; it is never committed, never put in a query string, and compared in constant time (`crypto.timingSafeEqual` on SHA-256 digests).
- Attempts are throttled to 5 failures per IP per 10 min (then `live_locked_out` for that IP), with a global lockout after 50 failures per hour.
- Daily cap: `LIVE_DAILY_MAX_COUNT` (10) and `LIVE_DAILY_MAX_USD` (1.50) per UTC day. A slot is **reserved** at POST, **released** if the checkout fails before step 4 broadcasts the sale, and **consumed** as soon as the sale is broadcast. Any spend therefore counts. The counter is in-memory; the burner's small balance is the hard ceiling.
- `BudgetResponse` = `{liveAvailable: boolean, remainingCount: number, remainingUsd: string}`.

**DTOs** (`packages/core/src/dto.ts`, imported by the web as `@sharepay/core/dto`): `CheckoutStep`, `CheckoutState` (incl. `deliverable`, `etaSec`, `jobStartedAt`, `lastPolledAt`), `Receipt`, `Deliverable`, `CatalogItem`, `PickerOption`, `PickerResponse`, `LedgerResponse`, `MerchantActivity`, `BudgetResponse`, `ResearchReportDto`. The exact shapes are in plan `core` Task 10.

## 7. Configuration (environment variable names only; values never committed)

| Service | Variables |
|---|---|
| Both | `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BSC_RPC_URL` (default `https://bsc-dataseed.bnbchain.org`), `DEVEX_EVENTS_PATH` (optional) |
| Merchant | `MERCHANT_PUBLIC_URL`, `WALLET_KEYSTORE_JSON` + `WALLET_PASSWORD` (Studio), `REPORT_PRICE_ATOMIC` (5e16), `SWEEP_ENABLED`, `SWEEP_MIN_ATOMIC`, `SWEEP_FLOAT_ATOMIC`, `SWEEP_MAX_ATOMIC`, `SWEEP_MAX_PRICE_IMPACT`, `SWEEP_SLIPPAGE`, `SWEEP_INTERVAL_MS`, `ACTIVITY_PATH`, `ACTIVITY_SEED_PATH`, `PORT` |
| Checkout | `WALLET_MODE` (`api-signer`/`agentic-wallet`), `BUYER_PRIVATE_KEY`, `BAW_BIN`, `AW_PAYS_OWN_MERCHANT`, `MERCHANT_URL`, `LIVE_PASSCODE`, `LIVE_DAILY_MAX_COUNT`, `LIVE_DAILY_MAX_USD`, `RECEIPTS_SEED_PATH`, `RECEIPTS_RUNTIME_PATH`, `WEB_DIST`, `PORT` |

`.env.example` lists the names. `.env` is gitignored, and so is `sharepaymerchant/.studio/`.

## 8. Ops, gates and hosting

**Concierge-owned campaign gates (preflight; never in the manifest):**
- The Binance Web3 API key (permissions Trading, Market, Wallet, Transaction, and B402 if offered) plus the "Apply as Hacker" registration.
- A Render account, and an ngrok account (fallback only).
- Wallets: generate the burner (`npm run ops -- new-burner`, which writes `.env` and prints only the address); the merchant via `cd sharepaymerchant/app/agent && npx bag wallet new --generate-password`; Agentic Wallet sign-in (`baw auth signin`, the user scans the QR).
- Funding: about $10 of USDT plus BNB, sent by the user.
- The submission, the DX form, the public repo flip, and the registration email match (Step 3). The demo video (Step 2.5).

**Manifest human gates** (built by the plans; the orchestrator pauses them):

| Gate | What it covers |
|---|---|
| G1 | Smoke #1 (signed `GET /rwa/tokens` from this PC: code 0 vs 40304), smoke #3 (live Ondo quote: 40375 minimum, and whether a SWAP route appears; quotes only, so the API key is enough) and smoke #4 (third-party unpaid 402s). Results go into the tollgate and `DEVEX_LOG.md`. |
| G2 | Smoke #2: `baw x402-payment preview` of our merchant's real requirement. It decides `AW_PAYS_OWN_MERCHANT`. |
| G3 | Buy shares (burner via `npm run ops -- buy`; AW via `baw market-order swap`) and one-time router approvals (`npm run ops -- approve`). `npm run ops -- verify-funding` checks NVDAB and TSLAB on both payer wallets and BNB on all three; the public addresses and transactions go into `docs/gates/funding.md`. |
| G4 | Deploy the merchant to Render SG (Blueprint), smoke #1 from Render (`/sharepay/health?deep=1`), then register ERC-8004 (`npx bag erc8004 register --endpoint <merchant URL> --name "SharePay Merchant" --description …`; `--no-paymaster` if the relay stalls). The gate confirms that the IdentityRegistry's `ownerOf(agentId)` is the merchant's `payTo` wallet. Fallback: PC plus tunnels if Render returns 40304. |
| G5 | Deploy the checkout to Render SG, then smoke from Render (`/api/health?deep=1`). |
| G6 | Live money-shot rehearsal (AW: NVDAB → report → SPYB), live stock-analyst and CMC payments with shares, a hosted live-mode check, and the export of real receipts into the committed seed files (verified on-chain, at least one paid by the demo wallet on the hosted api-signer path). |

**Ordering:** code tasks never wait on gates. G4 and G5 depend on G1. G6 depends on G2–G5.

**Hosting:**
- `render.yaml` defines two free Singapore web services, Node from `.node-version`, with secrets marked `sync: false`.
- Merchant service: start command `npm run start:merchant` (tsx `sharepaymerchant/app/agent/src/unifiedMain.ts`, cwd `sharepaymerchant/app/agent`); health check `/ping`.
- Checkout service: build command `npm ci && npm run build:web`; start command `npm run start:checkout`; health check `/api/health`.
- Keep-awake: an external 10-minute ping on the checkout only (Oct 8–31 ≈ 576 h). That leaves ≈ 174 h of the 750 h pool for the merchant's wake-on-demand hours. That is ample, because the merchant sleeps 15 min after its last request.
- If `AW_PAYS_OWN_MERCHANT=false` after G2, the money shot runs with `WALLET_MODE=api-signer` locally. It still pays with NVIDIA shares from the burner. The Agentic Wallet pays both third-party merchants on camera.

**Budget (~$10):**

| Wallet / spend | Amount |
|---|---|
| Burner | ~$2.50 NVDAB + ~$0.50 TSLAB + ~$0.60 BNB |
| Agentic Wallet | ~$2.50 NVDAB + ~$0.50 TSLAB + ~$0.40 BNB |
| Merchant | ~$0.60 BNB |
| Payments | ~0.05×6 + 0.10×3 + 0.01×3 ≈ $0.63 |
| **Total** | **≈ $8.2** |

The ≈ $1.8 buffer covers approvals, ERC-8004 gas if it isn't sponsored, and about 4–6 rehearsal reruns. The Ondo smoke only quotes, so it costs nothing.

**Agentic Wallet operations:**
- Only the user signs in; the session is about 48 h. Verify `maxSigninDuration` with `baw wallet settings --json`, and **re-sign-in before recording**.
- Limits are set in the Binance App only, and there is a sample x402 daily limit of $20. The hosted path never depends on the Agentic Wallet.

## 9. DevEx log

- The Binance client writes one JSONL event per attempt to `DEVEX_EVENTS_PATH` (`devex/events.jsonl`, gitignored): `{at, method, path, httpStatus, code, msg, latencyMs}`.
- `npm run devex:summary` rewrites the measured section of `DEVEX_LOG.md`, between `<!-- devex:measured:start -->` and `<!-- devex:measured:end -->`. That section holds per-endpoint calls, error count, p50/p95 latency, and codes with exact messages.
- `DEVEX_LOG.md`'s human sections mirror the DX form: Onboarding; Documentation issues; API pitfalls; AI stack (Agentic Wallet, Agent Studio); Tokenized-stock specifics; Redesign suggestions; Requested capabilities.
- The human starts notes on Thursday, with a Friday-night checkpoint. **The DevEx report itself is written by the human.**

## 10. Testing strategy

- Every code task has exactly one gate: a vitest file run (plus `vite build` or a README conformance check where noted).
- Gates use fakes and **real captured fixtures**: today's live 402 payloads (stock analyst, CMC) and the doc examples (`baw`, x402). No gate touches the live network, a real key, or a secret.
- Signing tests use throwaway keys generated in-test (`generatePrivateKey()`).
- Live behaviour is exercised only in the G1–G6 human gates.
- `npm run typecheck` runs in the final app task.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `40304` from Render SG | G4 detects it; fall back to the PC with an ngrok static domain (checkout) and a cloudflared quick tunnel (merchant), then `bag erc8004 update-endpoint`. |
| The Agentic Wallet refuses our merchant (`BLOCKED_BY_SECURITY_CHECK` etc.) | `AW_PAYS_OWN_MERCHANT=false`: the own item uses the api-signer; AW still pays both third-party merchants. |
| Ondo minimum above cents | Ondo greyed with the reason (`below_min`); still shown in the picker. |
| A third-party merchant is down | Its card shows "Temporarily unavailable"; no mocks. |
| Agentic Wallet session expiry | The hosted path never needs AW; re-sign-in before recording. |
| Cold starts | Boot screen, merchant pre-warm, 90 s probe with retries, SSE reconnect. |
| 5 RPS per endpoint | Pacing (≥ 250 ms), batching, 60 s/30 s caches, 429 backoff. |
| SPYB minimum or route refusal on tiny sweeps | `sweep_skipped` with the reason; retries every 5 min as revenue accumulates. |
| RWA response-shape drift | zod `.passthrough()` schemas; list endpoints accept an array or `{list|items|tokens|rows}`. |
| Docs gaps (RFQ, simulate `status` literal) | RFQ cut. Simulation is treated as failed only when `status` is `FAILED` or `failReason` is non-empty; the raw status is logged to DevEx. |

## 12. Schedule (to the 11 Oct 12:00 UTC lock)

| When | Work |
|---|---|
| Tue 6 night | Spec, plans, manifest and submission draft committed. Concierge preflight can start (API key, wallets, funding). |
| Wed 7 | Orchestrator builds `core`, `merchant` and `buyer`; G1, G2 and G3 as soon as their dependencies land. |
| Thu 8 | `app` and `ops` scripts; G4, G5 and ERC-8004; first live rehearsal; human DevEx notes start. |
| Fri 9 | Fixes, G6 (third-party live payments, receipts seed), README tasks; build green; DevEx checkpoint at night. |
| Sat 10 | Step 2.5 demo video (re-sign-in to AW first); Step 3 closing pass resolves the submission draft; the human writes and submits the DX form. |
| Sun 11 | Buffer. Submit before 12:00 UTC (17:30 IST); flip the repo public after a secret scan; no pushes after lock. |

## 13. Non-goals (beyond the kickoff's out-of-scope list)

- RFQ order execution (D6).
- Our own b402 verify/settle adapter: Studio's `[payments.b402_seller]` rail is the config-only path if credentials arrive.
- ERC-8183 jobs; Wallet Skills beyond the Agentic Wallet CLI; the `binance-tokenized-securities-info` skill at runtime (the RWA Data API covers status).
- Persistent databases.
- Per-visitor accounts.
