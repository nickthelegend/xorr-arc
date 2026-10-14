# XORR on Arc

**Round 2:** contracts are live on Arc testnet; the updated frontend/executor have not been published.
Use the on-demand browser rehearsal below. Hosted frontend: https://xorr-arc.vercel.app — live reads on Arc testnet, local executor required for council execution. [Hosting checks](docs/HOSTED.md).
The previous Railway URL is not round-2 evidence; no paid resources are provisioned by this workflow.


**A council of five rule-based agents trades for you inside an on-chain permission you can revoke with a hold.** You hold
only USDC. You grant a daily cap, a venue allowlist and an end date; every fill is floored at Chainlink's price on chain;
the CCIP receiver can take a stop sent from Base or Ethereum (not yet run over a live lane, see below). Arc takes its gas
in the same USDC and finalizes deterministically.

The council seats (Price Desk, Risk Keeper, Trend Reader, Peg Desk, Strategist) are **deterministic rules over what was read
that round, not an LLM and not machine learning**: every vote names the numbers it rests on, so you can check it against
the stored inputs. Each seat is an ERC-8004 agent on Arc that earns reputation from how its votes turned out against
Chainlink.

**What has actually run** (labels used everywhere below: **Live** = real transactions on Arc testnet, **Fork** = a local
fork of Arc mainnet, **Not run**):

- **Live, Arc testnet:** the contracts are deployed (`deployments/arc-testnet.json`) and the core loop ran with real
  transactions (`docs/E2E-TESTNET.md`): grant, council, a Memo-tagged trade inside the cap with the price floor, an
  over-cap round vetoed, a mined over-cap revert, a mined price-floor revert, revoke, a mined post-revoke revert.
- **Fork, Arc mainnet:** the same loop on the real Uniswap v3 pools and real Chainlink feeds (`docs/E2E-FORK.md`).
- **Not run:** Circle Gateway, CCTP V2, USYC, and a CCIP stop sent from another chain.
- **Testnet is XORR-seeded.** Arc testnet has no Uniswap and no Chainlink feeds. The testnet build deploys Uniswap v2 from
  published bytecode with about 5 USDC per pool for test tokens (xWETH, xcirBTC), and prices them with mirror feeds of
  Chainlink's Arc mainnet answers. Trades there are cents. The USDC/EURC pool is not seeded (no testnet EURC). Mainnet
  uses none of this: real Uniswap v3 pools and real Chainlink feeds.

## Testnet pool maintenance (round 2)

Before a valid xWETH round, the executor refreshes unchanged mainnet answers into the testnet mirrors, then aligns
XORR's seeded pool to the mirror. It donates faucet xWETH when the pool price is high, or executor USDC when low.
The mirror is never changed to fit a trade; the on-chain floor and Price Desk remain enforced. Maintenance hashes are
shown on the result and audit page. Only testnet chain 5042002 + mirror feeds + Uniswap v2 can enter this path.
Mainnet still uses the original real Uniswap v3 path, verified only on a local fork.

Limits: 10% maximum drift, 0.10 executor USDC per re-peg, 0.25 per UTC day persisted in the data file, plus a 0.05 USDC
gas reserve. An exceeded limit or stale feed produces a clear veto. Multiple rounds in one executor are serialized.
Use one executor writer; multiple processes do not share a transaction lock. Only xWETH is available on testnet.

## Arc stack

| Piece | What it does in XORR | Where | Status |
|---|---|---|---|
| USDC as gas, deterministic finality | One token pays for trades and gas | everywhere | **Live** (testnet buys confirmed in 1.6-2.6 s end to end, gas estimate and receipt polling included); **Fork** (~0.6 s). Sub-second finality is Arc's documented property, not something XORR measured |
| Chainlink Data Feeds on Arc | Council prices and the **on-chain floor under every fill** | `XorrPriceGuard`, `XorrDelegation` | **Fork**: the real mainnet feeds; unit tests (stale feed, exact boundary, far-below-oracle fill refused). **Live**: on testnet the feeds are XORR **mirrors** of the mainnet answers, and the floor refused a fill on chain (`BelowOracleFloor`) |
| Uniswap | The venue | `XorrVenueRegistry`, `docs/VENUES.md` | **Fork**: real Uniswap v3 pools on mainnet (USDC/cirBTC, USDC/EURC, thin USDC/WETH). **Live**: XORR-seeded Uniswap v2 test pools on testnet |
| ERC-8004 identity + reputation | Five council seats registered; `settle` writes each seat's score | `XorrCouncil` | **Live**: five seats registered on testnet. **Fork**: reputation writes. Testnet settlement is possible one hour after a round (`docs/E2E-TESTNET.md` says whether it ran) |
| Chainlink CCIP | Cross-chain kill switch: a Base/Ethereum transaction reaches your Arc permission | `XorrStopSender`, `XorrStopReceiver` | Receiver **Live** on testnet; the cross-chain path is **Not run** over a live lane (Chainlink Local tests only) |
| Arc Memo | Each agent trade is sent through Memo with the council decision id as memo id | `server/src/chain.ts` | **Live** on testnet (trade tagged, see `docs/E2E-TESTNET.md`); **Fork** with Arc Foundry |
| EURC | FX desk (USDC/EURC pool, EUR/USD feed) | council, `app/markets` | **Fork**: bought on the real pool. Testnet: pool not seeded, **not traded** |
| Circle Gateway, CCTP V2, USYC | Fund from any chain, withdraw to Base/Ethereum, park idle USDC | `server/src/gateway.ts`, `app/fund`, `app/treasury` | **Not run.** Default off (`FEATURE_GATEWAY`, `FEATURE_CCTP`, `FEATURE_USYC`): they need Circle's live services or an entitled wallet |

## The app

The finished XORR Expo interface is now on Arc: a balance-led home, round quick actions, an agent sheet,
Explore story tiles, council voting and replay, agent rooms, history and timed receipts. Rooms show recorded
rule-based ballots, not LLM conversations. Perps and the source chain's strategy gauntlet are omitted because
this deployment has no supporting Arc venue or backtest dataset. [Port and verification notes](docs/UI-PORT.md).

| Home | Explore | Timed fills |
|---|---|---|
| ![Home on Arc](docs/screens/testnet/home-390.jpg) | ![Explore Arc](docs/screens/testnet/explore-390.jpg) | ![Arc receipt](docs/screens/testnet/runs-390.jpg) |

[Desktop view](docs/screens/testnet/home-1280.jpg) · [All screens at 1280 and 390px](docs/screens/testnet/)

The browser rehearsal granted a 0.10 USDC daily limit, convened the council, bought 0.04 USDC of xWETH in the
XORR-seeded testnet pool, and revoked the permission. The trade's measured send-to-receipt time was 1.50 s;
its on-chain gas fee was 0.007723 USDC. [Transactions and budget](docs/UI-BROWSER-TESTNET.json).

## The permission

`XorrDelegation.grant(agent, dailyCapUsdc, expires, slippageBps, venues[])`, owner only. The agent can call
`spend(...)` and nothing else; it cannot exceed the cap (resets 00:00 UTC), use a venue the owner did not allow (and the
registry still lists), trade after expiry, or accept an output below Chainlink's price minus the owner's slippage. The
contract holds nothing and has no admin. `revoke()` stops every agent at once; guardians (the CCIP receiver) can only stop.

## Venue findings (2026-10-08, see `docs/VENUES.md`)

Uniswap v2, v3 and v4 are officially deployed on Arc mainnet. XORR trades through v3 SwapRouter02 because its pools hold
real liquidity (cirBTC about 6M USDC deep, EURC about 9k, WETH only about 600 USDC, so WETH rounds stay tiny and the
Chainlink floor refuses fills the pool depth would push past your slippage). Arc testnet has no Uniswap, so the testnet
build deploys Uniswap v2 from its published bytecode with XORR test tokens, labelled as such. No perps venue exists on
Arc, so XORR does not offer perps.

## Run and test

```sh
npm ci && npm --prefix server ci && (cd contracts && sh setup.sh && npm ci)
npm run lint
npm run typecheck && npm --prefix server run typecheck
npm test                      # app + executor unit tests (vitest)
(cd contracts && forge test)  # contracts: unit, fuzz, invariant, Chainlink Local CCIP
npm run e2e:fork              # the whole loop on a local fork of Arc mainnet; writes docs/E2E-FORK.md
npm run e2e:testnet           # the loop on live Arc testnet (needs a funded throwaway owner, see the script header); writes docs/E2E-TESTNET.md
npm run build:web             # static web export to dist-web
npm --prefix server run build # compiled executor under server/dist
```

Local app: `sh scripts/arc-fork.sh mainnet` (fork + deploy), then
`XORR_NETWORK=arc-mainnet ARC_RPC_URL=http://127.0.0.1:9110 XORR_DEPLOYMENT=.fork/arc-mainnet-fork.json XORR_EXECUTOR_KEY_FILE=.fork/keys.env npm run server`
and `npm run web` (port 9130). With no deployment or wallet the app still loads and says so. The fork scripts use stock
Foundry by default (a USDC stand-in is placed over `0x3600…`, see `docs/E2E-FORK.md`); set `ARC_FOUNDRY` to Circle's
Arc Foundry for the real precompiles.

Fork-only Solidity tests (`contracts/test/fork`, opt-in `ARC_FORK_TESTS=1`) need Arc Foundry's `forge --network arc`.

## Round-2 browser rehearsal — Arc testnet

```sh
cd '/Volumes/Extreme SSD/Projects/arc/xorr-arc'
npm run e2e:browser -- --trade
```

Requires installed Playwright Chromium (`npx playwright install chromium` if missing), the existing executor key file
`../.deployer/xorr-roles.env`, and deployer funding file `../.deployer/deployer.env`. The command builds the frontend,
starts one executor on 9120 and one static server on 9130, funds a throwaway owner with at most 0.20 testnet USDC
under the shared deployer lock, tops the executor up to 0.20 USDC only if needed, and saves the owner key to gitignored `.keys/round2-owner-<timestamp>.env` with mode 0600 (the run report records the path).
It clicks grant ($0.05/day), a $0.04 buy, an over-cap $0.02 refusal, sell-back, hold-to-stop, and a post-revoke refusal. It then checks all 14 routes
at 1440 and 390 px, cold Home, Explore links, agent rooms, disclosures, privacy and executor recovery.
On exit it revokes if necessary, sweeps remaining owner USDC and unused executor top-up to the deployer (gas dust remains), and stops only its PIDs. Existing executor funds are retained.
Executor gas reservations are capped at 0.15 USDC; re-peg donations retain their own persisted daily 0.25 cap.
Gross owner funding, executor balance reduction and cleanup/funding allowance must stay below 0.5 USDC.
Do not run another process with the same executor key during the rehearsal. Do not run both commands concurrently.

`npm run e2e:browser` performs read-only screen checks without funding or trades. Screenshots go to
`docs/screens/testnet/round2/`; results to `docs/ROUND2-{BROWSER-TESTNET,SCREEN-CHECK,BROWSER-RUN}.json`.
See `docs/E2E-TESTNET.md` for the latest run, transaction evidence, measured cost and limits.

## Hosting

The frontend is a static Vercel export with SPA route rewrites. Set `EXPO_PUBLIC_API_URL` to a reachable updated executor
before publishing; leave `EXPO_PUBLIC_TEST_WALLET` off. No Railway resources are required or created by the rehearsal.
The current executor is stateful: replay protection, round history and re-peg quota live in files, with a single-writer
nonce queue and keeper timers. Deploying it unchanged to ephemeral Vercel functions would lose replay/budget guarantees.
For the demo, run it on demand locally with the command above. A public deployment needs a lead-approved persistent
executor, or a durable database/queue migration plus scheduled settlement; this round does not claim either is deployed.

## Layout

`contracts/` Foundry project · `server/` Hono executor (council, rounds, keeper) · `app/`, `src/` Expo web app ·
`scripts/` fork, deploy and e2e · `deployments/` per-network addresses · `docs/` venue research, e2e record, walkthrough.
Deploying to mainnet: `MAINNET.md`. Hackathon text: `SUBMISSION.md`.

## Status

Deployed on **Arc testnet** (`deployments/arc-testnet.json`: XorrDelegation, price guard with mirror feeds, venue registry,
council ledger, five ERC-8004 seats, CCIP stop receiver). Not deployed to mainnet yet: `deployments/arc-mainnet.json` is
written by `scripts/deploy.sh mainnet` and `MAINNET.md` lists the steps and caps. Signed round and autopilot requests are
replay-protected (`signed-requests.json` under the data dir; keep it on persistent storage and run one executor writer per
data directory). Not audited. See `docs/JUDGE-REPORT.md` for the claims audit.

<!-- MAINNET-ADDRESSES -->
## Addresses — live mainnet and testnet

Mainnet **5042: Live**, deployed 2026-10-14. [All mainnet addresses and transaction receipts](docs/MAINNET-DEPLOYMENT.md).
Testnet **5042002: Live**; [testnet deployment](deployments/arc-testnet.json) and [testnet evidence](docs/E2E-TESTNET.md).

- cbtc: [0x171A4217b86A807A64eB94757Db6849fb4bDbAA0](https://explorer.arc.io/address/0x171A4217b86A807A64eB94757Db6849fb4bDbAA0).
- ccipRouter: [0xB79791184973589c38e114D43Eb8E4588C283A18](https://explorer.arc.io/address/0xB79791184973589c38e114D43Eb8E4588C283A18).
- council: [0x1d628d3C6588Fe1AC7234C08EB2D4Ea2A4a16E55](https://explorer.arc.io/address/0x1d628d3C6588Fe1AC7234C08EB2D4Ea2A4a16E55).
- delegation: [0x83d58219484EB94cFaDFe4D975393c13051B36b1](https://explorer.arc.io/address/0x83d58219484EB94cFaDFe4D975393c13051B36b1).
- eurc: [0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1](https://explorer.arc.io/address/0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1).
- identityRegistry: [0x8004A169FB4a3325136EB29fA0ceB6D2e539a432](https://explorer.arc.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432).
- memo: [0x5294E9927c3306DcBaDb03fe70b92e01cCede505](https://explorer.arc.io/address/0x5294E9927c3306DcBaDb03fe70b92e01cCede505).
- priceGuard: [0x301536E42A40CF723e2a4948630D731Da732cd5A](https://explorer.arc.io/address/0x301536E42A40CF723e2a4948630D731Da732cd5A).
- quoter: [0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468](https://explorer.arc.io/address/0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468).
- reputationRegistry: [0x8004BAa17C55a88189AE136b182e5fdA19dE9b63](https://explorer.arc.io/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63).
- stopReceiver: [0x77329D679CE9c17543821575C6D3681A672cff7A](https://explorer.arc.io/address/0x77329D679CE9c17543821575C6D3681A672cff7A).
- usyc: [0x8a5D989Bbb96929F689B0200f435f53dA42bF490](https://explorer.arc.io/address/0x8a5D989Bbb96929F689B0200f435f53dA42bF490).
- v2Factory: [0x0000000000000000000000000000000000000000](https://explorer.arc.io/address/0x0000000000000000000000000000000000000000).
- venue: [0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77](https://explorer.arc.io/address/0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77).
- venueRegistry: [0x391eEB248ED9311057CFBfA7E218310281cfe4fa](https://explorer.arc.io/address/0x391eEB248ED9311057CFBfA7E218310281cfe4fa).
- weth: [0x128cC466B61f542da60c70e3aA11c10e19B84EDB](https://explorer.arc.io/address/0x128cC466B61f542da60c70e3aA11c10e19B84EDB).

Mainnet smoke: [Smoke: grant bounded 0.1 USDC permission (no trade)](https://explorer.arc.io/tx/0x37955e8e29f48209b76600b490c5f144864e5b409f91df00a6e1d89e0d60ad05).

Mainnet smoke: [Smoke: revoke permission immediately](https://explorer.arc.io/tx/0x55b1f456cae7f08b74d2b2a431560b232884ac95ab6f2fcb34247204766d1617).
<!-- /MAINNET-ADDRESSES -->
