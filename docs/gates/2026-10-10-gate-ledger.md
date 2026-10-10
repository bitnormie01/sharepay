# Gate ledger: SharePay (BNB Hack: Tokenized Stocks Edition)

This is the campaign's single gate ledger (gate-concierge skill, Stage 3). It is the audit trail of every
consent, account action and transaction. It holds public identifiers only: env-var **names**, addresses,
tx hashes and URLs. It never holds a key, password or passcode, or anything from `.env` or
`sharepaymerchant/.studio/`.

| | |
|---|---|
| Repo | `bitnormie01/sharepay` (private), branch `main` |
| Lock | **Sun 2026-10-11 12:00 UTC** (17:30 IST). Repos freeze at lock: no pushes after it. |
| Opened | 2026-10-10 15:20 UTC, Step 3 **closing** pass. No preflight pass ever ran, so preflight items are inventoried here too. Session `36dbd6ae`. |
| Build | `023227e`: 46/46 code tasks, 44 files / 307 tests, tsc clean for the repo and `packages/web` (Step 2). |

## Campaign rules (mainnet-only)

The kit assumes testnet and burner wallets. This track is BSC mainnet only, so the kickoff's rules replace
the kit's tier examples:

- **Tier C** covers anything that moves real funds, signs or broadcasts a mainnet tx, deploys, or puts a
  private key or secret into a dashboard. The concierge prepares the exact commands and click paths, the
  human performs them, and the concierge then runs the gate's read-only verify and records the evidence.
- **Account creation, sign-ins, CAPTCHAs, and entering API keys or passwords are always the human's.** That
  covers the Binance Developer Portal, Render, Google and `baw auth signin`. The kit's "CAPTCHA/OTP are
  Tier A" does not apply in this campaign.
- **`.env` belongs to the human.** The concierge never opens, prints or commits it. Non-secret values the
  concierge needs for a verify (URLs, the agent id, `BAW_BIN`) are passed **inline as process env vars**.
  Shell env takes precedence over `.env`: `process.loadEnvFile` and `--env-file` never override an existing
  variable (verified in this session with a throwaway file).
- **Consent is per gate.** A "go" for one gate never carries to the next. These are always separate
  consents: filling a form and pressing Submit; the repo flip; the DX report.
- **A failed verify is classified, never retried blindly.** The classes are flake, env, code bug and
  human. A code bug comes back as a proposed fix, never a silent patch.

## Session card (2026-10-10 ~15:10 UTC, session 36dbd6ae)

| Access / row | Result | Evidence |
|---|---|---|
| PowerShell + Bash in the repo | PASS | PowerShell `5.1.26100.9444`; Git Bash |
| Repo sync | PASS | `git pull --ff-only` → "Already up to date." at `023227e`; tree clean |
| `gh` identity (needed by FLIP) | PASS | `gh auth status` → `bitnormie01` (keyring). `gh repo view` → `PRIVATE` |
| Built-in browser | PASS | Opened and read both Google Forms (read-only) |
| Claude in Chrome (tollgate row 5) | **FAIL (degraded)** | `tabs_context_mcp` → "Claude in Chrome is not connected". Fallback: the built-in browser. Fix (yours): in Chrome, open the Claude side panel and sign in. Needed only if you want form work done in your own logged-in Chrome. |
| BSC mainnet RPC, read-only | PASS | `https://bsc-dataseed.bnbchain.org`: `eth_chainId` → `0x38` (56), `eth_blockNumber` → `0x78f91a6` |
| Binance Web3 API host, keyless | reachable, **inconclusive** | Unsigned `GET https://web3.binance.com/api/v1/dex/market/rwa/tokens` → `301` to `https://api.binance.com/api/v1/dex/market/rwa/tokens` → `404`. Whether a signed call behaves differently is exactly what G1 tests. |
| Env store (tollgate row 15) | PASS (`.env` fallback) | `.env` exists at the repo root (172 B, changed 2026-10-10 15:01 UTC). `git check-ignore` → `.gitignore:2:.env`; untracked. **Not opened.** |
| `baw` (stack row S7) | installed, **UNCONNECTED** | `baw --version` → `1.10.0`; `baw wallet status --json` → `{"status":"UNCONNECTED"}` |
| `BAW_BIN` (Windows) | resolved | `C:\Users\victu\AppData\Roaming\npm\node_modules\@binance\agentic-wallet\dist\index.js`, the package's `bin.baw`. The ops plan's `dist/cli.js` does **not** exist. Without `BAW_BIN`, the client's `execFile("baw")` cannot run npm's `.cmd`/`.ps1` shims. |
| `npx bag` (row S5) | PASS | `0.0.14` |
| cloudflared / ngrok (S9 / S10) | not installed | Needed only if Render returns `40304` (G4/G5 fallback) |
| Inbox, wallet extension, computer-use (rows 6–8) | N-A | Signup automation is off by campaign rule; wallets are CLI/keystore, with no browser extension |
| Merchant wallet | not created | The `studio.toml` `[wallet] address` line is still commented out; there is no `sharepaymerchant/.studio/wallets/` |
| Seed files | empty | `data/receipts.seed.json` and `data/merchant-activity.seed.json` both hold `[]` |
| Forms | read | Both the submission and DX forms require a **Google sign-in** ("To fill out this form, you must be signed in") and record the account email. The submission form says "Fill it [the DX report] in before you submit here". |

## Top risks (read first)

1. **Weekend routes are unverified.** Today is Saturday, and US equity markets reopen after the lock.
   - The spec assumes bStock AMM pools trade 24/7 while the RFQ leg closes, and labels that an
     **inference** (spec §4.2).
   - G3 (buys), G6 (sale at checkout, SPYB reinvest) and the live demo all need a SWAP route **today**.
   - It is checked read-only before any money moves: G1's `ondo` smoke covers Ondo, and the `prep G3`
     route check covers NVDAB and TSLAB.
   - If there is no route, stop and re-plan before funding.
2. **Render's disk is ephemeral.** A redeploy, restart or 15-minute idle spin-down wipes `data/runtime/*`
   (receipts, merchant activity).
   - G6 exports must run right after the live payments.
   - **No push may land between a live payment and its `export-seeds`.**
3. **Pushes redeploy Render.** `render.yaml` sets no `autoDeploy`, so Render's default (deploy on every
   commit to `main`) applies.
   - After G4, every ledger or record push I make redeploys both services, with a few minutes of
     downtime and wiped runtime files.
   - I batch pushes and never push during G6 or the recording.
   - If you'd rather I never trigger a deploy, turn Auto-Deploy off in Render and use Manual Deploy.
     G6's seeds then need one manual deploy.
4. **The clock.** G3 → G6 must land **tonight**. See the timeline below.

## Gate summary and recommended order

| # | Gate | Tier | Needs first | Your part | My part | Est. | Status |
|---|---|---|---|---|---|---|---|
| P1 | Binance Web3 API key → `.env` | C | — | create the key, put it in `.env` | G1's signed call is the test | 10 min | **confirm?** |
| G1 | Day-1 smoke (ops:7) | A | P1 | — | 3 smokes, record, verify, commit | 10 min | pending |
| P5 | Demo wallet key + weekend route check (`prep G3`) | A | P1 | — (or run it yourself) | `new-burner`, read-only dry-run quotes | 5 min | pending |
| P2 | "Apply as Hacker" registration | C | P1 | fill + submit | pre-answers | 5 min | **confirm?** |
| P4 | `baw auth signin` | B | — | scan the QR in the Binance app | status / settings / address | 5 min | UNCONNECTED |
| G2 | Merchant wallet + AW preview of our 402 (ops:8) | B | P1, P4 | (the P4 QR) | keygen, local merchant, preview, verify | 20 min | pending |
| G3 | Fund, buy, approve (ops:9) | C | P5, G2 | send ~$10, run buys + approve | balances, dry-runs, poll, record, verify | 45–75 min | pending |
| P3 | Render account + GitHub access | C | — | sign up, connect the repo | — | 10 min | **confirm?** |
| G4 | Merchant on Render SG + ERC-8004 (ops:10) | C | G1, G2, P3 | Blueprint, secrets, register | smokes, BscScan, record, verify | 30–45 min | pending |
| G5 | Checkout on Render SG (ops:11) | C | G4, P5 | secrets, deploy, keep-awake monitor | smoke, UI check, record, verify | 30–45 min | pending |
| G6 | Live rehearsal + recorded-run seeds (ops:12) | C | G2–G5 | live payments + passcode | export, summary, verify seeds | 60–90 min | pending |
| DX | Developer Experience Report | C | G1–G6 (material) | write + submit (human-only) | facts sheet / measured summary on ask | 60–90 min | pending |
| DEMO | Demo video (Step 2.5 demo-studio) | — | G3, G5, G6, P4 | run demo-studio | consume its URL | ~3 h | pending |
| TBD | Resolve README + draft `TBD-post-build` | A | G4, G5, DEMO | — | fill from evidence, commit | 15 min | pending |
| FLIP | Repo private → public | A | TBD | consent | secret scan, `gh repo edit`, verify | 10 min | pending |
| SUB-fill | Fill the submission form | A (+ yours) | DX, FLIP, DEMO | Google sign-in, personal fields | non-personal fields | 15 min | pending |
| SUB-submit | Press Submit | C | SUB-fill | press Submit | verify the confirmation page | 2 min | pending |

**Dependencies (manifest + campaign).**
- G1 needs P1.
- G2 needs P4, plus P1 for the merchant's boot.
- G3 needs P5 and G2.
- G4 needs G1, G2 and P3. Its ERC-8004 `--no-paymaster` fallback also needs the merchant's BNB from G3.
- G5 needs G4 and P5.
- G6 needs G2–G5.
- DX should come after G6, which supplies most of the material, and must come **before** SUB, since SUB
  has a "DX submitted" checkbox.
- SUB needs DX, FLIP, DEMO, and G4/G5 URLs.
- G4 and G5 do **not** need G3. Render work can overlap G3's funding wait.

**What blocks demo-studio (DEMO):**
- G5 PASS: the live checkout URL.
- G3 PASS: funded demo wallet and AW.
- A fresh AW session: re-sign in (P4) right before recording. The session lasts ~48 h.
- Ideally G6 PASS too: the money shot proven once, and seeds so the hosted Simulate mode shows recorded
  runs.

**Timeline to the lock** (now 15:20 UTC = 20:50 IST; 20 h 40 m left):

| UTC | IST | Work |
|---|---|---|
| Sat 15:45–16:15 | 21:15–21:45 | P1 confirmed → G1 → `prep G3` (P5 + weekend route check) · P2 (yours, any time) |
| 16:15–16:45 | 21:45–22:15 | P4 + G2 |
| 16:45–17:45 | 22:15–23:15 | G3 (while funds travel: P3 + G4 Step 1, the Blueprint) |
| 17:45–18:30 | 23:15–00:00 | G4 |
| 18:30–19:15 | 00:00–00:45 | G5 · **checkpoint: G5 PASS by 19:30 UTC** |
| 19:15–20:45 | 00:45–02:15 | G6 · DX notes in the gaps (builds, funding waits, 5-min sweeps) |
| Sun 02:30–05:30 | 08:00–11:00 | DEMO (re-sign in to AW first) |
| 05:30–07:00 | 11:00–12:30 | DX write + submit |
| 07:00–08:00 | 12:30–13:30 | TBD → FLIP → SUB-fill → SUB-submit |
| 08:00–12:00 | 13:30–17:30 | buffer (4 h). **No pushes after 12:00 UTC.** |

**Verdict:** the chain G3 → G4 → G5 → G6 fits, **but only if it runs tonight.**
- If G3's funds haven't landed by ~19:00 UTC, I'll re-plan: G4 and G5 still land tonight, and G3 + G6
  move to Sunday 02:00 UTC at the latest.
- Sunday morning cannot absorb G3–G6 + DEMO + DX + SUB with any margin.

---

## P1 — Binance Web3 API key + secret (preflight)

- **What:** a Developer Portal key with Trading, Market, Wallet and Transaction permissions (plus B402 if
  offered). It goes in `.env` as `BINANCE_API_KEY` / `BINANCE_API_SECRET`.
- **Tier:** C, by campaign rule: portal sign-in, key issuance and key entry are yours.
- **Needs / blocks:** needs nothing. Blocks G1, G2 (merchant boot), G3–G6 and P2 (P2 asks for the account
  behind the key).
- **Your moment:**
  1. Sign in at https://web3.binance.com/en/dev-portal and create the key.
  2. Put both values into `.env` under exactly those names. Keep `DEVEX_EVENTS_PATH=devex/events.jsonl`;
     it feeds the DX measured section.
  3. Tell me "key is in".
- **My part:** none until then. G1's signed `rwa` call is the harmless proof that the key works.
- **Risk:** if the key leaks, rotate it in the portal. `.env` is git-ignored (verified). The portal and API
  check IP region; India is not on the restricted list (event.md §2).
- **Status:** unknown, please confirm. `.env` changed at 15:01 UTC today; I have not opened it.
- **Evidence:** _G1 `rwa` record_

## G1 — day-1 smoke from this PC (ops:7, category secret)

- **Tier:** A, all mine. Every call is read-only (a signed GET, unpaid 402s, quotes).
- **Needs:** P1. Code ops:1 and ops:2 have landed.
- **Commands** (Bash, repo root; the telemetry path is passed inline):
  1. `DEVEX_EVENTS_PATH=devex/events.jsonl npm run smoke -- rwa`
     → `[smoke] rwa: OK — code 0: <n> RWA tokens (<m> on BSC)`
  2. `DEVEX_EVENTS_PATH=devex/events.jsonl npm run smoke -- third-party`
     → `OK — BNB Chain stock analyst (Agent Studio) $0.10 in U; CoinMarketCap $0.01 in U` (~13 s)
  3. `DEVEX_EVENTS_PATH=devex/events.jsonl npm run smoke -- ondo`
     → the Ondo minimum (`40375`) and SWAP availability at $10 (quotes only)
  4. Record the results.
     - `DEVEX_LOG.md` "Smoke checks (day 1)": one row per check (UTC time, "this PC (India)", the result).
       Copy the Ondo summary into "Tokenized-stock specifics" too.
     - Tollgate: set row 19 to **PASS** with the `rwa` line, the time and this session. In the same file,
       stamp this session's card results (row 5 FAIL / degraded, row 15 PASS, row S7 UNCONNECTED). Strike
       that second part if you'd rather not.
  5. Gate: `npm run smoke -- verify rwa third-party ondo` → `PASS`
  6. Commit exactly these files:
     - `docs/gates/smoke/rwa.json`, `third-party.json`, `ondo.json`
     - `DEVEX_LOG.md`
     - `docs/tollgate/2026-10-05-tollgate.md`
     - this ledger

     Message: `chore(gates): G1 day-1 smoke from this PC (signed RWA call, third-party 402s, Ondo quotes)`.
     Push.
- **Your moment:** none (P1 comes first).
- **Risk:**
  - `40304` means this network is region-blocked, and every live step depends on this call. That's
    class env: stop and decide.
  - A 3xx or 404 on the signed call would match today's keyless probe. I'd classify it (base URL/path vs
    auth headers) and bring you a proposed fix.
  - A third-party merchant being down is env/flake. I classify it and don't re-run blindly.
- **Status:** pending (blocked on P1).
- **Evidence:** _rwa: … · third-party: … · ondo: … · verify: … · commit: …_

## P5 — demo wallet key + weekend route check (`prep G3`)

- **What:** `npm run ops -- new-burner` creates the demo (api-signer) wallet.
  - It writes `BUYER_PRIVATE_KEY` into `.env` and prints only the address.
  - It keeps an existing key rather than overwrite it.
  - Then read-only dry-runs prove that today's routes exist before you send money.
- **Tier:** A, on your go. It's key generation only: no funds, no signature. The script edits `.env`
  itself; I never see the value. If you'd rather nothing of mine touches `.env`, run the same command
  yourself.
- **Needs / blocks:** P1 for the quotes. Blocks G3 (the funding target), G5 (key into Render) and G6.
- **Commands** (PowerShell, repo root):
  1. `npm run ops -- new-burner`
     → `Demo wallet created: 0x… (private key written to .env, never printed)`
  2. `npm run ops -- buy --stock NVDAB --usdt 2.50 --dry-run` and
     `npm run ops -- buy --stock TSLAB --usdt 0.50 --dry-run`.
     - The `Buying ≈… with … USDT (… legs …)` line proves a SWAP route exists today.
     - The simulation step (code-verified: `simulateFirstLeg` only calls the Transaction API's simulate,
       never a signer) may fail on the still-empty wallet. If it does, I classify it and re-run after
       funding.
     - `no SWAP route to buy …` means **stop**: we re-plan before any money moves.
- **Risk:**
  - This wallet will hold ~$4 of real funds. Its key exists only in `.env`, and in Render's env after G5.
  - Close `.env` in your editor before I run it: the script rewrites the file, and an unsaved buffer could
    clobber the new line.
- **Status:** pending.
- **Evidence:** _demo wallet address · route-check lines_

## P2 — "Apply as Hacker" registration (preflight)

- **What:** the registration form https://forms.gle/NEmy3FxYc4f5Dua47.
  - Required: team/project name, contact email, "Binance UID, or the email of the Binance account used to
    create your Web3 API key", team size, and the eligibility checkbox.
  - Optional: Telegram, and "What are you thinking of building?".
- **Tier:** C. It is personal data plus an eligibility attestation: you fill it and submit it.
- **Needs / blocks:** needs P1. The organisers match registration, DX and submission by **contact email**,
  so use one address on all three. Registration also raises the API rate limits, which G6 benefits from.
- **Pre-answers:**
  - Team or project name: `SharePay`
  - Team size: `1`
  - What are you thinking of building: "SharePay: pay x402 bills on BNB Chain with tokenized stocks
    (bStocks + Ondo); a BNB Agent Studio merchant settles its own payments and reinvests into SPYB."
- **Risk:** a mismatched contact email means the forms aren't matched. No penalty for late registration is
  published.
- **Status:** unknown. Tell me if you already registered; I record only the date.
- **Evidence:** _registered on <date> (your confirmation)_

## P4 — Agentic Wallet sign-in (`baw auth signin`)

- **Tier:** B. The one moment is the QR scan in the Binance app: it's on-device, and it's a sign-in.
- **Needs / blocks:** needs nothing. Blocks G2 (preview), G3 (AW buys), G6 (money shot) and DEMO.
- **Your moment:** run `baw auth signin` in a terminal and scan the QR with the Binance app.
- **My part** (read-only):
  - `baw wallet status --json` → `CONNECTED`.
  - `baw wallet settings --json` → record `maxSigninDuration`.
  - `baw wallet address --json` → the AW public address, for G3.
- **Risk:** the session lasts ~48 h. A sign-in around 16:00 UTC covers G2–G6 and Sunday's recording, but
  the spec says to re-sign in right before recording. AW limits are set only in the Binance app; the
  sample x402 daily limit is $20.
- **Status:** pending; probed `UNCONNECTED` at ~15:10 UTC.
- **Evidence:** _status · maxSigninDuration · AW address_

## G2 — merchant Studio wallet + Agentic Wallet preview of our 402 (ops:8, category wallet)

- **Tier:** B. The P4 QR sign-in is your only moment. The preview runs `baw x402-payment preview` only;
  it never calls `x402-payment sign`, so nothing is paid.
- **Needs:** P4, plus P1: the merchant refuses to boot without the key (`packages/merchant/src/runtime.ts:23`).
  Code ops:2 and merchant:8 have landed.
- **Commands** (repo root unless noted):
  1. **Merchant wallet** (mine, on your go):
     `Set-Location sharepaymerchant\app\agent; npx bag wallet new --generate-password`.
     - It prints the address, plus `Password stored (0600): …/.studio/.env.local (WALLET_PASSWORD)` and
       `Keystore JSON (0600): …/.studio/wallets/0x….json`.
     - Checked in the CLI source this session: it never prints the key or the password.
     - Then I confirm `[wallet] address = "0x…"` is filled and uncommented in `studio.toml`.
  2. **Local merchant** (mine): run `npm run start:merchant:local` in the background, then
     `curl.exe -i "http://localhost:9000/x402/report?symbol=NVDA"` → `402 Payment Required` with a
     `PAYMENT-REQUIRED` header.
  3. **AW live:** `baw wallet status --json` → `CONNECTED`. If not, you do P4.
  4. **Preview** (mine, read-only):
     `MERCHANT_URL=http://localhost:9000 BAW_BIN='C:\Users\victu\AppData\Roaming\npm\node_modules\@binance\agentic-wallet\dist\index.js' npm run smoke -- aw-preview`
     → a summary ending `AW_PAYS_OWN_MERCHANT=true|false`.
  5. **You:** add `AW_PAYS_OWN_MERCHANT=<value>` and the `BAW_BIN=<path above>` line to `.env`. G6's local
     checkout reads them. Alternatively I pass them inline when G6 starts it.
  6. Gate: `npm run smoke -- verify aw-preview` → `PASS`
  7. Stop the local merchant, so no second instance sweeps once Render runs the same wallet.
  8. Commit exactly `sharepaymerchant/app/agent/studio.toml`, `docs/gates/smoke/aw-preview.json` and this
     ledger.
     Message: `chore(gates): G2 merchant Studio wallet + Agentic Wallet preview of our 402`. Push.
- **Risk:**
  - The merchant key is a real mainnet wallet. Its keystore and password stay in git-ignored
    `sharepaymerchant/.studio/` (`.gitignore` line verified).
  - `NOT_SIGNABLE` / `BLOCKED_BY_SECURITY_CHECK` gives `AW_PAYS_OWN_MERCHANT=false`. That's the designed
    fallback, not a failure: the demo wallet pays our merchant, and the AW pays both third parties.
- **Status:** pending.
- **Evidence:** _merchant address · 402 header seen · preview summary · verify · commit_

## G3 — buy the demo shares and approve the router (ops:9, category wallet)

- **Tier:** C. Real funds: every buy, swap and approve signs and broadcasts on BSC mainnet.
- **Needs:** P5 (the demo address and a passed route check), G2 (merchant address, AW signed in) and P1.
- **Budget** (spec §8, ≈ $10 total):

  | Wallet | Fund with |
  |---|---|
  | Demo wallet | ~3.10 USDT + ~$0.60 of BNB |
  | AW | ~3.00 USDT + ~$0.40 of BNB |
  | Merchant | ~$0.60 of BNB |

- **Your checklist** (I hand you the exact addresses first):
  1. Send the funds **on BSC (BEP-20) only**, to the demo wallet, the AW address and the merchant address.
  2. *(mine)* `npm run ops -- balances` (and `--address <AW>`) confirms they arrived. Read-only.
  3. *(mine)* Re-run both dry-runs → `simulation OK`.
  4. Run `npm run ops -- buy --stock NVDAB --usdt 2.50`, then `npm run ops -- buy --stock TSLAB --usdt 0.50`.
     Each prints the stock received and BscScan links.
  5. Run the AW buys (USDT `0x55d398326f99059ff775485246999027b3197955`):
     - `baw market-order swap --fromTokenQty 2.5 --fromToken 0x55d398326f99059ff775485246999027b3197955 --toToken 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 --binanceChainId 56 --slippage auto --mev true --json` (NVDAB)
     - `baw market-order swap --fromTokenQty 0.5 --fromToken 0x55d398326f99059ff775485246999027b3197955 --toToken 0x5b1910eaad6450e50f816082aa078c41f10c292f --binanceChainId 56 --slippage auto --mev true --json` (TSLAB)
  6. *(mine, read-only)* Poll `baw market-order list --orderId <id> --json` until `FINISHED`.
  7. Run `npm run ops -- approve`. Every held stock prints `approved` or `already approved`.
  8. *(mine)* Write `docs/gates/funding.md`: each address, with its funding, buy and approval tx links, plus
     the verify-funding output. Add your surprises (refusals, slow orders, approval quirks) to
     `DEVEX_LOG.md`.
  9. *(mine)* Gate: `BAW_BIN='…\dist\index.js' npm run ops -- verify-funding` → `PASS`, with every line
     ending in `OK`.
  10. *(mine)* Commit exactly `docs/gates/funding.md`, `DEVEX_LOG.md` and this ledger.
      Message: `chore(gates): G3 demo shares bought and approved, funding recorded`. Push.
- **Tip:** run steps 4, 5 and 7 in the Code tab's **Terminal panel**, so I can read the outputs (tx hashes,
  order ids) directly. I never run them.
- **Risk:**
  - Blast radius is ~$10 of your funds.
  - A withdrawal on the wrong network can be lost.
  - Tiny trades see slippage and minimums. A weekend route refusal shows up in step 3 before any buy.
- **Status:** pending.
- **Evidence:** _funding txs · buy txs · AW order ids · approval txs · verify-funding · commit_

## P3 — Render account + GitHub access (preflight)

- **Tier:** C. Account creation, sign-in and the OAuth grant are yours.
- **Needs / blocks:** needs nothing. Blocks G4 and G5.
- **Your moment:**
  1. Sign up or in at https://dashboard.render.com.
  2. Connect GitHub and grant access to `bitnormie01/sharepay` (repo-scoped is enough; it is private).
  3. If Render asks for a payment method, that step is yours. The Blueprint requests the **free** plan.
- **Status:** unknown, please confirm.

## G4 — deploy the merchant agent (Render Singapore) + register ERC-8004 (ops:10, category deploy)

- **Tier:** C. It deploys, puts secrets into a dashboard, and makes an on-chain registration.
- **Needs:** G1, G2 and P3. The `--no-paymaster` fallback also needs the merchant's BNB (G3 step 1).
- **Your checklist:**
  1. Render → New → Blueprint → `bitnormie01/sharepay`. It reads `render.yaml` and creates
     `sharepay-merchant` and `sharepay-checkout` (free, Singapore).
     - Render asks for every `sync: false` value of **both** services.
     - Fill the merchant's now. Leave the checkout's blank for G5; its first deploy may fail its health
       check until then, which is expected.
  2. `sharepay-merchant` → Environment:
     - `BINANCE_API_KEY`, `BINANCE_API_SECRET`
     - `WALLET_KEYSTORE_JSON`: the full content of the keystore file under `sharepaymerchant/.studio/wallets/`
     - `WALLET_PASSWORD`: from `sharepaymerchant/.studio/.env.local`
     - `MERCHANT_PUBLIC_URL`: the service's own `https://…onrender.com` URL
  3. Deploy, and wait for `/ping` to go green. Tell me the URL.
  4. *(mine, read-only)* `curl.exe -s <URL>/ping`, then
     `MERCHANT_URL=<URL> npm run smoke -- merchant-live`
     → `OK — merchant up at …; signed RWA call from its host: code 0`.
  5. Register, from `sharepaymerchant/app/agent`:
     `npx bag erc8004 register --endpoint <MERCHANT_URL> --name "SharePay Merchant" --description "Sells a deterministic NVDA research report over x402, settles EIP-3009 payments itself and reinvests revenue into SPYB."`
     - It uses the MegaFuel paymaster by default.
     - If the relay stalls, add `--no-paymaster`; the merchant's BNB then pays the gas.
     - Tell me the agent id and tx hash, or run it in the Terminal panel.
  6. *(mine, read-only)*
     `MERCHANT_URL=<URL> MERCHANT_AGENT_ID=<id> npm run smoke -- erc8004`
     → `OK — agent <id> … owned by the merchant wallet 0x…`. Then I confirm the tx on BscScan in the
     built-in browser.
  7. *(mine)* Write `docs/gates/deployments.md`: merchant URL, host/region, deploy date (UTC), agent id and
     `https://bscscan.com/tx/<hash>`. Review the `studio.toml` diff (public values only).
  8. *(mine)* Gate: `npm run smoke -- verify merchant-live erc8004` → `PASS`
  9. *(mine)* Commit exactly `docs/gates/smoke/merchant-live.json`, `docs/gates/smoke/erc8004.json`,
     `docs/gates/deployments.md`, `sharepaymerchant/app/agent/studio.toml` and this ledger.
     Message: `chore(gates): G4 merchant agent deployed (Render SG) and registered on ERC-8004`. Push; this
     triggers a redeploy.
- **Risk:**
  - **`40304` from Render SG** is class env. The plan's fallback is this PC behind cloudflared, which you
    install, but the PC would then have to stay online through judging (Oct 12–23). Better: Frankfurt is
    also outside the restricted list, so switching `render.yaml` `region` is a one-line change. It's a
    code change, so I'd propose it, not make it.
  - A failed build (e.g. missing devDependencies) is class code. I'd bring you a proposed fix.
  - The keystore and password in Render env are readable by anyone with dashboard access.
- **Status:** pending.
- **Evidence:** _merchant URL · merchant-live · agent id · registration tx · erc8004 · verify · commit_

## G5 — deploy the checkout (Render Singapore) (ops:11, category deploy)

- **Tier:** C. The demo-wallet key and the live passcode go into the dashboard.
- **Needs:** G4 and P5.
- **Your checklist:**
  1. `sharepay-checkout` → Environment:
     - `BINANCE_API_KEY`, `BINANCE_API_SECRET`
     - `BUYER_PRIVATE_KEY`: the demo-wallet key from `.env`
     - `LIVE_PASSCODE`: at least 8 characters
     - `MERCHANT_URL`: the G4 URL

     `WALLET_MODE` stays `api-signer`.
  2. Deploy (build `npm ci && npm run build:web`, start `npm run start:checkout`) and tell me the URL.
  3. *(mine, read-only)* `CHECKOUT_URL=<URL> npm run smoke -- checkout-live`
     → `OK — checkout up at … (api-signer): Binance, RPC and merchant reachable`.
  4. *(mine)* In the built-in browser, confirm the catalog shows three cards with live prices, and that
     **Simulate** on "NVDA research report" reaches "Sale checked". Simulate spends nothing.
  5. Create a free external monitor (an account action, so yours; e.g. UptimeRobot or cron-job.org). It
     requests `<URL>/api/health` every 10 minutes and keeps the checkout warm through judging.
  6. *(mine)* Add the checkout URL, host/region, deploy date and monitor name to `docs/gates/deployments.md`.
  7. *(mine)* Gate: `npm run smoke -- verify checkout-live` → `PASS`
  8. *(mine)* Commit exactly `docs/gates/smoke/checkout-live.json`, `docs/gates/deployments.md` and this
     ledger. Message: `chore(gates): G5 checkout deployed (Render SG), deep health green`. Push.
- **Risk:**
  - `40304` → Frankfurt, or the plan's ngrok static-domain fallback (needs your ngrok account).
  - The passcode reaches judges only through the submission form, typed by you.
- **Status:** pending.
- **Evidence:** _checkout URL · checkout-live · UI check · monitor · verify · commit_

## G6 — live money-shot rehearsal + recorded-run seeds (ops:12, category wallet)

- **Tier:** C. These are real live payments, about $0.65, from the AW and the demo wallet. Live mode and
  the passcode are yours.
- **Needs:** G2–G5.
- **Your checklist:**
  1. Set in `.env`: `WALLET_MODE=agentic-wallet`, `AW_PAYS_OWN_MERCHANT=<G2>`, `MERCHANT_URL=<G4 URL>`,
     `LIVE_PASSCODE` and `BAW_BIN`.
  2. Run `npm run build:web`, then `npm run start:checkout:local`, and open http://localhost:8787. I can
     start the server on your go; the payments stay yours.
  3. Switch to **Live**, enter the passcode, choose **NVDA research report**, pick **NVIDIA (NVDAB)** and
     pay. Wait for step 8, "Merchant reinvested in S&P 500 shares".
     - If it shows "Reinvest pending" or "Reinvest postponed: <reason>", the merchant retries every
       5 minutes. Keep the page open.
     - If nothing lands within 15 minutes, pay the report once more. The budget covers 4–6 reruns.
  4. Pay **NVDA full analysis** (stock analyst; 2–5 min), then **NVDA research dossier** (CoinMarketCap).
  5. *(mine, right away; the Render merchant forgets its activity on spin-down or redeploy)*
     `MERCHANT_URL=<G4 URL> npm run ops -- export-seeds --checkout http://localhost:8787`. Every entry
     must verify on-chain; anything skipped is listed.
  6. Open the G5 URL, switch to **Live** with the passcode, and pay **NVDA research dossier** ($0.01) from
     the demo wallet.
  7. *(mine, right away; no push in between)*
     `MERCHANT_URL=<G4 URL> npm run ops -- export-seeds --checkout <CHECKOUT_URL>`. This adds the required
     api-signer receipt.
  8. *(mine)* Run `npm run devex:summary`, if telemetry was on. Add your status and error notes to
     `DEVEX_LOG.md`.
  9. *(mine)* Gate: `npm run ops -- verify-seeds` → `PASS`
  10. *(mine)* Commit exactly `data/receipts.seed.json`, `data/merchant-activity.seed.json`, `DEVEX_LOG.md`
      and this ledger.
      Message: `chore(gates): G6 live rehearsal receipts and merchant reinvest seeded (verified on-chain)`.
      Push: Render redeploys, and hosted Simulate shows the recorded runs.
- **Risk:**
  - The SPYB reinvest may be postponed: sweep minimum, or no weekend route (risk 1).
  - Render's ephemeral disk (risk 2).
  - The stock analyst is slow (2–5 min).
- **Status:** pending.
- **Evidence:** _receipt txs · settlement tx · SPYB sweep tx · export lines · verify-seeds · commit_

## DX — Developer Experience Report (mandatory, 25% of the score)

- **Form:** https://forms.gle/EUQ39xf54GHjC2ys5. It has 8 pages, requires a Google sign-in, and records
  the account email.
- **Tier:** C, human-only. The form says "perfunctory or AI-generated reports are not accepted". You write
  it and you submit it; that is a separate consent.
- **Needs / blocks:** the material comes from G1–G6. It must be submitted **before** SUB-fill.
- **My part** (only when you ask):
  - `npm run devex:summary` rewrites `DEVEX_LOG.md`'s measured section: per-endpoint calls, p50/p95,
    exact error codes and messages.
  - A **facts-only** sheet: smoke results, error strings, tx counts, latencies. No prose.
  - Section-1 pre-answers are in `docs/gates/submission-draft.md`.
- **Your moment:** write it in the gaps between gates tonight, and submit by Sunday ~07:00 UTC. Use the
  same contact email as P2 and SUB.
- **Status:** pending. `DEVEX_LOG.md`'s human sections are still empty.
- **Evidence:** _submitted at <UTC> (your confirmation)_

## DEMO — demo video (Step 2.5, demo-studio; not a concierge gate)

- demo-studio resolves `TBD-post-build:demo-video-url` in `docs/gates/submission-draft.md` and logs its
  upload here. I only consume the URL.
- **Blocked by:** G5, G3, a fresh P4 (re-sign in), and ideally G6.
- **Status:** pending.
- **Evidence:** _video URL · upload log (demo-studio)_

## TBD — resolve the `TBD-post-build` markers (README + submission draft)

- **Tier:** A, mine, from verified evidence only.
- **Needs:** G4, G5 and DEMO; G2/P5 for the addresses.
- **Markers:**
  - `README.md`:
    - L8 demo-video-url
    - L9 live-checkout-url
    - L10 screenshot (a headless-Chrome capture of the live checkout, or a frame from the demo video)
    - L143 merchant-agent-url
    - L144 demo-wallet-address
    - L145 merchant-wallet-address
    - L146 erc8004-registration
  - `sharepaymerchant/README.md`: L10 merchant-agent-url, L11 erc8004-registration
  - `docs/gates/submission-draft.md`: public-repo-url, demo-video-url (from demo-studio), live-checkout-url,
    merchant-agent-url
- **Commit:** those files plus this ledger. Push.
- **Status:** pending.

## FLIP — repo private → public (separate consent)

- **Tier:** A, on your explicit go. It is irreversible in practice: once public, history can be cached or
  forked.
- **Needs:** TBD committed. Must happen before SUB, which requires "public at submission time and stay
  public through judging".
- **Commands:**
  1. `gh auth status` → acting account `bitnormie01` (re-read just before the flip).
  2. Secret scan of **all history**.
     - Every path ever committed must match no `.env`, `.studio/`, keystore or `*.pem` path except
       `.env.example`: `git log --all --name-only --format= | sort -u`.
     - Then a pattern scan (PEM headers, keystore `ciphertext`, raw 64-hex keys outside known tx hashes).
     - With your consent: a script that loads `.env` and `.studio/.env.local` **in memory** and reports only
       which variable **name**, if any, appears in any committed blob. It never prints values.
  3. `gh repo edit bitnormie01/sharepay --visibility public --accept-visibility-change-consequences`
  4. Verify: `gh repo view --json visibility` → `PUBLIC`, and an unauthenticated
     `curl -s -o /dev/null -w "%{http_code}" https://github.com/bitnormie01/sharepay` → `200`.
- **Risk:** anything in history becomes public, hence the scan. If the scan finds a hit, there is no flip;
  the fix is rotating that secret, plus a history rewrite that you decide on.
- **Status:** pending.
- **Evidence:** _scan result · flip time · visibility check_

## SUB-fill / SUB-submit — project submission (two separate consents)

- **Form:** https://forms.gle/yToDUzaDMwWnq6R6A. It needs a **Google sign-in**: either you sign in inside
  the built-in browser pane (Ctrl+Shift+B), or you connect Claude in Chrome.
- **SUB-fill** (A for the non-personal fields; on your go):
  - **Before anything:** I re-read the signed-in Google identity shown on the form, and you confirm it's
    the authorized account.
  - **I fill**, from the resolved `docs/gates/submission-draft.md`: project name, "What did you build?",
    the three track boxes, repo URL, demo URL, and the deployed link plus judge instructions.
  - **You type**: the Email checkbox, contact email (same as P2/DX), prize wallet (ERC-20 or Binance UID),
    Telegram handle, and the **live passcode** inside the deployed-link field. You also tick "Yes, I have
    submitted it" (DX).
- **SUB-submit** (C): you press **Submit**, or tell me to in so many words. I then verify the confirmation
  page ("Your response has been recorded") and log the time.
- **Risk:**
  - One submission per team.
  - Personal fields are never committed.
  - A wrong Google account or a mismatched contact email breaks matching.
- **Status:** pending.
- **Evidence:** _identity checked · filled at · submitted at · confirmation seen_

## After the lock (not gates, but they keep the score)

- No pushes after **12:00 UTC Sun**.
- Keep alive through judging (Oct 12–23; aim for Oct 26): both Render services, the keep-awake monitor,
  and the demo wallet.
- Live mode stops when the demo wallet's ~$3 of shares are spent; Simulate keeps working. A top-up is an
  optional funds action, never a push.

---

## Consent log

| UTC | Gate | Consent / instruction (user's words, abridged) |
|---|---|---|
| 2026-10-10 15:05 | campaign | Kickoff (`KICKOFF_GATES.md`). Granted: built-in browser / Claude in Chrome for reading pages, Render/BscScan checks and form review; PowerShell + Bash in the repo; read-only verify commands against mainnet RPC and the Binance Web3 API. **Not granted:** main wallet, seed phrases, payment details, KYC. No gate consented yet. |

## Account actions

| UTC | Who | Account / service | Action |
|---|---|---|---|
| _none yet_ | | | |

## Transactions (BSC mainnet)

| UTC | Gate | From → to | What | Tx |
|---|---|---|---|---|
| _none yet_ | | | | |
