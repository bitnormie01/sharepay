# Idea Forge Brief — SharePay: pay x402 bills with tokenized stocks on BSC

> "SharePay" is a provisional working title, and the builder may rename it. This brief is the single source of
> truth handed to the architect (Step 1). It fixes **what** and **why**, not how. It is a brief, not a spec.

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

Pay x402 bills with tokenized stocks on BSC. An agent wallet holding only bStocks/Ondo sells just enough
shares to settle each HTTP 402 payment through b402. A companion merchant agent sweeps what it earns back
into tokenized stocks.

## Must-have demo features (the minimum that makes the money shot land)

1. **Equity-funded x402 payer (buyer side).** The wallet holds only tokenized stocks.
   - **Choose the leg.** On an HTTP 402 it picks which holding to sell, using a market-status-aware
     liquidation order:
     - RWA Data `statusInfo` (open, closed, paused, limited).
     - Trading API route availability: the bStock SWAP/RFQ mix and Ondo's RFQ-only route.
     - Ondo's minimum order size.
     - It skips anything halted or paused.
   - **Dry-run.** It dry-runs every signed-transaction leg with Transaction API `simulate`.
   - **Sell.** It sells just enough shares via Agentic Wallet `market-order swap`. Judges' hosted path
     uses an API-signed swap instead.
   - **Pay.** It pays via `baw x402-payment preview/sign` (EIP-3009 U/USD1, no approval).
   - **Real merchants.** It must work against the builder's own merchant (feature 2) **and** at least
     one live third-party x402 merchant on BSC mainnet (see the feasibility notes).
2. **Stock-sweeping x402 merchant agent (seller side).**
   - It serves a paid endpoint (x402 V2) that verifies and settles each payment through **b402**
     (`/api/v2/b402/verify` + `/settle`; the facilitator pays the gas).
   - Revenue above a float threshold is swept into a tokenized index (e.g. `SPYB`) through the Trading
     and Transaction APIs.
   - It is built with **BNB Agent Studio** and carries an **ERC-8004 identity on BSC mainnet**.
3. **Plain-language share ledger (the judge-facing surface).** A live web view that shows:
   - **Holdings in shares, not tokens.** Both agents' holdings are multiplier-normalized: bStock
     `uiMultiplier`, Ondo `tokenToShareRatio`.
   - **Receipts.** Every payment reads like "Paid $0.05 with 0.00026 NVIDIA shares", with BscScan links
     and market-status badges.
   - **A "Run a paid call" button** a judge can press. It is a `simulate` dry-run by default; live mode is
     rate-limited and spends cents.

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
  sells via x402, and funds itself through the sweep.

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

**Head-to-head.** The deepest rival is `Assassin859/executable-gap-desk` (Agentic Wallet fills, an MCP
server, a Studio agent and x402).
- **Creativity & originality: SharePay wins.** It chains b402 verify/settle, the RWA market-status feed
  and RFQ/SWAP-aware Trading API execution into one payment pipeline nobody else attempts. Gap gates
  restate the organizers' own idea list.
- **Technical implementation: no clear loss.** SharePay matches that rival's integration depth, and adds
  the b402 merchant leg and Transaction API dry-runs on every SWAP leg.

## Demo money shot (~15 seconds)

1. The buyer agent's balance on screen is **100% NVIDIA shares (NVDAB), zero stablecoins**.
2. It requests the merchant agent's paid endpoint and gets **HTTP 402**.
3. SharePay sells 0.0003 NVDAB and pays 0.05 U through b402. The endpoint returns **200**, and the
   receipt reads "Paid $0.05 with 0.0003 NVIDIA shares".
4. In the other pane, the merchant agent **sweeps the payment into S&P 500 shares (SPYB)**.

That is one HTTP request and three BSC mainnet transactions: shares in, shares out.

Second beat (not the money shot): the same wallet pays a live third-party merchant, BNB Chain's Agent
Studio stock analyst, for an NVDA report, by selling NVDA shares.

## Out of scope (explicit — keeps the build on the money shot)

- **Products:** no perps, leverage or shorting; no lending, borrowing or stocks-as-collateral; no fiat
  on/off-ramps, cards or KYC flows.
- **Contracts and infrastructure:**
  - No custom smart contracts, including no vault and no escrow contract.
  - No own payment facilitator: b402 is the facilitator, and self-settlement is only the documented
    fallback below.
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

**RWA Data API** (§3)
- **Endpoints:** `GET /api/v1/dex/market/rwa/{platforms, price, search, underlying-profile, tokens,
  underlying-market}`. `platformId` ∈ `["ondo","bstock"]` (xStocks is not covered).
- **`statusInfo` fields:**
  - `openState`.
  - `marketStatus` ∈ `premarket, regular, postmarket, overnight, closed, pause`.
  - `reasonCode` ∈ `TRADING, MARKET_CLOSED, MARKET_PAUSED, MARKET_MAINTENANCE, ASSET_PAUSED, ASSET_LIMITED,
    UNSUPPORTED`.
  - `nextOpenTime` / `nextCloseTime` (Unix ms).
- **`tokenToShareRatio`:** "1 token ≈ N underlying shares".
- **Caveat:** `referencePrice` is "derived from the on-chain token price, not an official quote".

**Trading API equity routing** (§4, verbatim)
- "**Ondo tokens** … Always routed via **3-vendor RFQ** (InchFusion + CowSwap + PcsXRfq)."
- "**BStock tokens** … Routed via **LiquidMesh (SWAP) + PcsXRfq (RFQ)** in a mixed result."
- "**xStock tokens** … regular AMM liquidity pools — no RFQ route."

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
  - x402 daily payment cap: the competition doc gives "fixed at 20 USD".
  - Limits are set only in the Binance App.
  - There is **no testnet**.
  - bStock whitelisted tokens "do not consume" the trading limit.

**Live third-party x402 merchants on BSC mainnet** (bStock competition doc)
- **CMC MCP** `https://mcp.coinmarketcap.com/x402/mcp`, about $0.01 a call.
- **BNB Chain Agent Studio stock analyst** `https://stock-agent.bnbchain.org`:
  - Endpoints: `GET /x402/price`, `POST /x402/analyze/async` → `202 {jobId, jobToken}`, `GET
    /x402/jobs/{jobId}`.
  - About 0.1 U a call.
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
1. In the Developer Portal: create the API key with Trading, Market, Wallet, Transaction and B402
   permissions, **and** complete the **B402 Payments application** (its `payTo` is write-once, so choose
   the merchant agent's address first). This is the one dependency with unknown approval latency.
   - **Fallback, a fact rather than a design:** U and USD1 implement EIP-3009 `transferWithAuthorization`.
     The merchant can settle x402 `exact` payments itself, which keeps the money shot builder-controlled
     but drops b402 from the seller leg.
2. Register for the hack (Apply-as-Hacker form) for elevated rate limits.
3. Agentic Wallet sign-in (Binance App MPC wallet).
4. Fund the burner wallets: about $10 total (USDT plus about $1 of BNB for gas).

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
