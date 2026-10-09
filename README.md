# XORR on Arc

**A council of five agents trades for you inside an on-chain permission you can revoke in one tap.** You hold only USDC.
You grant a daily cap, a venue allowlist and an end date; every fill is floored at Chainlink's price on chain; a stop
sent from Base or Ethereum over Chainlink CCIP kills the permission. Arc settles each action in under a second and takes
its gas in the same USDC.

The council seats (Price Desk, Risk Keeper, Trend Reader, Peg Desk, Strategist) are deterministic rules over what was read
that round, not an LLM: every vote names the numbers it rests on, so you can check it against the stored inputs. Each seat
is an ERC-8004 agent on Arc that earns reputation from how its votes turned out against Chainlink.

## Arc stack

| Piece | What it does in XORR | Where | How verified |
|---|---|---|---|
| USDC as gas, sub-second finality | One token pays for trades and gas; a round is final in under a second | everywhere | fork e2e (gas read in USDC; fills in ~0.6 s) |
| Chainlink Data Feeds on Arc | Council prices, and the **on-chain floor under every fill** | `XorrPriceGuard`, `XorrDelegation` | unit tests (stale feed, exact boundary, far-below-oracle fill refused), fork e2e on the real feeds |
| Uniswap v3 on Arc mainnet | The only venue; USDC/cirBTC, USDC/EURC, thin USDC/WETH pools | `XorrVenueRegistry`, `docs/VENUES.md` | fork e2e fills on the real pools |
| ERC-8004 identity + reputation | Five council seats registered; `settle` writes each seat's score | `XorrCouncil` | fork e2e step 8 on the real registries |
| Chainlink CCIP | Cross-chain kill switch: a Base/Ethereum transaction reaches your Arc permission | `XorrStopSender`, `XorrStopReceiver` | Chainlink Local tests; guardian wiring in e2e. Not run over a live lane |
| Arc Memo | Each agent trade is sent through Memo with the council decision id as memo id | `server/src/chain.ts` | probed at runtime; live on testnet read. **Not exercised in the fork run** (needs Arc Foundry), trades fall back to untagged |
| EURC | FX desk (USDC/EURC pool, EUR/USD feed) | council, `app/markets` | fork e2e buys EURC |
| Circle Gateway, CCTP V2, USYC | Fund from any chain, withdraw to Base/Ethereum, park idle USDC | `server/src/gateway.ts`, `app/fund`, `app/treasury` | **Default off** (`FEATURE_GATEWAY`, `FEATURE_CCTP`, `FEATURE_USYC`): they need Circle's live services or an entitled wallet and were not run |

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
npm run typecheck && npm --prefix server run typecheck
npm test                      # app + executor unit tests (vitest)
(cd contracts && forge test)  # contracts: unit, fuzz, invariant, Chainlink Local CCIP
npm run e2e:fork              # the whole loop on a local fork of Arc mainnet; writes docs/E2E-FORK.md
npm run build:web             # static web export to dist-web
```

Local app: `sh scripts/arc-fork.sh mainnet` (fork + deploy), then
`XORR_NETWORK=arc-mainnet ARC_RPC_URL=http://127.0.0.1:9110 XORR_DEPLOYMENT=.fork/arc-mainnet-fork.json XORR_EXECUTOR_KEY_FILE=.fork/keys.env npm run server`
and `npm run web` (port 9130). With no deployment or wallet the app still loads and says so. The fork scripts use stock
Foundry by default (a USDC stand-in is placed over `0x3600…`, see `docs/E2E-FORK.md`); set `ARC_FOUNDRY` to Circle's
Arc Foundry for the real precompiles.

Fork-only Solidity tests (`contracts/test/fork`, opt-in `ARC_FORK_TESTS=1`) need Arc Foundry's `forge --network arc`.

## Layout

`contracts/` Foundry project · `server/` Hono executor (council, rounds, keeper) · `app/`, `src/` Expo web app ·
`scripts/` fork, deploy and e2e · `deployments/` per-network addresses · `docs/` venue research, e2e record, walkthrough.
Deploying to mainnet: `MAINNET.md`. Hackathon text: `SUBMISSION.md`.

## Status

Contracts are not yet deployed to a public network (the deployer is unfunded); `deployments/arc-mainnet.json` is written
by `scripts/deploy.sh`. Signed round and autopilot requests are replay-protected (`signed-requests.json` under the data
dir; keep it on persistent storage and run one executor writer per data directory). Not audited.
