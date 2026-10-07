# Submission draft — BNB Hack: Tokenized Stocks Edition

The platform form, pre-answered by the architect (Step 1) from the brief and the spec. Field names and order
follow the project submission form ([SUB] https://forms.gle/yToDUzaDMwWnq6R6A, verbatim in
`docs/resources/2026-10-05-bnb-hack-tokenized-stocks/event.md` §3.1).

How the open items get filled:
- `TBD-post-build:<what>` lines are build outputs. Step 2.5 (demo-studio) fills the demo video. The Step-3 closing pass fills the rest.
- Personal fields are typed by the human at paste time and **never committed**: contact email, prize wallet, Telegram handle, live passcode.

Submit only after the Developer Experience Report (mandatory, 25% of the score), which the human writes in
its own form ([DX] https://forms.gle/EUQ39xf54GHjC2ys5). Raw notes are in `DEVEX_LOG.md`.

**Deadline:** Sun 11 Oct 2026, 12:00 UTC (17:30 IST). One submission per team. Repos freeze at lock.

---

## Team or project name *(required)*

SharePay

## Contact email *(required)*

Entered at paste time. Use the same address as the registration form and the DX report; the organisers match all three by it.

## Wallet address (ERC-20) *(required)*

Entered at paste time: the prize wallet on BNB Smart Chain (or a Binance UID). It is not the demo wallet, and never a private key.

## Telegram handle *(optional)*

Entered at paste time, with the `@`.

## What did you build? *(required — "What it does, who it is for, which parts of the Binance Web3 API you used, and which tokenized stocks it touches.")*

SharePay is a "pay with shares" checkout for x402 services on BNB Chain. A wallet that holds only tokenized stocks pays real HTTP 402 bills by selling just enough shares at checkout. The merchants are real:
- our own NVDA research report, sold by a BNB Agent Studio merchant agent;
- BNB Chain's Agent Studio stock analyst;
- CoinMarketCap's MCP research dossier.

**How a payment works:**
1. A picker reads RWA Data market status, issuer minimums and live SWAP routes to choose which stock can pay. Any stock it skips gets a plain-English reason, for example "Paused: stock split" or "Market closed and no 24/7 route".
2. The Trading API sizes and executes the sale.
3. The Transaction API simulates every leg before it is broadcast.
4. The wallet signs an EIP-3009 payment in U.

The same flow runs through the Binance Agentic Wallet (`baw market-order swap` plus `x402-payment preview/sign`).

**The merchant side.** Our merchant agent is registered on ERC-8004. It verifies each payment, settles it on-chain itself with no facilitator credentials, and reinvests what it earns into S&P 500 shares (SPYB). The money shot: buy an NVDA research report with NVIDIA shares, then watch the merchant put the proceeds into the S&P 500.

**Who it is for:** agents and people who keep their savings in tokenized equities, but need to pay per call without parking an idle stablecoin float.

**Binance Web3 API used:**
- RWA Data: tokens, price, search, underlying profile and market. These drive the picker, prices, share multipliers and the deterministic report.
- Trading: quote, swap, approve-transaction.
- Transaction: simulate, gas price, gas limit, broadcast-transaction.
- Wallet: token balances.
- b402 settlement, through the two third-party merchants.
- Binance Agentic Wallet CLI.
- BNB Agent Studio: project scaffold, Studio wallet, A2A card, ERC-8004 identity.

**Tokenized stocks:**
- bStocks: NVDAB (NVIDIA), TSLAB (Tesla), AAPLB (Apple) and SPYB (S&P 500, the reinvestment target).
- Ondo: NVDAon, TSLAon and SPYon, evaluated by the picker alongside the bStocks, including Ondo's minimum order size.
- Everything runs on BSC mainnet with no custom smart contracts.

## Which tracks are you applying for? *(required — checkboxes)*

- [x] Main track: Tokenized Stocks Products & Agents
- [x] Best Use of Agentic Wallet / Wallet Skills ($2,000)
- [x] Best Use of BNB Agent Studio ($2,000)

## Public repository URL *(required — "It has to be public at submission time and stay public through judging.")*

TBD-post-build:public-repo-url

(Expected: https://github.com/bitnormie01/sharepay, once flipped public after the secret scan.)

## Demo video URL *(required — "Four minutes or less. Check the sharing settings: if a judge cannot open it, it does not count.")*

TBD-post-build:demo-video-url

## Deployed link, or instructions a judge can run *(required — "A live URL is best. Add anything a judge needs to test it, but never share private keys or seed phrases.")*

TBD-post-build:live-checkout-url
TBD-post-build:merchant-agent-url

Instructions for judges:
- Open the live checkout, choose **NVDA research report**, pick a stock and press the button.
- **Simulate mode** is the default and spends nothing. It runs the real price check, the share quote and an on-chain simulation through the Binance Transaction API. It then shows the most recent recorded live run, with its sale, settlement and reinvestment links on BscScan.
- **Live mode** pays for real with a few cents of shares from our demo wallet. The live passcode is entered at paste time (never committed). There is a cap of 10 live payments and $1.50 per UTC day, and live payments run one at a time.
- The free host sleeps when idle, so the first visit can show "Starting SharePay…" for up to a minute.
- To run it yourself, follow the README Quickstart (an API key is needed; no private keys are shared).

## Developer Experience Report *(required — checkbox "Yes, I have submitted it")*

- [ ] Yes, I have submitted it. The human ticks this only after sending the DX form; the report is human-written.

---

### DX form, section 1 (factual pre-answers; every other section is the human's own report)

| Question | Answer |
|---|---|
| Team or project name | SharePay |
| Contact email | Entered at submit time (same as registration) |
| Public repository URL | TBD-post-build:public-repo-url |
| Which Binance Web3 API modules or tools did you use? | RWA Data API, Trading API, Transaction API, Wallet API, b402 Payments, Agentic Wallet / Wallet Skills, BNB Agent Studio |
| Team size | 1 |
| Prior Binance Web3 API use | The human answers |
