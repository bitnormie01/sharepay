# Idea Forge Brief — SharePay: pay x402 bills with tokenized stocks on BSC

> "SharePay" is a provisional working title, and the builder may rename it. This brief is the single source of
> truth handed to the architect (Step 1). It fixes **what** and **why**, not how. It is a brief, not a spec.
>
> **Revised 2026-10-06** after a read-only pass of the builder Telegram
> (`docs/resources/2026-10-05-bnb-hack-tokenized-stocks/telegram-intel-2026-10-06.md`).
> - B402 merchant credentials look unavailable to hackathon teams, so the merchant now **self-settles**
>   x402 by default.
> - A consumer surface was added. A later 2026-10-06 revision reframed it as a **"Pay with shares"
>   checkout** for 2–3 real x402 digital services; the money shot is now buying an NVDA research report
>   with NVIDIA shares.
> - Hosting (`40304`), Agentic Wallet session, Ondo routing and Agent Studio facts were added.
> - The verdict is unchanged: SharePay still wins the rubric.

## Event + constraints

- **Date written:** 2026-10-05 (idea-forge, Step 0).
- **Hackathon:** BNB Hack: Tokenized Stocks Edition (BNB Chain × Binance Web3 Wallet), $20,000 pool.
  - Event page: https://www.bnbchain.org/en/hackathons/tokenized-stocks?tab=overview
  - Resource pack (pre-verified, read it first): `docs/resources/2026-10-05-bnb-hack-tokenized-stocks/`.
- **Hard deadline.** This is an inert calendar fact. idea-forge does not gate on it; the builder scopes to
  the calendar.
  - **Sun 11 Oct 2026, 12:00 UTC (17:30 IST).** Quote: "Submissions lock. Repos frozen. Videos, links and
    DevEx reports due."
  - Judging runs 12–23 Oct. The repo, the demo and the deployed link must stay reachable through judging.
- **Network rule (verbatim):** "**BSC mainnet only.** Dry-run with the Transaction API while you build,
  then demo with small live amounts. Teams fund their own wallets, and a few dollars is enough to prove
  the flow works." Also "Spot only. Perps are out."
- **Team:** solo builder plus the AI pipeline (architect → executor pool → reviewer).
- **Target tracks:** Main Track, plus both stack specials (see below).
- **Budget:**
  - About **$10 total** of on-chain capital, gas included.
  - Free-tier hosting only. No paid API tiers.
  - The only paid calls are x402 micro-payments of cents, and they come out of that $10.
- **Risk posture:** the builder asked for the highest win probability, so the Novelty/buildability
  weighting is neutral (no ±5 shift).
- **No custom smart contracts.** The whole build runs on Binance Web3 API modules, Agentic Wallet and BNB
  Agent Studio against contracts that are already deployed.
- **DevEx report:** it is mandatory and must be human-written. Quote: "Perfunctory or AI-generated
  reports are not accepted". The build therefore keeps a running `DEVEX_LOG.md` of exact endpoints, error
  strings, latencies and slippage for the humans to write from.

## Problem

x402 is how agents now pay per call on BSC:
- b402 launched on 2026-08-27.
- CoinMarketCap's MCP charges about $0.01 a call.
- BNB Chain's own Agent Studio stock analyst charges about 0.1 U a call.

Every payer has to park an **idle stablecoin float**, and every seller ends up holding idle stablecoins it
must invest by hand. Meanwhile, tokenized stocks (where people actually keep savings) can't be spent at
all. Today an agent treasury, and the person funding it, must choose between holding equities and being
able to pay.

## Solution (one line)

"Pay with shares": a checkout for real x402 digital services on BSC. An agent wallet holding only
bStocks/Ondo sells just enough shares to settle each HTTP 402 payment. A companion merchant agent settles
what it earns on-chain and reinvests it into tokenized stocks.

## Must-have demo features (the minimum that makes the money shot land)

1. **Equity-funded x402 payer (buyer side).** The wallet holds only tokenized stocks.
   - **Choose the leg.** On an HTTP 402 it picks which holding to sell, using a market-status-aware
     liquidation order:
     - RWA Data `statusInfo` (open, closed, paused, limited).
     - Trading API route availability: the bStock SWAP/RFQ mix, and Ondo's documented RFQ route. A
       builder has also observed an Ondo SWAP route, so the code must not assume "Ondo = RFQ".
     - Ondo's minimum order size.
     - It skips anything halted or paused, and treats unknown `marketStatus` values (e.g. the
       undocumented `offhours`) defensively.
   - **Dry-run.** It dry-runs every signed-transaction leg with Transaction API `simulate`.
   - **Sell.** It sells just enough shares via Agentic Wallet `market-order swap`. Judges' hosted path
     uses an API-signed swap instead.
   - **Pay.** It pays via `baw x402-payment preview/sign` (EIP-3009 U/USD1, no approval).
   - **Real merchants.** It must work against the builder's own merchant (feature 2) **and** at least
     one live third-party x402 merchant on BSC mainnet. Those merchants settle through their own
     facilitator, which keeps b402 in the end-to-end flow.
2. **Stock-sweeping x402 merchant agent (seller side).**
   - It serves a paid x402 V2 `exact` endpoint, priced in U (or USD1), and **settles each payment
     itself**: it verifies the buyer's EIP-3009 authorization and submits `transferWithAuthorization`
     on-chain, paying a few cents of gas.
   - This is the main path because B402 merchant credentials look unavailable to hackathon teams (see the
     feasibility notes). If credentials are granted, b402 `verify`/`settle` (or Studio's
     `[payments.b402_seller]` rail) replaces self-settlement with no change to the buyer.
   - Revenue above a float threshold is swept into a tokenized index (e.g. `SPYB`) through the Trading
     and Transaction APIs.
   - It is built with **BNB Agent Studio**, carries an **ERC-8004 identity on BSC mainnet**, and is
     self-hosted. The paid endpoint must not depend on an LLM.
3. **"Pay with shares" checkout for real x402 digital services** (the Product & UX and judge-facing
   surface). This is a live web app.
   - **Catalog.** It lists 2–3 real, live paid services. Each is a real x402 endpoint on BSC mainnet;
     there are no mock merchants.
     - **NVDA research report** from SharePay's own merchant (feature 2), about $0.05. It is assembled
       deterministically from RWA Data (underlying profile and market data, attestation links, issuer
       comparison and market status), with no LLM.
     - **BNB Chain's Agent Studio stock analyst:** a full NVDA report, about 0.1 U.
     - **CoinMarketCap x402:** e.g. the `us_equity_research_dossier` skill via `execute_skill`, about
       $0.01.
   - **"Pay with shares" button** on every item. For anonymous visitors (judges) it is a `simulate`
     dry-run by default. Live mode is rate-limited and spends cents.
   - **Stock picker.** The user chooses which holding pays. It **greys out stocks that can't pay right
     now, and says why**:
     - closed: "Weekend or Holiday", with `nextOpenTime`;
     - paused: e.g. `cash_dividend`, `stock_split`;
     - limited: `earnings`;
     - no live route, or below the Ondo minimum.
     The reasons come from RWA `statusInfo` and the Trading API route check.
   - **Share-denominated receipt**, e.g. "Paid $0.05 with 0.0003 NVIDIA shares", with BscScan links. No
     stablecoins or gas are in view.
   - **Expandable "how it worked" step list**, one step per real event: HTTP 402 received → shares
     quoted → swap simulated → shares sold (tx) → EIP-3009 authorization signed → merchant settled
     (tx) → 200 delivered → merchant reinvested into SPYB (tx, own merchant only).
   - **Ledger view.** It shows holdings in shares, not tokens, multiplier-normalized (bStock
     `uiMultiplier`, Ondo `tokenToShareRatio`), plus the history of receipts.

## Target sponsor track(s)

- **Main Track: Tokenized Stocks Products & Agents.**
  - bStocks are central (NVDAB, TSLAB, SPYB); Ondo is used where order size allows.
  - Spot only, BSC mainnet, small live amounts, and Transaction API dry-runs on every SWAP/approve leg.
  - The "cross-asset" rule covers it (quote): "pairing a tokenized equity leg with crypto or stablecoins".
- **Best Use of Agentic Wallet / Wallet Skills ($2,000).** The criterion is "Deepest, most credible use of
  the AI execution layer". Agentic Wallet sits in the real execution path for both trading (`market-order
  swap`) and paying (`x402-payment`). The `binance-tokenized-securities-info` skill handles resolve and
  status.
- **Best Use of BNB Agent Studio ($2,000).** The criterion is "agent identity, autonomous runtime,
  self-funding via x402". The merchant agent is built with Studio, registers on ERC-8004 (BSC mainnet),
  sells via x402 (self-settled; Studio's B402 seller rail only if credentials are issued), and funds
  itself through the sweep. It is self-hosted, because the managed trial is not meant to host agents
  through judging.

## Judging criteria (published)

From the event page's Tracks tab, "How You're Judged". The text is verbatim; the [BLOG] lists identical
weights:

| Criterion | Weight | What we look at |
| --- | --- | --- |
| **Technical implementation** | 30% | Does it run, and how deep does the integration go? Modules used, error handling, how it holds up. |
| **Creativity & originality** | 25% | Were the APIs used in ways nobody expected? Does this already exist five times over? |
| **Developer Experience Report** | 25% | Specific, actionable, honest, no fluff. Includes the AI stack section. |
| **Product quality & UX** | 20% | Is it usable by the people it is for? Would it bring non-crypto-native users on-chain? |

Other published rules that shape the build:
- Tie-breaks [BLOG]: "Tie-breaks go on depth of W3W API usage first, then the quality of your feedback
  report."
- No PnL scoring [BLOG]: "There's no live PnL scoring."
- The Stack lists Agentic Wallet as "Optional, heavily weighted in scoring and tied to a special prize."
  [EP]
- [EP] "Combining API modules in a way that looks like it should not work but does is exactly what we are
  hoping to see."
- [BLOG] "Judges need to run it. If they can't, you're scored on the video alone."
- Specials: Agentic Wallet is "Deepest, most credible use of the AI execution layer". Agent Studio is
  "Deepest use of Agent Studio: agent identity, autonomous runtime, self-funding via x402."

## Why it wins

**White space.** Prior art is `prior-art.md` §1 plus this session's GitHub pass. That pass found about 25
more tokenized-stock repos, clustered on gap radars, routers, weekend fair value, pre-trade guards, LP
tools, a CPPI vault and decision ledgers. Against all of these, and against Binance's own x402 examples
that pay in stablecoins, SharePay makes tokenized equities both the **funding source and the destination**
of x402 payments. No BSC rival, and no official demo, spends or earns shares this way. The nearest
neighbour is `kimsabin725/superstock` (tipping creators in tokenized stocks on X Layer), which uses no
x402/b402 and is not on BSC.

**Telegram re-check (2026-10-06).** The builder Telegram, read from Jul 6 to Oct 6, adds 15
tokenized-stock projects (13 of them new to us).
- They cluster on cross-issuer gap / fair price (about 16 entries overall), guards, trading/DCA agents,
  research, and chat-first trading (Sharebloom on WhatsApp).
- **No one uses tokenized stocks as an x402 payment source or sweep destination.** The nearest is
  Roost's Agent Studio seller, which sells a spread report over x402 and is currently priced at $0.

**Head-to-head**, against the three strongest rivals:
1. Roost (`neromtoobad/roost`): a live consumer app with an Agentic Wallet skill, a Studio seller and
   ERC-8004.
2. `Assassin859/executable-gap-desk`: Agentic Wallet fills, MCP, a Studio agent and x402.
3. CaptainX's mainnet bStocks agent: Agentic Wallet with x402 keep-alive.

How SharePay compares:
- **Creativity & originality: wins against all three.** It turns the RWA market-status feed,
  RFQ/SWAP-aware Trading API execution and an on-chain x402 settlement into one payment pipeline funded by
  shares. Their angles sit in crowded clusters (spread selling, gap gates, indicator trading).
- **Technical implementation: ties** Roost and the gap desk on depth, and adds a real settled payment leg
  that Roost's $0 seller lacks.
- **Product & UX: loses to Roost as originally briefed.** The "Pay with shares" checkout (must-have 3)
  narrows that to a tie or slight loss. It is a familiar checkout pattern over real merchants, with
  greyed-out reasons and plain-language receipts.

## Demo money shot (~15 seconds)

**Buying an NVDA research report with NVIDIA shares.**

1. The checkout shows **"NVDA research report, $0.05"**. The wallet holds **only NVIDIA shares (NVDAB),
   zero stablecoins**.
2. The user taps **"Pay with shares"**. The picker offers NVIDIA, with any closed or paused stock greyed
   out and its reason shown. The user picks NVIDIA.
3. HTTP 402. SharePay sells 0.0003 NVDAB and signs a 0.05 U EIP-3009 authorization, which the merchant
   settles on-chain. The report unlocks (**200**), and the receipt reads "Paid $0.05 with 0.0003 NVIDIA
   shares".
4. In the other pane, the merchant agent **reinvests the payment into S&P 500 shares (SPYB)**.

That is one checkout and three BSC mainnet transactions: shares in, shares out. The expandable step list
shows each one.

Second beat (not the money shot): the same checkout buys from real third-party x402 merchants with NVIDIA
shares, showing it works with any x402 merchant:
- BNB Chain's Agent Studio stock analyst. Payment is immediate; the report arrives asynchronously in
  about 2–5 minutes.
- A CoinMarketCap call.

## Out of scope (explicit — keeps the build on the money shot)

- **Products:** no perps, leverage or shorting; no lending, borrowing or stocks-as-collateral; no fiat
  on/off-ramps, cards or KYC flows.
- **Checkout scope:**
  - No physical goods and no shipping. The catalog sells digital x402 services only.
  - No fake or mock merchants: every catalog item is a real, live x402 endpoint.
  - No claim beyond "works with any x402 merchant". No "pay anywhere", card network, point-of-sale or
    Binance Pay merchant claims.
- **Contracts and infrastructure:**
  - No custom smart contracts, including no vault and no escrow contract.
  - No general-purpose facilitator service: the merchant settles only its own x402 payments
    (EIP-3009). b402 is used if credentials are granted.
  - No ERC-8183 job escrow (stretch only).
- **Assets:** no xStocks execution (negligible BSC liquidity, and absent from the RWA Data API), at most
  display-only.
- **Agent behaviour:** no trading strategy, signals, PnL optimization or LLM stock-picking. The agent
  sells to pay; it does not trade for profit.
- **Surfaces:**
  - No multi-chain, BSC mainnet only.
  - No mobile app and no Telegram bot.
  - No MCP server or SDK packaging (stretch only, once the money shot is landed).

## Feasibility notes for the architect (primitives, not design)

Transcribed from the resource pack, which names its source per fact. Rows marked *(this session)* were
checked live on 2026-10-05 by idea-forge.

**Binance Web3 API** (`sponsors/binance-web3-wallet.md` §2)
- **Base URL:** `https://web3.binance.com/build`. Every path is `/build/api/v1/...`, and the **signed
  `requestPath` must include `/build`**.
- **Headers:** `X-OC-APIKEY`, `X-OC-TIMESTAMP` (ISO 8601 with ms), `X-OC-SIGN` (Base64).
- **Signature:** `preHash = timestamp + method + requestPath + body`, then `signature = Base64(
  HMAC-SHA256(preHash, secretKey) )`.
- **Key permissions:** keys bind permissions by capability domain. Tick **Trading, Market, Wallet,
  Transaction, B402** when creating the key.
- **Rate limits:** **5 RPS per endpoint** by default. Over the limit you get HTTP 429 + `Retry-After`.
  Batch `/rwa/price` (≤ 100 addresses).
- **Response envelope:** `{"code","msg","data","timestamp"}`; `code` `0` = success.
- **Chain id:** `binanceChainId` = `"56"` for BSC.
- **SDKs:** JS `npm install @binance-web3/wallet` (needs Node `v22.12.0`+, server-side only). Python
  `pip install binance-web3-wallet`. Examples use the env vars `BINANCE_API_KEY` / `BINANCE_API_SECRET`.
- **Region rule:** "IP checks are enforced on both the Developer Portal and the API server side." Host
  any API-calling server **outside** the restricted list (US + territories, CA, NL, GB, IR, CU, KP,
  Crimea/DPR/LPR; JP conditional).
- **`40304` "Service not available due to compliance restriction"** *(Telegram, participant reports, no
  organizer answer)*:
  - Five teams hit it, from a Cloudflare Worker, US Vercel, serverless hosting, a deployed server, and
    GitHub Actions plus a local machine in Nigeria.
  - One participant reports that the Singapore region works.
  - Pick the host by testing it, not by assuming.
- **Organizer on rate limits** (Gwen, Sep 16/18): the limit is "already 5 requests per second". Ping
  Gwen if you hit the cap and they'll handle it manually.

**RWA Data API** (§3)
- **Endpoints:** `GET /api/v1/dex/market/rwa/{platforms, price, search, underlying-profile, tokens,
  underlying-market}`. `platformId` ∈ `["ondo","bstock"]` (xStocks is not covered).
- **`statusInfo` fields:**
  - `openState`.
  - `marketStatus` ∈ `premarket, regular, postmarket, overnight, closed, pause`.
  - `reasonCode` ∈ `TRADING, MARKET_CLOSED, MARKET_PAUSED, MARKET_MAINTENANCE, ASSET_PAUSED, ASSET_LIMITED,
    UNSUPPORTED`.
  - `nextOpenTime` / `nextCloseTime` (Unix ms).
  - `reasonMsg` (these drive the picker's greyed-out reasons, `sponsors/binance-web3-wallet.md` §3):
    - for `ASSET_PAUSED`, one of `cash_dividend, stock_dividend, stock_split, merger, acquisition,
      spinoff, maintenance, corporate action`;
    - for `ASSET_LIMITED`, `earnings`;
    - the common closed case reads "Weekend or Holiday".
- **Undocumented status:** a participant saw `marketStatus = "offhours"` (not in the enum) with
  `openState=true`, `reasonCode=TRADING` for NVDAon *(Telegram, Sep 27 / Oct 5)*.
- **`tokenToShareRatio`:** "1 token ≈ N underlying shares".
- **Caveat:** `referencePrice` is "derived from the on-chain token price, not an official quote".

**Trading API equity routing** (§4, verbatim)
- "**Ondo tokens** … Always routed via **3-vendor RFQ** (InchFusion + CowSwap + PcsXRfq)."
- "**BStock tokens** … Routed via **LiquidMesh (SWAP) + PcsXRfq (RFQ)** in a mixed result."
- "**xStock tokens** … regular AMM liquidity pools — no RFQ route."
- **Observed exception:** a participant got a LiquidMesh `executionMode=SWAP` route for **NVDAon**,
  against the docs' "always RFQ" *(Telegram, Oct 5)*.

**Trading API mechanics** (§4)
- **RFQ flow:** `GET /quote → GET /swap → Sign rfq.typedDataToSign (EIP-712) → POST /order/submit → GET
  /order/{orderId}`.
- `userWalletAddress` is required for RFQ quotes.
- `quoteId` TTL is 30 s (`40401 QUOTE_EXPIRED`).
- `vendor` is required in `/approve-transaction` for equity tokens.
- Retry with the same `requestId` UUID.
- **Error codes:**
  - `40366` Ondo max single order.
  - `40367` Ondo market not tradable.
  - `40368` Ondo must pair with USDT on BSC.
  - `40369` bStock invalid trading time.
  - `40370` bStock counter-token not whitelisted.
  - `40374` insufficient liquidity.
  - `40375` Ondo below minimum USD.
- **Aggregation router (BSC):** `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`.
- **Custom fee:** `feePercent` ≤ 5% is "ignored" on Ondo/bStock RFQ routes.

**Transaction API**
- **Simulate:** `POST /api/v1/dex/pre-transaction/simulate` takes `{binanceChainId, evmTx:{from,to,value,
  data}}` and returns `status`, `failReason`, `balanceChanges[]` and `allowanceChanges[]`. There are no
  state overrides, so the `from` address must actually hold the input.
- **Broadcast:** `POST /broadcast-transaction` takes `{binanceChainId, signedTransaction, address,
  enableMevProtection}`.
- **RFQ legs** are EIP-712 orders, not simulatable transactions (§5 INFERENCE).

**b402 merchant facts** (§6 and the b402 docs)
- **Access status (Telegram, 2026-10-06): treat as unavailable.**
  - Two builders found the B402 credential application form locked: one saw "you need permission" (Sep 1),
    the other a no-access notice (Sep 23).
  - No organizer answered in public.
  - The launch FAQ's stack list omits b402.
  - The most advanced rival's Studio seller runs `price_usd = "0"`, which its config says "bypasses B402".
  - Request access anyway, but don't depend on it.
- **Endpoints:** `POST /api/v2/b402/{supported, verify, settle}`, called from a trusted backend.
- **Onboarding** (verbatim): "complete the B402 Payments application, and configure the write-once
  `payTo` address". Then create an API key in the same project with **B402 Payments** permission.
- **Envelope** (verbatim): "B402 uses an outer request envelope. Sign and send `{"body": ...}`."
- **Methods:**
  - `eip3009` (U, USD1; no approval).
  - `permit2-exact` / `permit2-upto` (any configured ERC-20). These need a one-time approval to the
    canonical Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`.
  - "Configuration returned by `POST /api/v2/b402/supported` is authoritative."
- **Assets (18 decimals):**
  - U `0xcE24439F2D9C6a2289F741120FE202248B666666`
  - USD1 `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d`
  - USDT `0x55d398326f99059fF775485246999027B3197955`
  - USDC `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`
- **Do not confuse the Permit2 contracts.** PancakeSwap's Permit2 `0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768`
  is a different contract.

**Self-settlement facts** *(this session, BSC RPC, 2026-10-06)*
- U and USD1 implement EIP-3009 `transferWithAuthorization` (b402 docs: "supported tokens implement
  `transferWithAuthorization` directly").
- **U EIP-712 domain:**
  - name: `name()` returns `"United Stables"`.
  - version: there is no `version()` or `eip712Domain()` getter. Version **"1"** was derived by matching
    `DOMAIN_SEPARATOR()` = `0x358738403e5a61fdc30a8be78a60f289cbe4d2545b735a344b6229c70c1679b6`.
  - chainId 56; verifyingContract is the token address.
- **USD1 EIP-712 domain:**
  - name: `"World Liberty Financial USD"`.
  - version: **"1"**, derived the same way. `DOMAIN_SEPARATOR()` =
    `0x5d939dc193fd011c5e26fb861450a696546a09db6b26db26501fe354ba3ed4ba`.

**Agentic Wallet** (§8 and the bStock competition doc)
- **Install:** `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet`.
- **CLI:** `baw` from npm `@binance/agentic-wallet` 1.10.0.
- **Sign-in:** the **user** signs in (`baw auth signin --json` → QR → `baw auth verify --qrCodeId <id>
  --json`). The pipeline never does.
- **Swap:** `baw market-order swap --fromTokenQty … --fromToken … --toToken … --binanceChainId 56
  [--slippage auto] [--mev true] --json`, then poll `market-order list --orderId` until
  `FINISHED`/`FAILED`.
- **x402 payment:** `baw x402-payment preview/sign`, then replay the request with the
  `PAYMENT-SIGNATURE` header. Quote: "Prefer U or USD1 to pay — they sign without any on-chain approval."
- **Operational traps:**
  - **"Login expires, and sign-out is silent"**, so judges' runs need a non-AW hosted path. AW stays the
    primary path in the video and in local runs.
  - Builders in Telegram report a session of about 48 h. One says periodic x402 calls keep it alive
    *(participant claim, unverified)*. SharePay's buyer makes x402 calls anyway, but plan for re-sign-in.
  - x402 daily payment cap: the competition doc gives "fixed at 20 USD".
  - Limits are set only in the Binance App.
  - There is **no testnet**.
  - bStock whitelisted tokens "do not consume" the trading limit.

**Live third-party x402 merchants on BSC mainnet** (bStock competition doc)
- **CMC MCP** `https://mcp.coinmarketcap.com/x402/mcp`, about $0.01 a call.
  - It is MCP / JSON-RPC over x402 and **synchronous**: `tools/call` → 402 → sign → replay with
    `PAYMENT-SIGNATURE` → 200, with the data in the SSE `data:` line.
  - A US-equity item for the catalog is `execute_skill` with `unique_name` `us_equity_research_dossier`
    ("Single-stock research dossier"). The free discovery tools (`tools/list`, `find_skill`, `search_*`)
    cost nothing.
- **BNB Chain Agent Studio stock analyst** `https://stock-agent.bnbchain.org`:
  - Endpoints: `GET /x402/price`, `POST /x402/analyze/async` → `202 {jobId, jobToken}`, `GET
    /x402/jobs/{jobId}`.
  - About 0.1 U a call.
  - It is **asynchronous**: payment returns `202 {jobId, jobToken}`, and the report "usually takes 2~5
    minutes" to generate. The checkout must show "paid, report generating", then deliver the report when
    the job succeeds.
  - Limit: 30 calls per rolling hour per wallet.

**BNB Agent Studio** (`sponsors/bnb-chain.md` §2)
- **Install:** `npm install -g @bnbagent/studio-cli` (0.0.14), then `bag skills install`. Needs Node ≥22,
  pnpm 10, Bun 1.3+.
- **Local run:** `bag dev` serves A2A `:9000`, MCP `http://localhost:8000/mcp` and x402 at `/x402`.
- **x402 selling:** a positive `price_usd` "settles through **B402** … before work", with no automatic
  refund.
- **Signing policy** is fixed code: it allows EIP-3009 and denies Permit2 by default.
- **Runtime trap** (verbatim): the managed trial is "Testnet-only" for 48 h. Mainnet needs the self-paid
  `aws`/`azure`/`nodeops` hosts, or a manual `bag erc8004 register --endpoint <url>` for a self-hosted
  endpoint. The `envvars` secrets mode is "testnet only — refused on mainnet".
- **Organizer, previous hack (Stefano, Aug 24):** the 48 h managed trial is "by design … not for
  hosting agents through judging". Self-deploy instead ("AWS and Azure are supported"). Roost runs its
  Studio agent copy on Railway.
- **Studio's B402 seller rail** (from Roost's public `studio.toml`):
  - The config section is `[payments.b402_seller]`.
  - "v1 supports United Stables (U) through EIP-3009 only".
  - Credentials are "issued per B402 environment".
  - `price_usd = "0"` "bypasses B402".
- **Studio default LLM:** Pieverse `auto/free` returns HTTP 429 (two teams), so the paid endpoint must
  not need an LLM.

**ERC-8004 on BSC mainnet** (§3, code-verified)
- IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
- ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.
- Signature: `register(string agentURI)`.
- Registration is gas-sponsored via the MegaFuel paymaster.

**Token addresses** (`sponsors/tokenized-stock-issuers.md` §2, all 18 decimals, symbol verified on-chain)

| Token | Address | Multiplier at fetch |
|---|---|---|
| `NVDAB` | `0x02fca66c1d1afb4e2a7884261eb00f63598a7436` | 1.000778 |
| `TSLAB` | `0x5b1910eaad6450e50f816082aa078c41f10c292f` | 1 |
| `SPYB` | `0x7138b48df7d98d7e3cc221bfe7192d0a178182d8` | 1.00173 |
| `AAPLB` | `0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a` | n/a |
| `NVDAon` | `0xa9ee28c80f960b889dfbd1902055218cba016f75` | n/a |
| `SPYon` | `0x6a708ead771238919d85930b5a0f10454e1c331a` | n/a |

- bStock getters: `uiMultiplier()`, `balanceOfUI(address)`.
- Ondo shares-per-token comes from `SyntheticSharesOracle` `0xF4Fd8a1B412633e10527454137A29Db7Aa35F15e`.

**Liquidity** *(this session, GeckoTerminal, 2026-10-05)*

| Pool | Reserve | 24h volume |
|---|---|---|
| NVDAB/USDT PCS v3 0.25% `0x8fb4243b553ac29ba088acf00b9b7da24bd6690c` | about $4.38M | n/a (pack figure) |
| TSLAB/USDT 0.25% | about $1.94M | n/a |
| SPYB/USDT PCS v3 0.01% | about $252k | about $454k |
| U/USDT 0.01% | about $19.1M | n/a |
| USD1/USDT 0.01% | about $5.3M | n/a |

So the stock → USDT → U/USD1 path and the sweep back into SPYB are executable at demo sizes. Ondo pools
are idle (Ondo is RFQ-only), and the Ondo minimum (`40375`) is unknown until the first live quote.

**Day-1 external dependencies** (user actions, request immediately)
1. In the Developer Portal: create the API key with Trading, Market, Wallet and Transaction permissions,
   plus B402 if the portal allows it. Use a desktop-width browser; participants report the create button
   is hidden on mobile.
   - **Optionally** apply for B402 merchant access. Its `payTo` is write-once, so pick the merchant
     agent's address first.
   - The build does **not** wait on B402: the merchant self-settles by default.
2. Register for the hack (Apply-as-Hacker form) for elevated rate limits.
3. Agentic Wallet sign-in (Binance App MPC wallet).
4. Fund the burner wallets: about $10 total (USDT plus about $1 of BNB for gas).

**Day-1 smoke checks** (gate the build on these, cheapest first)
1. A signed `GET /build/api/v1/dex/market/rwa/tokens?binanceChainId=56` from the **exact hosting region**
   returns `code 0`, not `40304`.
2. `baw x402-payment preview` accepts a requirement from **our own** self-hosted x402 V2 `exact` merchant
   (U, `eip155:56`), not only from B402-configured merchants.
   - If it doesn't, the buyer pays our merchant with a locally signed EIP-3009 authorization on the API
     path.
   - Agentic Wallet then pays only the third-party merchants.
3. A live quote for one Ondo leg reveals the `40375` minimum and whether a SWAP route appears.
4. Each third-party catalog merchant answers with a live 402 and an `accepts` list today, at no cost:
   - the Agent Studio stock analyst via `GET /x402/price`;
   - CMC via an unpaid `tools/call`.
   An item that doesn't respond is dropped from the catalog, not mocked.

**Longest pole.** The liquidation-order engine has to choose correctly across market sessions, RFQ
versus SWAP, Ondo minimums, halts and multiplier normalization, and every failure path must stay
human-readable. Give it the highest reasoning effort. Everything else is client code against fixed,
documented endpoints.

## Rubric mapping (why this won, for the record)

**Weights.** The kit rubric (`references/ideation-rubric.md`) was re-mapped to mirror the published 30 /
25 / 25 / 20:
- **Intrinsic buildability 30.** This is the highest single weight (floor 30) and covers "Does it run".
- **Creativity / Novelty 25.**
- **Integration depth & track fit 25.** The human-written DevEx report's raw material and the tie-break
  ("depth of W3W API usage") both scale with how many modules the build exercises; Agentic Wallet is
  "heavily weighted".
- **Demo WOW + UX 20.**

Risk posture is neutral.

**Divergence and gate.**
- The field held 32 candidates across 13 seeds. The bolder pass rewrote the 9 most generic ones and kept
  both versions:
  - equity-treasury agent → SharePay;
  - baskets → creator basket links;
  - dividend radar → dividend paycheck;
  - statement → proof-of-returns card;
  - stocks-as-LP → weekend-only LP;
  - leash → KYA for securities;
  - voice broker → call-your-broker;
  - limit orders → order pooling for Ondo minimums;
  - gifting → stock red packets.
- Three were knocked out at the gate:
  - The **earnings-calendar agent**: its money shot needs a real earnings event inside the window.
  - **Card-to-stock onboarding**: it needs a fiat ramp, KYC and a minimum purchase above the budget.
  - **Borrow against your stocks**: no BSC lending market lists stock tokens, so it would need a toy
    protocol.

**Top survivors** (scores 1–5; total out of 500):

| Candidate | Build ×30 | Novelty ×25 | Depth/fit ×25 | WOW/UX ×20 | Total |
|---|:-:|:-:|:-:|:-:|:-:|
| **SharePay: x402 payments funded by and swept into tokenized stocks** | 4 | 5 | 5 | 4 | **450** |
| On-chain 13F: copy real-time stock portfolios of BSC wallets | 3 | 4 | 5 | 5 | 415 |
| Gift-a-Share claim links / stock red packets | 5 | 3 | 3 | 5 | 400 |
| Creator basket links with on-chain fee share | 4 | 3 | 5 | 4 | 400 |
| Shariah-screened investing with multiplier-based dividend purification | 4 | 4 | 4 | 4 | 400 |
| Yield-to-stocks: DeFi API interest buys equities | 4 | 3 | 5 | 3 | 380 |

**Pressure test** (top 3):
- **SharePay:**
  - Its only external dependency is the B402 onboarding latency, and there is a builder-controlled
    fallback.
  - Live x402 merchants already exist on BSC mainnet.
  - Liquidity for every leg was confirmed today.
  - The judge path avoids the silent Agentic Wallet sign-out.
- **On-chain 13F was downgraded on buildability by a live probe:**
  - Of the 40 most active NVDAB wallets (trades over $500 in about 2.5 h), only 5 hold three or more
    verified stock positions of at least $1.
  - The largest verified stock book is about $398.
  - The holder ranking that might surface real "superinvestors" needs the API key, so the money shot is
    unconfirmed.
  - Copy-trading also sits next to Binance's own documented copy-trader use case, which raises the risk
    of duplicate entries.
- **Gift-a-Share** is clean but shallow on API depth and novelty.

SharePay won the head-to-head on Creativity with no clear loss elsewhere. Committed.

**Re-check, 2026-10-06** (Telegram intel; same weights)

| Candidate | Build ×30 | Novelty ×25 | Depth/fit ×25 | WOW/UX ×20 | Total |
|---|:-:|:-:|:-:|:-:|:-:|
| **SharePay, edited** (self-settling merchant + "Pay with shares" checkout) | 4 | 5 | 4 | 4 | **425** |
| On-chain 13F copy-portfolios (no Telegram rival; holder-data risk unchanged) | 3 | 4 | 5 | 5 | 415 |
| SharePay as first briefed (B402 merchant assumption broken, builder-only UI) | 4 | 5 | 4 | 3 | 405 |
| Gift-a-Share claim links | 5 | 3 | 3 | 5 | 400 |

- Depth/fit drops from 5 to 4 because our own b402 `verify`/`settle` calls are likely unavailable.
- Novelty stays 5: the Telegram pass found no rival funding or settling x402 with shares.
- The lead over 13F is now 10 points. The two edits (self-settlement as the main path, and the consumer
  surface, now a "Pay with shares" checkout over real x402 merchants) are what keep SharePay ahead, so
  they are must-haves, not polish.
- The checkout reframe changes no score: it is the same mechanism and the same UX axis, shown through a
  more familiar pattern.
- Verdict: **keep SharePay, with edits.**
