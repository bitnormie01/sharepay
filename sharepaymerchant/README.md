<!-- readme-schema: R8-minimal v1 -->
# SharePay Merchant Agent

A BNB Agent Studio agent that sells an NVDA research report over x402, settles each payment on-chain itself and reinvests the revenue into S&P 500 shares.

## Demo

The demo video and the live checkout are linked from the [root README](../README.md#demo).

- **Live agent:** https://sharepay-merchant.onrender.com ([A2A agent card](https://sharepay-merchant.onrender.com/.well-known/agent-card.json)), on Render in Singapore.
- **ERC-8004 identity:** agent **370837** on the IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (BSC mainnet), owned by the merchant wallet `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0` ([registration tx](https://bscscan.com/tx/0x9db4d9c5ca745e9463301d2fbb99b9bf0c4cd866dfc9ffc49a16dff8e8a4910d)).
- **A verified payment and reinvest:** settlement [`0x043cf420…9f60`](https://bscscan.com/tx/0x043cf420071fa6826fa496685ea5d78f1c683515c2dc49ef3608521396c89f60), then 0.000064 SPYB bought with the revenue in [`0x3412394d…5753`](https://bscscan.com/tx/0x3412394da02886cf8e7fce3cb2a8212edb6a36d8dd20e47779248d536a805753).

## What it does

This is the seller half of SharePay.
- It charges 0.05 U (or USD1) per NVDA research report through an x402 v2 `exact` payment.
- It verifies the buyer's EIP-3009 authorization and settles it on BSC mainnet from its own Studio wallet. No facilitator is involved.
- It then reinvests what it earned into SPYB, the S&P 500 bStock.

The report is deterministic: no LLM touches a paid request. It is built from the Binance Web3 RWA Data API and covers:
- the company profile;
- market data;
- the market status;
- a cross-issuer comparison of the bStocks and Ondo versions of NVIDIA, with on-chain implied per-share prices and their spread.

## Quickstart

```bash
npm ci                                                        # from the repo root
cp .env.example .env                                          # add BINANCE_API_KEY and BINANCE_API_SECRET
(cd sharepaymerchant/app/agent && npx bag wallet new --generate-password)
npm run start:merchant:local
curl -i "http://localhost:9000/x402/report?symbol=NVDA"       # HTTP 402 with a PAYMENT-REQUIRED header
curl -s "http://localhost:9000/.well-known/agent-card.json"   # A2A card with the sharepay_report skill
```

## Built at BNB Hack: Tokenized Stocks Edition

- Built for BNB Hack: Tokenized Stocks Edition (BNB Chain × Binance Web3 Wallet), and in particular the **Best Use of BNB Agent Studio** special prize: agent identity, autonomous runtime, self-funding via x402.
- Scaffolded with Studio CLI 0.0.14 during the event, 5–11 October 2026, by bitnormie01 (solo builder with an AI build pipeline).

## How it works

- **Scaffold:**
  - Created with `bag init sharepaymerchant --destination self --network bsc-mainnet --wallet-kind evm-local --protocols A2A --rails b402 --seller-price-usd 0 --llm-provider none --storage-provider local`.
  - The generated Express runtime (`app/agent/src/unifiedMain.ts`) mounts `@sharepay/merchant`.
  - The generated LLM work function is replaced by a deterministic one.
  - Studio's own b402 seller rail stays off; turning it on is config-only once b402 credentials exist.
- **Routes:**
  - `GET /x402/report?symbol=NVDA` is the paid report.
  - `GET /x402/report/price` returns the price and the accepted assets.
  - `GET /sharepay/activity` is the activity feed.
  - `GET /sharepay/health?deep=1` is the health check, including a signed RWA call.
  - `/.well-known/agent-card.json` is the A2A card, with the `sharepay_report` skill.
- **Verification**, in order (the first failure wins, and the answer is a fresh 402):
  1. payload shape;
  2. x402 version;
  3. the requirement matches ours;
  4. recipient;
  5. amount;
  6. not yet valid;
  7. expired;
  8. window too long;
  9. nonce format;
  10. nonce already in flight;
  11. EIP-712 signature, using the token's domain from our registry rather than from the client;
  12. nonce already used on-chain;
  13. payer balance;
  14. a Transaction API simulation of the settlement.
- **Settlement:**
  - `transferWithAuthorization` is signed by the Studio wallet (`getWallet()`) as a legacy BSC transaction, under a wallet mutex.
  - It goes out through the Binance Transaction API `broadcast-transaction`.
  - The report is built before any charge, so a report failure never costs the buyer.
- **Reinvest sweeper:**
  - It runs after each settlement and every 5 minutes, one run at a time.
  - It swaps U/USD1 earnings into SPYB over SWAP routes only, approving, simulating and broadcasting each leg.
  - Each sweep is recorded with its transactions in the activity feed. The checkout shows it as "Merchant reinvested in S&P 500 shares".
- **Identity:** an ERC-8004 registration on BSC mainnet (`npx bag erc8004 register`), pointing at the deployed endpoint.

## License

MIT. See [LICENSE](../LICENSE).
