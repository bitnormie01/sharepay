# G3 funding: demo shares bought and the router approved (ops:9)

This file covers the funding, buy and approval transactions for the three campaign wallets on BSC mainnet
(chain 56). It holds public identifiers only, never a key or password.

**Run:** 2026-10-10, ~18:12–18:13 UTC. That was a Saturday, with the US equity market closed; every buy
went through 24/7 AMM routes.

## Wallets

| Wallet | Address | Role |
|---|---|---|
| Demo wallet (api-signer) | `0xB89a65d5b5bf0e99E8A3ff74398470e4E153951f` | Pays on the hosted checkout (`WALLET_MODE=api-signer`). Key in the git-ignored `.env` and Render env. |
| Agentic Wallet | `0x72905bF92D6a74414deC2236C5b76e8E7372950f` | Pays the money shot and both third-party merchants (`WALLET_MODE=agentic-wallet`) |
| Merchant (BNB Agent Studio) | `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0` | `payTo` of the SharePay report; settles EIP-3009 payments and sweeps into SPYB |

## Funding (sent by the human)

| To | Amount | Tx |
|---|---|---|
| Demo wallet | 3.1 USDT | _pending: hash from the sender's withdrawal record_ |
| Demo wallet | 0.00081 BNB | _pending_ |
| Agentic Wallet | 3 USDT | _pending_ |
| Agentic Wallet | BNB (0.00054 at 18:04 UTC, 0.000814 at 18:22 UTC) | _pending_ |
| Merchant | 0.00081 BNB | _pending_ |

The amounts are on-chain balances read with `npm run ops -- balances` at 18:04 UTC, before any buy.

## Demo wallet: buys and approvals

All receipts were checked with `eth_getTransactionReceipt` on `https://bsc-dataseed.bnbchain.org`: status
`success` for each.

| Step | Command | Result | Tx |
|---|---|---|---|
| USDT approval to the router (first leg of the NVDAB buy) | `npm run ops -- buy --stock NVDAB --usdt 2.50` | `approve` on USDT, block 126873627 | https://bscscan.com/tx/0xd6645c10159514e89f1a21b546abdf007a2fcc40a31cafc1e693d940b7cd1d43 |
| Buy NVDAB with 2.50 USDT | (same command) | quoted ≈0.01083, minimum 0.01051, **received 0.010837 NVDAB**; router `0xB444…FdDA5`, block 126873635 | https://bscscan.com/tx/0xc0627e0866fb89253a5628457c4553800eb79d90be593ff99fc8783b7678aa58 |
| Buy TSLAB with 0.50 USDT | `npm run ops -- buy --stock TSLAB --usdt 0.50` | quoted ≈0.001306, minimum 0.001267, **received 0.001306 TSLAB**; block 126873657 | https://bscscan.com/tx/0x013418fcc49b64a535eb4b784edc2f97b20b5b92f92367e5b78dff6135f6a047 |
| Approve NVDAB for sale | `npm run ops -- approve` | `NVDAB: approved 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`, block 126873725 | https://bscscan.com/tx/0x57aabe0298d9246d37f37843db50da4e901235c9867dd6ac9ef386b4c8cfde2e |
| Approve TSLAB for sale | (same command) | `TSLAB: approved 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`, block 126873733 | https://bscscan.com/tx/0x122837bf946028abebe7d8c80189efbece324b3cbe6167b4d5df78db37f79f7e |

`approve` skipped the stocks the wallet doesn't hold: AAPLB, SPYB, NVDAon, TSLAon and SPYon.

Gas for these five transactions came to 0.000123 BNB: the balance went from 0.00081 to 0.000687.

## Agentic Wallet: buys (`baw market-order swap`)

| Order | From → to | Result | Tx |
|---|---|---|---|
| `26101000001955689415` (the swap command printed `26101000001955689740`; see the note) | 2.5 USDT → NVDAB | `FINISHED`, `toTokenActualQty` 0.010844824172183502, slippage 1% (auto), booked 18:12:49 UTC; block 126873688 | https://bscscan.com/tx/0xcb9a2955dd82873467b5d97125be9e078ce486d64c4e8372cab9bac9172e2a20 |
| `26101000001955689591` | 0.5 USDT → TSLAB | `FINISHED`, `toTokenActualQty` 0.001306309769327955, booked 18:12:50 UTC; block 126873690 | https://bscscan.com/tx/0x4ca26632ba29e99ce13b14f75c9b92708f37471e489a56389528c7a79612564f |

Both swaps went through `0xb300000b72deaeb607a12d5f54773d1c19c7028d`, the Agentic Wallet's executor.

**Order-id note:** `baw market-order list --orderId 26101000001955689740 --json` returned `total: 0`. The
NVDAB order shows up under `26101000001955689415` in `baw market-order list --json`.

## Verify (gate)

`BAW_BIN=<npm root -g>\@binance\agentic-wallet\dist\index.js npm run ops -- verify-funding` at
2026-10-10 18:22:55 UTC:

```
Burner 0xB89a65d5b5bf0e99E8A3ff74398470e4E153951f: NVDAB 0.010837 · approved for 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 · TSLAB 0.001306 · approved for 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 · BNB 0.000687 → OK
Agentic Wallet 0x72905bF92D6a74414deC2236C5b76e8E7372950f: NVDAB 0.010836 · TSLAB 0.001306 · BNB 0.000814 → OK
Merchant 0x8e8B22406158c2243BC325b4E3b12b34EeB301B0: BNB 0.00081 → OK
PASS
```
