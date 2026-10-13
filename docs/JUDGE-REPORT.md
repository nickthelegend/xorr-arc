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
