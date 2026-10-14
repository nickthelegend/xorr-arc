# LEAD: RUN THESE

```sh
cd '/Volumes/Extreme SSD/Projects/arc/xorr-arc'
npm run e2e:browser -- --trade
```

# Grant fix acceptance — 14 October 2026

**Live (testnet), PASS:** fresh device wallet; approvals, grant, council, Memo buy, over-cap refusal, sell-back, browser revoke, next-trade refusal. The final command exited 0. All 14 routes at 1440/390, control interactions and outage recovery passed with no browser errors. `docs/ROUND2-BROWSER-TESTNET.json` and screenshots are current evidence; historical pending-browser statements below are superseded.

| Criterion | Before this fix | After | Reason |
|---|---:|---:|---|
| Arc relevance | 8 | 8 | Actual Memo events, USDC gas and bounded delegation on testnet; external lanes still Not run. |
| Technical credibility | 7 | 8 | Reproduced pending transaction metadata after successful receipt; bounded read-only indexing recovery preserves exact-call/finality/canonical checks. |
| Build quality | 7 | 8 | Grant succeeds; web expansion/selection/busy states exposed correctly; desktop/mobile checks pass. |
| Worth taking further | 8 | 8 | Permission primitive works; shallow seeded markets and public backend remain limitations. |
| Cold judge can complete a trade | 6 | 7 | Complete local one-command flow verified; an updated public executor is still a release gap. |

Checks: 222/222 unit tests; app typecheck, lint and web export PASS. No contract changes; contract/fork suites Not rerun. Both refusal rounds were vetoed and recorded without a trade or balance/spend change; these browser checks do not claim new mined revert transactions.

[Grant](https://explorer.testnet.arc.io/tx/0xc9a378421779027406d07ea67edb8f9f7ddf2e26cb0f5d1b8499c70dbe213cdc) · [Memo buy](https://explorer.testnet.arc.io/tx/0x9f211d3815fa5995a023cf6982333f3bb45ee99e9c65dd36a1241440ae5294e1) · [Over-cap record](https://explorer.testnet.arc.io/tx/0x75cbb9bf57d5b44f219826f2f986dfbb1bf5dc7752118a8ff683c884176b992b) · [Revoke](https://explorer.testnet.arc.io/tx/0x63605bd15000f9fc86f2e26e5cfa54f1ba131b706a06f443209423aada62f78c) · [Post-revoke record](https://explorer.testnet.arc.io/tx/0x2b9b302728fda94bcc34f6a38df80828b1e274b0d05973241737b4ef20f83b46).

Whole-task net cost **0.332065649 testnet USDC**, including failed attempts, maintenance and recovery; limit 0.5. Unused owner funds/executor top-up swept back, partial-run test tokens recovered to deployer, keys retained only in gitignored recovery files. See `GRANT-FIX-BUDGET.json` and `E2E-TESTNET.md`. All owned server/browser processes stopped.

Still weak: this is local frontend + on-demand executor against live testnet; no public release was performed. The executor still needs durable history/replay/nonce coordination for serverless hosting. No paid resources created. Seeded pool depth and persisted maintenance quota can refuse later runs. CCIP/Gateway/CCTP/USYC and one-hour reputation settlement remain Not run live; mainnet undeployed, unaudited.

---

Historical report follows (before grant/ARIA fixes):

# Round 2 — product judge + fixes, 2026-10-14

Method: source audit of all 14 routes and controls, previous browser evidence, live testnet pool/quote reads,
one real testnet re-peg, read-only API smoke, unit/contract tests and builds. Chromium was deliberately not launched:
the task requires the lead to run it outside the sandbox. No new screenshots or browser trades are claimed.

## Round-2 scores (/10, provisional until browser and release checks)

| Criterion | Before | After | Evidence and remaining deduction |
|---|---:|---:|---|
| Relevance to Arc | 8 | 8 | USDC gas, Memo and on-chain permissions remain real testnet flows; external Circle flows still Not run. |
| Technical credibility | 7 | 8 | A live re-peg restored the default quote inside the guard, with bounded funding and unchanged mirror/floor. Full updated browser flow pending. |
| Build quality | 6 | 7 | Fixed dead keeper-off Autopilot, unsupported rotation, unavailable treasury controls, stale copy, retry and long-label layout. Visual results pending. |
| Worth taking further | 8 | 8 | Permission primitive remains useful; testnet maintenance is clearly separated from real mainnet v3. No audit or public round-2 release. |
| Cold judge can complete a trade | 4 | 6 | Price veto cause repaired and local rehearsal is one command; browser execution and reachable updated hosting still required. |

The previous round's 8/10 build score predates the observed drift and newly audited keeper-off behavior.

## Findings and disposition

| Surface | Finding | Fix / verification |
|---|---|---|
| Council / executor | Seeded xWETH pool drift makes default buys fail Price Desk | Valid testnet rounds refresh mirrors, donate faucet xWETH or bounded executor USDC, sync pool, then re-read and vote. Live re-peg passed; browser trade pending. |
| Concurrent council / keeper requests | Another request can trade between re-peg and quote | Serialize whole rounds in one executor; on-chain floor still refuses intervening external drift. One executor writer required. |
| Autopilot | UI allows On while keeper is off; rotates into dust cirBTC and unseeded EURC | API rejects On while off; UI explains manual rounds. Testnet rotation uses only xWETH. |
| Treasury | Disabled deposit/redeem look like available features; EURC text implies testnet trading | Hide untested write controls when off; label USYC Not run and EURC testnet unavailable. |
| Executor outage | Dead-end technical setup instructions | Product explanation and working Try again action; browser recovery assertion prepared. |
| Markets / audit / Arc proof | Long labels cannot shrink; blank markets load; unconditional reputation/one-tap claims | Flexible labels/proof headings, explicit loading, conditional reputation and hold-to-stop wording. |
| Round result / audit | A judge cannot tell maintenance from a normal fill | Separate labelled maintenance note and explorer links; failures retain partial tx evidence and veto. |
| Home / Explore / rooms / history / runs / how / fund / permission | Reviewed navigation handlers and data sources; no new mock dataset found | Prepared cold/connected checks, all routes at 1440/390, story links, room tabs, disclosures, balance privacy and core buttons. No new visual pass claimed. |
| Hosting | Existing Railway URL is stale round-2 evidence; executor depends on durable files/timers | Vercel SPA config added; README no longer calls old deployment round-2 live. Use local on-demand demo; public backend needs lead decision. |

## Evidence and checks

- Live (testnet): `docs/ROUND2-REPEG-TESTNET.json`; 0.004617375 USDC executor reduction; no owner/deployer funds used.
- After maintenance, the $0.04 xWETH buy quote differs by 109.64 bps, below Price Desk's 150 bps default.
- Mirror refresh: https://explorer.testnet.arc.io/tx/0x8f0973cf8c3f5f536a73f5c02ae7baf2fdf4ba6d9acab2c5861236ec464c21ee
- Faucet: https://explorer.testnet.arc.io/tx/0xf23ab47bd54c0caa5184fe06fc3d1a72a3aef8f7d56b7866938f0b15bec38e7b
- Donation: https://explorer.testnet.arc.io/tx/0xc079074185f733df57488782ce12821726231b81446bcc9722e902eb04617a6b
- Sync: https://explorer.testnet.arc.io/tx/0x7027111358912f4964687c75eb872c4969059408a881a03d6a69063503dd53dd
- Read-only live API smoke: health/config/markets/agents/account/rounds all HTTP 200; keeper-off and re-peg flags correct.
- App/server TypeScript, correctness + hooks lint, static web export and compiled executor: PASS.
- Vitest: 209/209. Includes mainnet/RPC/stale-feed/drift/budget/partial-failure re-peg boundaries and integer reserve math.
- Arc Foundry unit/fuzz/invariant/Chainlink Local: 68/68. Mainnet fork suite not rerun; contracts unchanged.
- Mechanical UI detector: no findings. This is not screenshot evidence.
- Browser syntax checks: PASS. Chromium/browser trades/screenshots: **Not run**, lead command above.

## Still weak / release gate

The updated app/executor are not publicly deployed. Frontends belong on Vercel; its config is ready, but it needs a
reachable updated API. The current executor's replay log, round history, maintenance quota and nonce coordination
need one durable writer; the keeper uses timers. An ephemeral Vercel function is unsafe without a durable database/
queue migration. No Railway or other paid resources were created. Use the local on-demand demo until the lead decides.

Seeded liquidity remains shallow; >10% drift, >0.10 USDC maintenance or the 0.25/day budget deliberately refuses a round.
Multiple external writers can still move the pool. Live cross-chain CCIP, Gateway, CCTP, USYC and reputation horizon
settlement remain Not run. Mainnet undeployed and not audited. Dependency audit reports vulnerabilities;
no breaking dependency upgrade was attempted. Prior screenshots and browser receipts below are historical only.

---

# Judge + fix report (Arc testnet), 2026-10-13

Method: read README, SUBMISSION, docs/JUDGE-WALKTHROUGH and the app copy as a cold judge; grepped app and server for mocks;
ran the app against the live testnet deployment in headless Chromium at 1280 and 390 px; ran the core loop with real
transactions (`npm run e2e:testnet`, `docs/E2E-TESTNET.md`).

## Scores (/10)

| Criterion | Before | After | Why |
|---|---|---|---|
| Relevance to Arc | 6 | 8 | Before: deep Arc usage on paper, but nothing had traded on Arc; README said "not deployed". After: live on testnet with USDC gas, Memo-tagged trades, ERC-8004 seats, Chainlink-style floor, CCIP receiver, honest labels for what did not run. Not 9+: Gateway/CCTP/USYC and the cross-chain stop never ran. |
| Technical credibility | 5 | 8 | Before: only fork evidence, copy claimed "AI agents", "final in under a second", "checked live", EURC "ok" while its testnet pool did not exist. After: every claim labelled Live / Fork / Not run, the council is described as deterministic rules, a judge can click six mined txs including three mined reverts (over-cap, price floor, post-revoke). Not 9+: the mainnet path is fork-only and mainnet is undeployed. |
| Quality of what was built | 7 | 8 | Contracts, tests (186 + 3 new) and the app were already solid. Fixed: markets table quoting a $10 probe against a 5 USDC pool (showed +20,000 bps), a header button that overflowed at 390 px, default council amounts ($10 cirBTC) that could never fill on testnet, a $0.50 sell-dust rule that blocked a $0.04 close. Weak: testnet pools are 5 USDC deep so trades are cents and the pool drifts from the mirror feed. |
| Worth taking further | 7 | 8 | A real permission-and-floor primitive for agent trading on Arc, now shown working live; the path to mainnet is a script and a checklist. Needs a real audit and live CCIP/Gateway runs before money. |

## 1. Claims audit

| Claim (where) | Status found | Action |
|---|---|---|
| "A council of AI agents trades..." (app tagline, `brand.ts`) | **False**: the council is deterministic rules, not an LLM | Reworded app, README, SUBMISSION: "five rule-based agents (not an LLM)"; added to the home and council screens |
| "A stop sent from Base or Ethereum kills the permission" (README lede, SUBMISSION) | Receiver deployed on testnet; cross-chain path **Not run** (Chainlink Local tests only) | Reworded; labelled Not run in README table and Built-on-Arc screen |
| "Arc settles each action in under a second" / "Final in under a second" (README, home screen) | Arc's documented property, not measured by XORR; measured testnet buys took 1.6-2.6 s end to end | Reworded to the measured number plus "documented property" |
| "Chainlink floor under every fill" | **Fork** with real feeds; **Live** on testnet against XORR mirror feeds (testnet has no Chainlink) | Table now says which; `BelowOracleFloor` demonstrated by a mined revert |
| "Arc Memo ... not exercised in the fork run" | Now **Live** on testnet (trade tagged) | Updated |
| "Contracts are not yet deployed ... the deployer is unfunded" (README Status, MAINNET.md) | Stale: deployed on testnet | Fixed |
| "EURC" row: state "Uniswap USDC/EURC", ok (Built on Arc) | **False on testnet**: the pool is not seeded | Shows "pool not seeded"; markets and council say so |
| "Built on Arc: Every Arc piece, checked live" | Overstated: it reads state live, not that each piece ran | Each row now carries a proof line (Live / Fork / Not run) |
| "Gateway and CCTP V2, any chain" (home tile) | **Not run**, default off | Tile says switched off unless enabled |
| ERC-8004 reputation "earned from how votes turned out" | **Fork** verified; testnet settlement waits one hour and was not awaited | Labelled; E2E-TESTNET.md says so |
| "Production", "audited", "real-time" | Not used; README says "Not audited" | Kept |

## 2. Mocks audit

No mock, stub, fixture or hard-coded data in the app or server paths (grep of app, src, shared, server/src). Found and fixed:
the markets probe size (see above), the sell dust threshold, stale `Privy` mentions in two comments, and the testnet market
itself, which is **XORR-seeded by design** (about 5 USDC Uniswap v2 pools for test tokens xWETH/xcirBTC, mirror feeds of
Chainlink's mainnet answers). It is labelled on the Markets, Council and Built-on-Arc screens and in the README; mainnet uses
real Uniswap v3 and real Chainlink feeds (fork-proven). Off-by-default extras (Gateway, CCTP, USYC) say they are off.

## 3. Screens audit (live testnet deployment, Chromium)

Routes `/ /council /permission /markets /agents /fund /treasury /arc` at 1280x900 and 390x844 (screenshots in
`docs/screens/testnet/`): no console errors, no failed requests or 4xx, no broken images, no Monad/MON/AUSD/Privy/lorem/
`undefined`/`NaN` text, explorer links point to explorer.testnet.arc.io. 390 px: the page no longer scrolls sideways (the
decorative aurora is clipped); the one real overflow was the "Check original transaction" button in the home header, now
shown only when an owner transaction is actually unconfirmed. Empty states read correctly with a funded owner that has history.

## 4. Feature check (live, real transactions)

`docs/E2E-TESTNET.md`, 11/11 steps: grant, a Memo-tagged $0.04 buy through XorrDelegation, sell back, over-cap round vetoed by
the Risk Keeper (and recorded on XorrCouncil), mined `DailyCapExceeded`, owner tightens slippage then a mined
`BelowOracleFloor`, revoke, round vetoed, mined `PolicyRevoked`. A first dry run exposed that the council correctly vetoed buys
because the thin pool had drifted 0.5% from its mirror feed; the deployer re-pegged it. Budget: about 0.45 USDC net.

## Still weak

- ERC-8004 settlement on testnet not run (one-hour horizon); Gateway, CCTP, USYC, and a cross-chain CCIP stop never ran.
- The testnet market is cents-deep and drifts from the mirror feed until someone re-pegs it, so a cold judge's first round may be
  vetoed by the Price Desk (it says why). The fork e2e was not re-run after the e2e script refactor (typecheck only).
- Not audited; mainnet not deployed.
