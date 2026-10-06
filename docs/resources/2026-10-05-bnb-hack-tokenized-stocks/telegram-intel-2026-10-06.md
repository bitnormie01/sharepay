# Telegram competitive intel: BNB Hackers Group, 2026-10-06

This report checks whether SharePay (`docs/idea-forge/2026-10-05-sharepay-brief.md`) is still the most
winnable idea before the architect starts.

**Source**
- The builder Telegram ("BNB Hackers Group"), read in the user's own logged-in Telegram Web session.
- The group has one active topic, **General**. Searches for "tokenized", "stock" and "x402" returned hits
  only from General.

**Method (read-only)**
- Nothing was sent, replied to, reacted to, forwarded or joined, and no in-message link was clicked. Only
  the search box was typed into, and the user's "tokenized" filter was restored afterwards.
- The "tokenized" search returned 20 hits, back to Sep 22.
- To catch projects that never use that word, the whole General history from **Jul 6 to Oct 6, 2026**
  was loaded in the page (806 messages) and filtered locally.
- Public repo links were checked with `gh repo view` / `gh api`.
- Times are as Telegram Web showed them (browser local time, IST). Relative day labels are converted to
  dates.
- The "Today" label is Tue 6 Oct.

**Privacy**
- Only project names, public repo and demo links, and the authors' Telegram display names are recorded.
- Phone numbers, emails, wallet addresses and personal identifiers seen in messages or READMEs are
  deliberately left out.
- Everything below is summarized in our own words. Participant claims are marked *(participant claim)*
  and were not verified.

## 1. Projects related to tokenized stocks (15)

Status is relative to `prior-art.md` §1 (14 rivals) plus the about 25 repos from the idea-forge GitHub
pass.

| # | Project | Author (Telegram) | Date | What it does, for whom | Issuers | W3W modules · AW · Studio · x402/b402 · ERC-8004 | Public links (gh: created→pushed) | Stage | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Roost** (earlier: Kibble) | Nerom | Oct 6 (repo since Sep 17) | Retail users "adopt" a creature that is also a trading rule. It buys tokenized stocks from the user's own wallet, with a Telegram buddy for reminders. Its Studio seller agent sells a cross-issuer spread report | bStocks, Ondo | RWA (448 tickers), Trading quote, pre-flight `simulate` (4 outcomes), Agentic Wallet skill. Agent Studio seller: A2A/MCP/x402, ERC-8004 testnet agent #2565, ERC-8183. Its x402 rail is set to `price_usd = "0"`, which bypasses B402 | github.com/neromtoobad/roost (09-17→10-06); roost.nerom.site | Live demo | **ALREADY-KNOWN**, scope grown a lot |
| 2 | **AfterGap** | KellyOX | Sep 26 (updates Sep 29, Oct 1) | Same stock across three wrappers: live gap, overnight-vs-cash reference gap, a plain-English cheapest route, and NL trade execution. For traders | bStocks, Ondo (xStocks inspect) | RWA, aggregator quote, BSC RPC dry-run. The live site falls back to "benchmark" prices because of `40304` | github.com/kellycryptos/AfterGap (09-21→10-05); aftergap.xyz | Live demo | **ALREADY-KNOWN** |
| 3 | **Sharebloom** | Dimka | Oct 5 | Buy and sell tokenized US stocks by chatting on WhatsApp, paid in USDT. It compares the three issuers, fills only at a fair price, and needs a confirm tap. For non-crypto retail | bStocks, Ondo, xStocks | RWA + Trading (per README). No Agentic Wallet or x402 mentioned | sharebloom-production.up.railway.app; probable repo github.com/Yilkash/sharebloom (09-29→10-05, matched by name and README) | Live demo | **NEW** |
| 4 | **bStocks trading agent** | CaptainX (the past "Neural Alpha" builder, per another participant) | Sep 16, Oct 2 | An autonomous, indicator-driven bStocks trading agent on mainnet. It claims about 30 days live *(participant claim)*. A dashboard is being finished | bStocks | Agentic Wallet trading. It pays CMC through x402 (0.01 U a call) about every 2 h, and says this keeps the Agentic Wallet session alive *(participant claim)* | X post only. No public repo found (github.com/ClipXonchain has no stocks repo) | Running live; dashboard in progress | **NEW** |
| 5 | **4lpha Trading Agent: "TradFi model"** | Ken Crypto | Oct 2–3 | AI trading, scheduled buys, auto-DCA, rebalancing and "smart portfolio" on tokenized stocks, inside the 4lpha agent marketplace | bStocks (per the market-data repo) | Binance Web3 market data. The marketplace uses ERC-8004. It asked about Agentic Wallet's 48 h session, so it likely uses AW | github.com/4lphaAI/4lpha-marketplace (08-26→10-06), github.com/4lphaAI/4lpha-market-data (08-10→10-05); 4lpha.tech | Teaser ("coming soon") | **NEW** |
| 6 | **NYXERON** | Kiel Tame | Oct 3 | A nightclub-CEO game where the bar sells real tokenized stocks at a markup instead of drinks | Unspecified | Unknown | X teaser only | Idea/teaser | **NEW** |
| 7 | **Remain** | Deeen_Codes | Oct 6 | Read-only stock discovery. Blocked by `40304` both locally and in CI | Unspecified | RWA/market reads | None | Building (blocked) | **NEW** |
| 8 | **Stock Steward** | dave | Sep 24–25 | Building for this hack. RWA reads work from a dev machine but return `40304` from the deployed server | Unspecified | RWA | None (github.com/Akixama/stock-steward is a Robinhood-Chain project, not matched) | Building | **NEW** |
| 9 | **BIBITalk** stock social + signals | keephope | Sep 21 | AI stock social and signal infrastructure. V1 is done; V2 is meant to add trading, but it hit `40304` from a Cloudflare Worker | Unspecified | Trading API planned | X post | V1 (signals) | **NEW** |
| 10 | **bStocks research desk** (bStocksAgent) | Matthew Chen | Sep 30 | Chinese-language bStock research reports (human `.md` + machine `.json`). It is looking for English-version collaborators | bStocks | None stated | bstock.kkbnb.com; github.com/pinmags/bStocksAgent (not resolvable via gh) | Live site | **NEW** |
| 11 | (unnamed) NVDAon integration | omkar | Sep 27, Sep 30, Oct 5 | An "existing project" adding NVDAon; probing RWA market status and swap routing | Ondo | RWA underlying-market, Trading quote/swap | None | Building | **NEW** |
| 12 | (unnamed) Studio project with a paid x402 face | Alexandre | Sep 22–23 | Wants B402 as a paid x402 endpoint for the Agent Studio special. Falls back to buyer-side self-funding | Unspecified | Agent Studio, x402/B402 | None | Building | **NEW** |
| 13 | (unnamed) "Buy" demo | Teevincs | Sep 30 | Trading API buy flow. Blocked by `40304` from a US Vercel region | Unspecified | Trading, RWA | None | Building | **NEW** |
| 14 | (unnamed) Studio agent | Cengizhan Tekin | Oct 1 | An Agent Studio agent whose free LLM tier (Pieverse `auto/free`) returns HTTP 429 | Unspecified | Agent Studio | None | Building | **NEW** |
| 15 | (unnamed) agent | Hallaku Khan | Oct 2 | An agent. Asked about the 48 h runtime and about showing only testnet transactions in the video | Unspecified | Agent Studio (likely) | None | Early | **NEW** |

**Adjacent, not tokenized stocks.** These are other hacks' marketplaces, kept here because their mechanisms
are relevant:
- **Dolphin** (Joshua, Sep 22): an agent marketplace that auto-swaps the user's BNB into whatever token an
  agent charges (e.g. U) on PancakeSwap, then pays. This is the closest *mechanism* to SharePay's buyer
  leg, but the funding source is BNB, not equities.
- **Veract** (ERC-8004 + x402 work history).
- **MANDATE** (ERC-8183 escrowed hires).
- **4lpha Lending Agent** (Venus).

**Calls to action seen and not acted on** (paraphrased):
- Promos invited readers to start an agent "with just 10 USDC" (4lpha, Oct 2).
- MANDATE asked readers to register a wallet first and hire agents (Oct 4).
- Others asked readers to try their apps or DM them for beta access (Dolphin, MANDATE frontend,
  WenMoonLambo).
- There was an unrelated interview-prep link (Sep 27).

No link was opened, and nothing was connected or signed.

## 2. Organizer / admin answers

Organizer accounts are **Gwen | BNB Chain** (Owner), **Stefano | BNB Chain** (Admin) and **Rose**
(Admin, moderation bot).

| Date (IST) | Who | Topic | Answer (summarized) |
|---|---|---|---|
| Sep 16 | Stefano (Admin) | Launch: "READ THIS FIRST" | It restates the event page: one track, centred on bStocks/Ondo/xStocks, spot only, BSC mainnet, agents scored on build quality not PnL.<br>Dates: lock **Oct 11 12:00 UTC**, judging Oct 12–23, winners the week of Oct 26.<br>Weights: 30 / 25 / 25 / 20, with the DevEx report "required; this hack weights it hard".<br>Repo, demo and deployed link must stay accessible through judging. Restricted regions apply.<br>Its stack list (RWA, market, trading, tx simulation, wallet, DeFi; Agentic Wallet / Wallet Skills; Agent Studio) **does not mention b402**. |
| Sep 16, Sep 18 | Gwen (Owner) | Rate limits | The limit is "already 5 requests per second". Registrations are shared with the team once a day. Ping Gwen if you hit the cap and they'll handle it manually. |
| **Sep 1 and Sep 23** | — | **B402 merchant credentials** | **No public organizer answer.**<br>Two builders independently reported that the B402 credential application form is locked: one saw "you need permission" (Sep 1), the other a no-access notice (Sep 23).<br>On Sep 26 Gwen said some questions were "answered in DMs" and invited questions in the group, but no answer on B402 was ever posted. |
| Sep 22 | — | Demo video optional vs required; Studio agent hosted on testnet with trades on mainnet; DevEx re-submission; key approval time | **No public organizer answer.** One participant claimed keys are self-serve in the dashboard and that more than 300 req/s did not hit 429 *(participant claim)*. |
| Aug 24 (previous hack) | Stefano (Admin) | Agent Studio runtime | Quote: the 48 h managed trial is "by design … not for hosting agents through judging". Recommended path: self-deploy to your own infra ("AWS and Azure are supported"). |
| Aug 27 (previous hack) | Stefano (Admin) | Studio CLI minimums | `bag ≥ 0.0.13`, TS SDK ≥ 0.5.1, Python SDK ≥ 0.4.3. (The pack pins 0.0.14, so it is compatible.) |
| Sep 24 | Stefano / Gwen | Workshop | Gwen ran a live "tools + tips" session for this hack. A recording was posted on BNB Chain's X. *Not watched in this pass.* |
| Oct 1 | Stefano (Admin) | Set and Earn | Set and Earn (to Nov 5) is "two different things and aren't related" to this hack, so it is optional. |
| Sep 7 / Sep 9 (previous hack) | Gwen / Stefano | Repo state | They judge the project as of submission time, and pushing is allowed "only before the deadline". This matches "Repos frozen". |
| — | — | Deadline changes | **None.** The dates were repeated unchanged on Oct 6 by a participant. |

**Reported by participants but unanswered by organizers** (these affect every API-based build):
- **`40304` "Service not available due to compliance restriction"** was hit by 5 teams:
  - from a Cloudflare Worker (Sep 21);
  - from a deployed server (Sep 24–25);
  - from a US Vercel region (Sep 30);
  - from serverless hosting (Oct 1);
  - from GitHub Actions *and* a local machine in Nigeria (Oct 6).

  One participant says the Singapore region works *(participant claim)*. AfterGap's site attributes the
  problem to "serverless datacenter IPs" *(participant claim)*.
- **RWA `marketStatus = "offhours"`** is returned but is not in the documented enum. It was seen with
  `openState=true` and `reasonCode=TRADING` (NVDAon, Sep 27 / Sep 30 / Oct 5).
- **NVDAon got a LiquidMesh `SWAP` route** (`executionMode=SWAP`), although the docs say Ondo is always
  RFQ (Oct 5).
- **Agentic Wallet sign-in expires after about 48 h.** One builder says a periodic x402 call keeps it
  alive *(participant claim)*.
- **The Agent Studio default LLM (Pieverse `auto/free`) returns 429**, per two teams (Oct 1, and Roost's
  README).
- **Creating a dev-portal API key** works only on a desktop-width browser (several users, Oct 2).

## 3. Crowding analysis

This takes the union of the Telegram projects, `prior-art.md` §1 and the idea-forge GitHub pass, counting
BSC entries for this hack only. Some projects sit in more than one cluster.

| Cluster | Entries (examples) | Count | Crowding |
|---|---|:-:|---|
| Cross-issuer gap / fair price / best-execution / weekend gap | closing-bell, executable-gap-desk, sextant, oneticker, Parity, sunday-desk, rwa-stock-arbitrage, alpharadar, AfterGap, equityrelay, afterclose, gapline, equitymux, weekend-gap-tracker, Roost's spread seller, Sharebloom's fair-price fill | ~16 | Saturated |
| Pre-trade guards / safety gates | closing-bell, executable-gap-desk, yostocks, portir, NightDesk, stockguard, kinegate, Bystok | ~8 | Crowded |
| Autonomous trading / DCA / rebalancing agents | CaptainX agent, 4lpha TradFi, portir DCA, Covenant, SignalDesk, pronous, floorbnb (CPPI), bstock-web3-trading-agent | ~8 | Crowded |
| Research / discovery / signals / dashboards | alpharadar, Bystok, steward-bnb, mintmark, bStocks research desk, BIBITalk, Remain | ~7 | Crowded |
| Chat-first trading (Telegram / WhatsApp / NL) | yostocks, Sharebloom, AfterGap NL, Roost Telegram buddy | ~4 | Moderate |
| Gamified consumer | Roost, NYXERON | 2 | Thin |
| LP tooling | rwa-lp, BstocksLP | 2 | Thin |
| x402 around stocks, stablecoin-priced | Roost seller (free), executable-gap-desk, Alexandre (planned), CaptainX paying CMC for data | ~4 | Moderate |
| **Tokenized stocks as the x402 payment source or sweep destination** | **none** | **0** | **Empty: SharePay's angle** |

**Does anyone else use tokenized stocks as an x402 payment source or sweep destination?** No. The nearest
neighbours are:
- **Roost's Studio seller.** It sells a spread report over x402 and currently charges $0, so stocks are
  only the subject of what is sold.
- **Dolphin.** It swaps BNB just in time to pay an agent, but in another hack and without equities.
- **superstock** (X Layer). It tips creators in stock with no x402.

None of them spends or earns *shares*. SharePay's white space holds.

## 4. Head-to-head: SharePay vs the three strongest rivals

The three strongest rivals, judged on evidence of depth and execution, are:
1. **Roost**: a live consumer app with an AW skill, a Studio seller, ERC-8004/8183, simulate, and measured
   data.
2. **executable-gap-desk**: AW fills, an MCP server, a Studio agent and x402.
3. **CaptainX's bStocks agent**: live on mainnet with AW and x402 keep-alive, from a past first-place
   builder.

| Criterion (weight) | vs Roost | vs executable-gap-desk | vs CaptainX agent |
|---|---|---|---|
| Technical implementation (30%) | **Tie.** Both span RWA, Trading, simulate, AW and a Studio seller. Roost has three weeks of measured mainnet data. SharePay adds a real, settled payment leg, which Roost's $0 seller doesn't have. | **Tie.** Comparable depth (AW, Studio agent, x402). SharePay's extra is the share-funded payment pipeline and a self-settling merchant. | **Win on breadth, tie on robustness.** SharePay uses RWA status, SWAP/RFQ, simulate, Wallet, and AW for both swaps and x402. CaptainX's visible stack is AW trading plus CMC x402, but it has about 30 days of live runtime. |
| Creativity & originality (25%) | **Win.** Roost's paid product sells the cross-issuer spread (the saturated cluster), and its buying is rule-based. SharePay is the only entry that spends and earns shares. (Roost's creature framing is original too, so this is a narrower win than the other two.) | **Win.** Gap gates are the saturated cluster and the organizers' own idea list. | **Win.** An indicator trading agent is the crowded "strategy agent" family. |
| Product quality & UX (20%) | **Lose as briefed.** Roost is a polished consumer app with onboarding and a Telegram buddy, while SharePay's briefed surface is a ledger for agent builders. **Narrows to a tie or slight loss after edit 2 below.** | Tie | Tie |
| DevEx report (25%) | Not claimable (human-written). SharePay's build hits the restricted B402 merchant path, `40304` hosting and AW session expiry first-hand, which is specific material. Roost's README already shows measured data. | — | — |

**Result.** SharePay wins Creativity against all three and has no loss on Technical. Its one loss, UX
against Roost, is a surface problem fixable in the brief, not a concept problem.

## 5. Does anything break a SharePay assumption?

1. **B402 merchant access: yes, partly.** The brief planned the merchant leg on b402 `verify`/`settle`,
   with self-settlement only as a fallback. Evidence that the fallback must become the main path:
   - Two builders found the merchant application locked, and nobody posted an answer.
   - The launch FAQ omits b402.
   - The best-developed rival's Studio x402 seller runs at `price_usd = "0"`, which "bypasses B402".
   - Studio's B402 seller supports only "United Stables (U) through EIP-3009" and gets credentials
     "issued per B402 environment".

   So **the merchant settles x402 itself** by submitting the buyer's EIP-3009 `transferWithAuthorization`
   (U or USD1). Both tokens verify on BSC with EIP-712 domain `{name, version "1", chainId 56,
   verifyingContract}`:
   - U is "United Stables" (version derived from `DOMAIN_SEPARATOR` *(this session)*).
   - USD1 is "World Liberty Financial USD".

   b402 stays in the story on the **buyer** side, because SharePay pays live third-party x402 merchants
   that settle through their own facilitator. Our own `/api/v2/b402/*` calls become an upgrade if the
   Portal application is ever approved.
2. **Hosting.** `40304` from serverless and datacenter IPs and some countries means the hosted judge path
   must pass a signed RWA smoke test on day 1 from the exact host region. Singapore is reported to work.
   This affects every rival equally.
3. **Agentic Wallet session.** It lasts about 48 h. SharePay's buyer naturally makes x402 calls, which
   may keep it alive *(participant claim)*. The hosted judge path still must not depend on AW.
4. **Ondo routing.** Ondo may return SWAP routes and an undocumented `offhours` status. The liquidation
   engine must not hard-code "Ondo = RFQ" and must treat unknown statuses defensively.
5. **Agent Studio.** The managed trial is not for judging (organizer, previous hack), and the free LLM
   tier returns 429. The merchant agent must be self-hosted and must not need an LLM to serve the paid
   endpoint.

No rule blocks SharePay, and no rival occupies its angle.

## 6. Verdict: (b) keep SharePay, with edits to the brief

**Re-score** on the same weights (buildability 30, novelty 25, depth/fit 25, WOW/UX 20):

| Candidate | Build ×30 | Novelty ×25 | Depth/fit ×25 | WOW/UX ×20 | Total |
|---|:-:|:-:|:-:|:-:|:-:|
| **SharePay, edited** (self-settling merchant + consumer "ask, paid in shares" surface) | 4 | 5 | 4 | 4 | **425** |
| On-chain 13F copy-portfolios (no Telegram rival; holder-data risk unchanged) | 3 | 4 | 5 | 5 | 415 |
| SharePay as briefed (B402 merchant assumption broken, builder-only UI) | 4 | 5 | 4 | 3 | 405 |
| Gift-a-Share links | 5 | 3 | 3 | 5 | 400 |

Depth/fit drops from 5 to 4 because the b402 merchant endpoints are likely unusable. Edited SharePay still
leads, but by **10 points over 13F**: the margin is real but thin. The edits are what keep it ahead.

**Edits applied to the brief (same commit):**
1. Must-have 2: the merchant **self-settles** x402 `exact` payments (EIP-3009 U/USD1) as the main path.
   b402 `verify`/`settle` and Studio's `[payments.b402_seller]` are used only if credentials are granted.
2. Must-have 3: add a **consumer surface**. A user asks a question about a stock; SharePay buys the
   premium answer over x402 by selling a sliver of their shares, and shows the answer with a
   share-denominated receipt. This is the fix for the UX loss to Roost.
3. Money shot: the payment leg reads "signed EIP-3009 authorization settled on-chain by the merchant"
   instead of "through b402".
4. Feasibility notes, added:
   - `40304` hosting reports and a day-1 smoke test;
   - the EIP-712 domain facts for U/USD1;
   - the observed Ondo SWAP route and `offhours` status;
   - the AW 48 h session behaviour;
   - the Studio trial/LLM limits;
   - a day-1 check that `baw x402-payment` signs a requirement from our own self-hosted x402 merchant.
5. "Why it wins": updated with the Telegram findings and the Roost head-to-head.
