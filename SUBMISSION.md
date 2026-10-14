# XORR on Arc: submission

Live: https://xorr-arc.vercel.app (Arc testnet)


## Description (DoraHacks)

XORR is a council of five rule-based agents (deterministic rules, not an LLM) that trades inside an on-chain permission you can revoke in one tap. You hold only USDC
on Arc. You grant a daily cap, a venue allowlist and an expiry to XorrDelegation; the council's executor can only trade
inside it. Every fill is floored at Chainlink's price on chain, so a bad pool or a stale feed is refused before money
moves. Each seat is an ERC-8004 agent whose reputation is written from how its votes settled. A Chainlink CCIP receiver
is deployed so a stop can come from Base or Ethereum (that path is covered by Chainlink Local tests, not yet run over a
live lane). The design trades on Uniswap v3 on Arc mainnet, paid in USDC gas. The loop is proved two ways with real signed
transactions: on a fork of Arc mainnet (real Uniswap v3 and Chainlink feeds) and live on Arc testnet, where the market is
XORR-seeded (Uniswap v2 test pools of about 5 USDC and mirror feeds of Chainlink's mainnet answers, because testnet has
neither): grant, council, a Memo-tagged fill, over-cap and price-floor refusals, revoke, refusal.

## What it uses Arc for

- USDC as the only asset and the gas token; sub-second finality for each round.
- Uniswap v3 on Arc mainnet (cirBTC, EURC, WETH pools) as the venue.
- Chainlink Data Feeds on Arc as an on-chain price floor under every trade.
- ERC-8004 identity and reputation registries for the five council seats.
- Chainlink CCIP for a cross-chain kill switch into the permission.
- Arc Memo to tag trades with the council decision id (live on testnet; runtime-probed).
- Gateway, CCTP V2 and USYC are built but default-off and **not run**. The CCIP stop from another chain is **not run** either.

## Demo steps

1. Read `docs/E2E-TESTNET.md` (live Arc testnet transactions with explorer links), or `npm run e2e:fork` (about 2 minutes) or follow `docs/JUDGE-WALKTHROUGH.md`.
2. Watch: approvals, grant ($40/day, 7 days, 1% slippage), buy cirBTC, buy EURC, an over-cap round vetoed, a raw over-cap
   spend reverted on chain, a sell, keeper settlement into ERC-8004 reputation, then revoke and a refused round.
3. Open the web app (`npm run web`), create a device key, and see the permission read from Arc.
