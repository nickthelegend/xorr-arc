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
