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
   - **Update, 17:38 UTC (G1):** Ondo is OK on the weekend. NVDAon has 1-leg LiquidMesh AMM SWAP routes at
     $0.05 and $10, with status `offhours`, `openState: true`. bStocks (NVDAB, TSLAB, SPYB) remain
     unchecked until `prep G3`.
   - **Update, 17:47 UTC (prep G3):** bStocks quote on the weekend too.
     - `Buying ≈0.01083 NVDAB with 2.50 USDT (1 leg, minimum 0.01051)`
     - `Buying ≈0.001305 TSLAB with 0.50 USDT (1 leg, minimum 0.001266)`
     - SPYB is still unchecked; it is first quoted by G6's sweep.
5. **Code bug found (prep G3, 17:46 UTC): `approve-transaction` schema mismatch.** It blocks G3, G5's
   Simulate check, G6 and the SPYB sweep.
   - `GET /api/v1/dex/aggregator/approve-transaction` answers HTTP 200, code 0, with a **one-element
     array**: `[{ data, dexContractAddress: 0xB44446…FdDA5, gasLimit: "70000", gasPrice }]`.
   - `ApproveTxSchema` in `packages/core/src/binance/trading.ts` expects a bare object, and the test
     fixture in `packages/core/test/trading.test.ts:80` is an object too. So every approval throws
     `schema mismatch: Expected object, received array` before anything is signed.
   - Callers: `buyer/src/wallets/apiSigner.ts:43` (sale/buy), `buyer/src/wallets/simulate.ts:31`
     (dry-run, Simulate), `merchant/src/sweeper.ts:57` (SPYB reinvest), `scripts/lib/wallets.ts`
     (`ops approve`).
   - Proposed fix: accept either the object or a non-empty array (first item). It is under G3 below and
     awaits your go. No silent patch.
   - **Fixed, 18:04 UTC** (you said "fix approve" at ~18:01 UTC).
     - `ApproveTxSchema` is now `z.union([object, nonempty array → first item])`. Two tests were added
       (the live array fixture, and an empty-array rejection).
     - `npm run check` → tsc clean, 44 files / **309** tests pass. `tsc -p packages/web` → clean.
     - Live re-check: both dry-runs → `Dry-run (approve_only): simulation OK`.
     - Commit: `fix(core): accept the live one-element array from approve-transaction`.
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
| P1 | Binance Web3 API key → `.env` | C | — | create the key, put it in `.env` | G1's signed call is the test | 10 min | **done** 17:37 (renamed; G1 `rwa` code 0) |
| G1 | Day-1 smoke (ops:7) | A | P1 | — | 3 smokes, record, verify, commit | 10 min | **done** 17:40 (PASS) |
| P5 | Demo wallet key + weekend route check (`prep G3`) | A | P1 | — (or run it yourself) | `new-burner`, read-only dry-run quotes | 5 min | **done** 17:47 (routes OK; approve bug found) |
| P2 | "Apply as Hacker" registration | C | P1 | fill + submit | pre-answers | 5 min | **not registered** (17:35) |
| P4 | `baw auth signin` | B | — | scan the QR in the Binance app | status / settings / address | 5 min | **done** ~18:02 (session until 2026-10-12 18:02 UTC) |
| G2 | Merchant wallet + AW preview of our 402 (ops:8) | B | P1, P4 | (the P4 QR) | keygen, local merchant, preview, verify | 20 min | **done** 18:05 (PASS; `AW_PAYS_OWN_MERCHANT=true`) |
| G3 | Fund, buy, approve (ops:9) | C | P5, G2 | send ~$10, run buys + approve | balances, dry-runs, poll, record, verify | 45–75 min | **done** 18:23 (PASS); funding hashes pending |
| P3 | Render account + GitHub access | C | — | sign up, connect the repo | — | 10 min | account exists; repo access unchecked |
| G4 | Merchant on Render SG + ERC-8004 (ops:10) | C | G1, G2, P3 | Blueprint, secrets, register | smokes, BscScan, record, verify | 30–45 min | **done** 19:23 (PASS; agent 370837) |
| G5 | Checkout on Render SG (ops:11) | C | G4, P5 | secrets, deploy, keep-awake monitor | smoke, UI check, record, verify | 30–45 min | **done** 19:46 (PASS); monitor pending (yours) |
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

**Revised timeline** (17:35 UTC = 23:05 IST; 18 h 25 m left; the start slipped ~2 h, so G6 moves to
Sunday morning):

| UTC | IST | Work |
|---|---|---|
| Sat 17:45–18:15 | 23:15–23:45 | P1 rename → G1 → `prep G3` (P5 + weekend route check) · P2 (yours) |
| 18:15–18:45 | 23:45–00:15 | P4 + G2 |
| 18:45–19:45 | 00:15–01:15 | G3 (while funds travel: G4 Step 1, the Blueprint) |
| 19:45–20:30 | 01:15–02:00 | G4 |
| 20:30–21:15 | 02:00–02:45 | G5 · **checkpoint: G5 PASS by 21:30 UTC (03:00 IST)** |
| Sun 01:30–03:00 | 07:00–08:30 | G6 (re-sign in to AW if needed) |
| 03:00–06:00 | 08:30–11:30 | DEMO |
| 06:00–07:30 | 11:30–13:00 | DX write + submit (or earlier, in tonight's gaps) |
| 07:30–08:30 | 13:00–14:00 | TBD → FLIP → SUB-fill → SUB-submit |
| 08:30–12:00 | 14:00–17:30 | buffer (3.5 h). **No pushes after 12:00 UTC.** |

**Revised verdict:** this still fits, provided **G3's funding lands tonight**.
- If G3 has to move to Sunday as well, Sunday becomes ~8.5 h of work in ~10.5 h, with no real margin.
- If you push G6 through tonight instead (done by ~22:45 UTC / 04:15 IST), Sunday gains ~1.5 h of buffer.

**Original timeline** (superseded; kept for the record. At 15:20 UTC = 20:50 IST, 20 h 40 m were left):

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
- **Status:** key issued, but stored under the **wrong names** (17:35 UTC).
  - Checked at your request with a names-only parse (Node's `util.parseEnv`; no values or lengths
    printed).
  - Present: `KEY_NAME`, `API_KEY`, `SECRET_KEY`, `B402_Payments`, all set.
  - Absent: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `DEVEX_EVENTS_PATH`, plus everything else from
    `.env.example`.
  - The code reads only `BINANCE_API_KEY` / `BINANCE_API_SECRET` (`scripts/smoke.ts`, `scripts/ops.ts`,
    `packages/merchant/src/runtime.ts`).
  - **Fix (yours):** rename `API_KEY` → `BINANCE_API_KEY` and `SECRET_KEY` → `BINANCE_API_SECRET`, and
    add `DEVEX_EVENTS_PATH=devex/events.jsonl`. Then I re-run the names-only check.
- **Evidence:**
  - 17:37:51 UTC, names-only re-check: `BINANCE_API_KEY` set, `BINANCE_API_SECRET` set,
    `DEVEX_EVENTS_PATH` set. The remaining extra names (`KEY_NAME`, `B402_Payments`) are unused.
  - G1 `rwa` → code 0. **Done.**

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
- **Status:** **done**, 2026-10-10 17:40 UTC. You consented with "run G1" at 17:37 UTC.
- **Evidence:**
  - `rwa` at 17:38:18 UTC: `OK — code 0: 488 RWA tokens (488 on BSC)`. No `40304`: this PC's network is
    not region-blocked.
  - `third-party` at 17:38:27 UTC: `OK — BNB Chain stock analyst (Agent Studio) $0.10 in U; CoinMarketCap $0.01 in U`.
    - Stock analyst: `payTo` `0xd10bddc20e4dc42a1a19a9653e994991e25b8153`, timeout 600 s.
    - CoinMarketCap: `payTo` `0x3C5f3a6cE224BB89D72f5EB4232ecC27F67B3eeA`, timeout 500 s.
    - Both use `eip3009`.
  - `ondo` at 17:38:48 UTC: `OK — NVDAon $0.05: SWAP route (1 leg); $10: SWAP route (1 leg)`.
    - Route vendor: LiquidMesh. No `40375` minimum.
    - Status: `offhours`, `openState: true`, `reasonCode: TRADING`.
    - The no-vendor quote returns `40368` `ONDO_STABLECOIN_PAIR_INVALID` inside HTTP 200; the LiquidMesh
      retry succeeds.
  - Verify: `npm run smoke -- verify rwa third-party ondo` → `PASS` (exit 0).
  - Recorded in: the `DEVEX_LOG.md` smoke table and Ondo notes; tollgate row 19 → PASS, plus the
    session-card stamps on rows 5, 15 and S7.
  - Commit: see the git log, `chore(gates): G1 …`.

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
- **Status:** **done**, 17:47 UTC (you said "prepare G3" at 17:43 UTC).
- **Evidence:**
  - `Demo wallet created: 0xB89a65d5b5bf0e99E8A3ff74398470e4E153951f (private key written to .env, never printed)`.
    The names-only re-check shows `BUYER_PRIVATE_KEY` set and the API keys intact.
  - Route check: NVDAB and TSLAB both quote 1-leg SWAP routes on a Saturday (lines in risk 1).
  - Both simulations stop at the `approve-transaction` schema mismatch (risk 5): class **code bug**, not
    the wallet being empty.

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
- **Status:** not registered yet (you, 17:35 UTC). Do it as soon as the key is renamed; it takes ~5 min.
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
- **Status:** **not signed in.**
  - Probed `UNCONNECTED` at ~15:10 UTC.
  - At 17:43 UTC you reported you were signed in, but this machine's `baw` answered `wallet status` →
    `SERVICE_ERROR "illegal parameter"` and `wallet address` → `SESSION_EXPIRED "Please log in first."`.
  - At 17:46 UTC: `status` → `UNCONNECTED`, `address` → `NOT_LOGGED_IN`.
  - Class human/env: the sign-in did not complete for this CLI. Redo `baw auth signin` here. If it returns
    a `qrCodeId` before the scan finishes, run `baw auth verify --qrCodeId <id>`.
- **Update, ~18:02 UTC: signed in** (you redid the sign-in).
  - `baw wallet status --json` → `CONNECTED`.
  - AW BSC address: **`0x72905bF92D6a74414deC2236C5b76e8E7372950f`**.
  - `baw wallet settings --json`: `maxSigninDuration` `48h`, `sessionExpireTime` `2026-10-12T23:32:29+05:30`
    (18:02 UTC Oct 12), `signInMaxTime` 2026-10-17, `x402DailyLimit` 20 (0 used), `dailyLimit` 50000,
    `abnormalTxnHandling` `AutoReject`.
  - The session covers G3, G6 and Sunday's recording.
- **Evidence:** CONNECTED · 48h · `0x7290…950f` ✓

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
- **Status:** in progress (you said "run G2" at 17:43 UTC).
  - Step 1 done, 17:44 UTC: the merchant wallet is **`0x8e8B22406158c2243BC325b4E3b12b34EeB301B0`**.
    - The keystore is `sharepaymerchant/.studio/wallets/0x8e8B…01B0.json`; the password is in
      `sharepaymerchant/.studio/.env.local`.
    - Both are git-ignored (`sharepaymerchant/.gitignore:5`).
    - The `studio.toml` diff is a single `address = "0x8e8B…01B0"` line.
  - Step 2 done, 17:45 UTC:
    - The first start failed with `MERCHANT_PUBLIC_URL is required`: class env, because `.env` holds only
      the keys.
    - The restart passed `MERCHANT_PUBLIC_URL=http://localhost:9000 SWEEP_ENABLED=false` inline. With
      sweeping off, this local copy never sweeps with the new key.
    - `GET /x402/report?symbol=NVDA` → `402 Payment Required` with `PAYMENT-REQUIRED`: x402 v2, `exact`
      on `eip155:56`, amount `50000000000000000` in U (`0xce24…6666`) or USD1 (`0x8d0d…0b0d`),
      `payTo` `0x8e8B…01B0`, timeout 300 s.
  - Steps 3–4 done, 18:03 UTC (after P4). `MERCHANT_URL=http://localhost:9000 BAW_BIN=<…\dist\index.js> npm run smoke -- aw-preview`
    → `OK — ACTION_REQUIRED (INSUFFICIENT_BALANCE) → AW_PAYS_OWN_MERCHANT=true`.
    - Both options (U, USD1) are `ACTION_REQUIRED` / `INSUFFICIENT_BALANCE`: the AW holds no U yet, and
      the checkout sells shares into U first. Neither is `NOT_SIGNABLE`, so the AW can pay our merchant on
      camera.
  - Gate: `npm run smoke -- verify aw-preview` → `PASS`.
  - The local merchant was stopped; its leftover `node` child, PID 22668, was verified as `unifiedMain.ts`
    and stopped. Port 9000 is free.
  - **Yours for G6:** add `AW_PAYS_OWN_MERCHANT=true` and
    `BAW_BIN=C:\Users\victu\AppData\Roaming\npm\node_modules\@binance\agentic-wallet\dist\index.js` to
    `.env`, or I pass them inline when G6 starts the local checkout.
- **Status:** **done**, 18:05 UTC.
- **Evidence:** merchant address ✓ · 402 header ✓ · preview `AW_PAYS_OWN_MERCHANT=true` ✓ · verify PASS ✓ ·
  commit `chore(gates): G2 …`

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
- **Blocked by the approve bug (risk 5) until the fix lands.** Steps 3, 4 and 7 all call
  `approve-transaction`. The AW buys (step 5) go through `baw` and don't use our code path.
- **Proposed fix**, in `packages/core/src/binance/trading.ts` (+ one test):
  - Change: rename the current object schema to `ApproveTxObjectSchema`. Make `ApproveTxSchema` a
    `z.union([ApproveTxObjectSchema, z.array(ApproveTxObjectSchema).nonempty().transform((items) => items[0])])`.
  - Test: add a `packages/core/test/trading.test.ts` case with today's live array fixture.
  - Verify: `npx vitest run packages/core/test/trading.test.ts`, then `npm run check` (tsc + full suite),
    then both dry-runs again.
  - Commit: `fix(core): accept the live one-element array from approve-transaction`.
- **Addresses for step 1:**
  - Demo wallet `0xB89a65d5b5bf0e99E8A3ff74398470e4E153951f`
  - Merchant `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0`
  - AW `0x72905bF92D6a74414deC2236C5b76e8E7372950f`
- **Step 1 done** (you reported it at ~18:01 UTC). Balances read on-chain at 18:04 UTC:
  - Demo: USDT 3.1 + BNB 0.00081
  - AW: USDT 3 + BNB 0.00054
  - Merchant: BNB 0.00081
  - The funding tx hashes go into `funding.md` in step 8.
- **Step 3 done** (18:04 UTC, after the fix): NVDAB 2.50 → `≈0.01083 NVDAB`, `simulation OK`; TSLAB 0.50 →
  `≈0.001308 TSLAB`, `simulation OK`.
- **Watch:** verify-funding needs ≥ 0.0005 BNB per wallet. The AW starts at 0.00054, so its two swaps
  could leave it just under that. If so, top up ~0.0003 BNB (~$0.25).
- **Risk:**
  - Blast radius is ~$10 of your funds.
  - A withdrawal on the wrong network can be lost.
  - Tiny trades see slippage and minimums. A weekend route refusal shows up in step 3 before any buy.
- **Status:** pending.
- **Status:** **done**, 18:23 UTC. You ran steps 1, 4, 5 and 7 (reported "G3 done on here on terminal"
  at ~18:20 UTC). I read the outputs from the Terminal panel.
- **Evidence** (all in `docs/gates/funding.md`):
  - **Demo-wallet txs:** the USDT approval, the NVDAB and TSLAB buys, and the two router approvals. All
    receipts are `success`.
  - **AW orders:** `26101000001955689415` (NVDAB, `FINISHED`; the swap command printed `…689740`) and
    `…689591` (TSLAB, `FINISHED`). Both receipts are `success`.
  - **Verify:** `npm run ops -- verify-funding` → `PASS`, with all three wallets `OK`.
  - **Pending:** the five incoming funding tx hashes. BscScan sits behind a Cloudflare bot check in the
    built-in browser, which I don't solve. The public RPC refuses `eth_getLogs` (`-32005 limit exceeded`).

## P3 — Render account + GitHub access (preflight)

- **Tier:** C. Account creation, sign-in and the OAuth grant are yours.
- **Needs / blocks:** needs nothing. Blocks G4 and G5.
- **Your moment:**
  1. Sign up or in at https://dashboard.render.com.
  2. Connect GitHub and grant access to `bitnormie01/sharepay` (repo-scoped is enough; it is private).
  3. If Render asks for a payment method, that step is yours. The Blueprint requests the **free** plan.
- **Status:** the account exists (you, 17:35 UTC). GitHub access to the private repo is checked when you
  create the Blueprint in G4.

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
- **Status:** in progress. You applied the Blueprint (Render sync of `6437aa0`, ~18:42 UTC).
  - **Merchant:** `sharepay-merchant` was created and is live at **https://sharepay-merchant.onrender.com**.
    - `/ping` → `200 {"status":"HEALTHY"}`.
    - `/sharepay/health` → `payTo` `0x8e8B…01B0`, `eip155:56`, $0.05, sweep on.
  - **Checkout:** `sharepay-checkout` → "Failed deploy". This is expected: `BUYER_PRIVATE_KEY` and
    `MERCHANT_URL` are still blank, and `packages/checkout/src/config.ts:67` and `:70` throw at boot. The
    build very likely passed, since the merchant boots through the devDependency `tsx`. It gets fixed in G5.
  - **Found 18:56 UTC, class env:** the deployed 402 says `resource.url: null/x402/report?symbol=NVDA`.
    `MERCHANT_PUBLIC_URL` on Render is the literal `null` (`routes.ts:42` builds it from the variable).
    Fix (yours): set it to `https://sharepay-merchant.onrender.com` and save, which redeploys. Then the
    smokes and registration follow.
- **19:03 UTC:** you fixed `MERCHANT_PUBLIC_URL`. The 402 now reads
  `resource.url: https://sharepay-merchant.onrender.com/x402/report?symbol=NVDA`.
- **19:04 UTC:** `MERCHANT_URL=https://sharepay-merchant.onrender.com npm run smoke -- merchant-live` →
  `OK — merchant up at https://sharepay-merchant.onrender.com; signed RWA call from its host: code 0`.
  Render Singapore is not region-blocked, so no tunnel fallback is needed.
- **Agent card (class env, yours):** `/.well-known/agent-card.json` reports `"url":"http://localhost:9000/"`.
  - `agentCard.ts:128–130` uses `AGENTCORE_RUNTIME_URL` and otherwise falls back to localhost.
  - Fix: in Render, set `sharepay-merchant` → `AGENTCORE_RUNTIME_URL=https://sharepay-merchant.onrender.com/`.
  - It is not a code change, and it doesn't block registration (the registry stores the endpoint).
- **19:04 UTC, registration refused by `bag`'s gas pre-check; nothing was broadcast:**
  `error: ERC-8004 register needs gas to broadcast, but 0x8e8B…01B0 holds only 0.00081 BNB on bsc-mainnet (need ~0.002). Fund a little tBNB and retry — get tBNB via Telegram …`.
  - Class env/funding.
  - Fix (yours): send ~0.0015 BNB to the merchant `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0`.
  - DX note: the mainnet error advises a testnet tBNB faucet.
- **~19:13 UTC:** you sent BNB to the merchant and set `AGENTCORE_RUNTIME_URL` ("go, sent BNB and set the
  card URL"). The merchant's balance read 0.00231 BNB at 19:14 UTC.
- **19:14 UTC, registration (concierge, on your G4 approval):**
  `npx bag erc8004 register --endpoint https://sharepay-merchant.onrender.com --name "SharePay Merchant" --description "…"`.
  - It went out through the MegaFuel relay. After ~5 min `bag` reported
    `pending: tx_hash=0x9db4d9c5…a4910d broadcast but not confirmed yet`.
  - **No retry.** The RPC showed the tx mined in block 126881993 (19:15:09 UTC) with status `0x1`, gas
    price 0 (sponsored), merchant nonce 0 → 1, BNB unchanged.
  - The receipt shows an ERC-721 mint from `0x0` to `0x8e8B…01B0`, tokenId **370837**.
    `bag erc8004 show` → `agent_id: 370837`.
- **`studio.toml`:** `bag` left a stale `pending_*` `[identity]` block. I replaced it by hand with the
  fields `bag` itself writes after a confirmed register (`identityWriteback`: `endpoint`, `registered_at`,
  `agent_id`, `last_register_tx`). `bag erc8004 show` still parses it.
- **19:22 UTC:** `MERCHANT_URL=… MERCHANT_AGENT_ID=370837 npm run smoke -- erc8004` →
  `OK — agent 370837 on the ERC-8004 IdentityRegistry is owned by the merchant wallet 0x8e8B…01B0`.
  The agent card's `url` is now `https://sharepay-merchant.onrender.com/`.
- **Gate:** `npm run smoke -- verify merchant-live erc8004` → `PASS`.
- **Status:** **done**, 19:23 UTC.
- **Evidence:** merchant URL ✓ · merchant-live ✓ · agent id 370837 ✓ · registration tx `0x9db4d9c5…a4910d`
  ✓ · erc8004 ✓ · verify PASS ✓ · commit `chore(gates): G4 …`

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
- **Status:** **done**, 19:46 UTC. You set the checkout's env on Render ("run G5, env vars set on render",
  ~19:42 UTC).
- **Evidence:**
  - **URL:** https://sharepay-checkout.onrender.com, `/api/health` → `version 0.1.0+5478de1`, `api-signer`,
    buyer `0xB89a…951f`.
  - **Smoke:** `CHECKOUT_URL=… npm run smoke -- checkout-live` → `OK — … (api-signer): Binance, RPC and merchant reachable`
    (deep: binance `488 RWA tokens (code 0)`, rpc reachable, merchant `HTTP 200`).
  - **UI check (built-in browser):** three cards ($0.05 / $0.10 / $0.01). The picker shows NVIDIA 0.01084
    and Tesla 0.001306 shares. **Simulate** on "NVDA research report" reached "Sale checked: The sale
    was simulated on BSC and succeeds" (nothing signed or broadcast). "No recorded live run yet" until G6.
  - **Verify:** `npm run smoke -- verify checkout-live` → `PASS`.
  - **Monitor:** _pending (yours, an account signup)_.

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
- **Pre-G6 fix, ~20:05 UTC** (you said "fix order poll"):
  - **Bug:** `createBawClient().order()` polled only `market-order list --orderId <printed id>`. In G3 that
    returned `total: 0` for the NVDAB order (printed `…689740`, listed `…689415`), so an Agentic Wallet sale
    could stall as PENDING until its timeout.
  - **Fix:** when the by-id lookup is empty, it matches the earliest unclaimed order in
    `market-order list --json` with the same tokens and quantity, booked no earlier than 120 s before the
    swap started, and caches that id for later polls.
  - **Tests:** 2 added (the live G3 fixture, and no match → PENDING). The live-fixture test fails on the old
    code. `npm run check` → 44 files / **311** tests; web tsc clean.
  - **Commit:** `fix(buyer): find the Agentic Wallet order when the printed orderId is not listed`.
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
| 2026-10-10 17:35 | P1 | "check .env is available with api keys setup": a names-only check, run once. Result is in P1. No gate run. |
| 2026-10-10 17:37 | G1 | "renamed the keys, run G1" → G1 executed (names-only re-check, 3 smokes, verify, commit). |
| 2026-10-10 17:43 | G2, prep G3 | "baw is signed in with wallet, check and run G2, then prepare G3" → G2 steps 1–2 run; the preview is blocked (baw not signed in on this machine). prep G3 run: P5 `new-burner` + read-only dry-runs. |
| 2026-10-10 ~18:01 | fix, G2, G3 step 1 | "fix approve and I have loaded all 3 wallet (baw is logged in …)" → approve fix applied and verified; G2 finished; read-only balance and dry-run checks for G3. |
| 2026-10-10 ~18:20 | G3 | "G3 done on here on terminal" → I read the Terminal panel, polled the AW orders, verified receipts, wrote `funding.md`, ran verify-funding and committed. |
| 2026-10-10 ~19:02 | G4 | "run G4. run commands yourself autonomously (I approve you to do so)" → the concierge runs G4's commands itself, including `npx bag erc8004 register`: one mainnet identity tx from the merchant key, moving no funds. Scope: **G4 only.** It does not extend to entering keys or secrets into dashboards, or to any trade or live payment. |
| 2026-10-10 ~19:13 | G4 | "go, sent BNB and set the card URL" → registration run, confirmed on-chain, gate verified, committed. |
| 2026-10-10 ~19:42 | G5 | "run G5, env vars set on render" → health probes, smoke, UI check incl. a Simulate run (no spend), verify, commit. |
| 2026-10-10 ~20:00 | pre-G6 | "so everything is working end-to-end as expected, right?" → status answer (no execution). Then "fix order poll" → baw order-poll fix + tests, committed. |

## Account actions

| UTC | Who | Account / service | Action |
|---|---|---|---|
| before 15:01 | you | Binance Web3 Developer Portal | API key + secret issued and put in `.env` (under `API_KEY` / `SECRET_KEY`) |
| before 17:35 | you | Render | Account exists (reported by you) |
| ~17:36 | you | local `.env` | Renamed `API_KEY` → `BINANCE_API_KEY` and `SECRET_KEY` → `BINANCE_API_SECRET`; added `DEVEX_EVENTS_PATH` |
| 17:44 | concierge | merchant Studio wallet | `npx bag wallet new --generate-password` → `0x8e8B22406158c2243BC325b4E3b12b34EeB301B0` (keystore + password in git-ignored `.studio/`) |
| 17:46 | concierge | demo wallet | `npm run ops -- new-burner` → `0xB89a65d5b5bf0e99E8A3ff74398470e4E153951f` (key written to `.env` by the script; never printed) |
| ~18:02 | you | Binance Agentic Wallet | `baw auth signin` completed (48 h session) |
| ~18:42 | you | Render | Blueprint `exs-db58dcl9fdbs73bvfbcg` from `bitnormie01/sharepay` (`main`). It created `sharepay-merchant` (live) and `sharepay-checkout` (failed deploy, expected until G5); merchant secrets entered by you |
| ~19:00 | you | Render | `sharepay-merchant`: `MERCHANT_PUBLIC_URL` fixed (was `null`) |
| ~19:12 | you | Render | `sharepay-merchant`: added `AGENTCORE_RUNTIME_URL=https://sharepay-merchant.onrender.com/` |
| ~19:40 | you | Render | `sharepay-checkout` env set: API key/secret, `BUYER_PRIVATE_KEY` (demo wallet), `LIVE_PASSCODE`, `MERCHANT_URL`. Live at 19:43 UTC |

## Transactions (BSC mainnet)

| UTC | Gate | From → to | What | Tx |
|---|---|---|---|---|
| before 18:01 | G3 step 1 | you → demo `0xB89a…951f` | 3.1 USDT + 0.00081 BNB | _hashes → funding.md_ |
| before 18:01 | G3 step 1 | you → AW `0x7290…950f` | 3 USDT + 0.00054 BNB | _hashes → funding.md_ |
| before 18:01 | G3 step 1 | you → merchant `0x8e8B…01B0` | 0.00081 BNB | _hashes → funding.md_ |
| ~18:12 | G3 step 4 | demo → USDT | approve router `0xB444…FdDA5` | `0xd6645c10159514e89f1a21b546abdf007a2fcc40a31cafc1e693d940b7cd1d43` |
| ~18:12 | G3 step 4 | demo → router | 2.50 USDT → 0.010837 NVDAB | `0xc0627e0866fb89253a5628457c4553800eb79d90be593ff99fc8783b7678aa58` |
| ~18:12 | G3 step 4 | demo → router | 0.50 USDT → 0.001306 TSLAB | `0x013418fcc49b64a535eb4b784edc2f97b20b5b92f92367e5b78dff6135f6a047` |
| ~18:12 | G3 step 5 | AW → executor | 2.5 USDT → 0.010844824 NVDAB (order `…689415`) | `0xcb9a2955dd82873467b5d97125be9e078ce486d64c4e8372cab9bac9172e2a20` |
| ~18:12 | G3 step 5 | AW → executor | 0.5 USDT → 0.001306310 TSLAB (order `…689591`) | `0x4ca26632ba29e99ce13b14f75c9b92708f37471e489a56389528c7a79612564f` |
| ~18:13 | G3 step 7 | demo → NVDAB | approve router for sale | `0x57aabe0298d9246d37f37843db50da4e901235c9867dd6ac9ef386b4c8cfde2e` |
| ~18:13 | G3 step 7 | demo → TSLAB | approve router for sale | `0x122837bf946028abebe7d8c80189efbece324b3cbe6167b4d5df78db37f79f7e` |
| ~19:10 | G4 | you → merchant `0x8e8B…01B0` | ~0.0015 BNB top-up for `bag`'s gas pre-check (balance 0.00231) | _hash → funding.md_ |
| 19:15:09 | G4 | merchant → IdentityRegistry `0x8004A169…a432` | ERC-8004 register, agent 370837 (concierge, approved; gas sponsored) | `0x9db4d9c5ca745e9463301d2fbb99b9bf0c4cd866dfc9ffc49a16dff8e8a4910d` |
