# Two-minute walkthrough

**Live on Arc testnet, no setup:** open `docs/E2E-TESTNET.md`: every step has an explorer link on explorer.testnet.arc.io (grant, a Memo-tagged
trade, an over-cap veto, mined over-cap and price-floor reverts, revoke, a mined post-revoke revert). The testnet market is
XORR-seeded (about 5 USDC Uniswap v2 pools, mirror feeds of Chainlink mainnet), so those trades are cents; the numbers below
are the mainnet-fork run.

**Fastest, no wallet needed (about 2 minutes):** `npm run e2e:fork`. It forks Arc mainnet locally, deploys XORR with the
real deploy script, starts the executor, and drives the whole loop with real signed transactions. Output is recorded in
`docs/E2E-FORK.md`.

What you will see, in order:

1. **Approve and grant.** The owner approves tokens to `XorrDelegation` and grants the executor agent: 40 USDC a day, 7
   days, 1% slippage, Uniswap v3 SwapRouter02 only. The CCIP stop receiver becomes a guardian.
2. **Council decides, executor trades.** Buy 10 USDC of cirBTC: five seats vote (4-1 approve), the votes are recorded on
   `XorrCouncil`, and the fill goes through `XorrDelegation` to the real Uniswap v3 pool in about 0.6 s. Then 10 USDC of EURC.
3. **The cap holds.** A 25 USDC round is vetoed by the Risk Keeper (20 left today). Then the same spend sent raw to the
   contract reverts on chain: `DailyCapExceeded(25000000, 20000000)`.
4. **Chainlink floor.** Every fill above passed `XorrPriceGuard`; unit tests show a fill far below Chainlink is refused.
5. **Reputation.** The keeper settles the rounds against Chainlink and writes ERC-8004 reputation for each seat.
6. **Revoke.** The owner calls `revoke()`; the next round is vetoed ("The owner stopped the agents") and a raw spend sent straight to the contract reverts `PolicyRevoked`.

**In the browser:** `sh scripts/arc-fork.sh mainnet`, start the executor and `npm run web` (README, "Run and test").
Home: create a device key (no wallet needed to load; with an empty wallet the app says so). Permission: set cap and
expiry, Approve and grant. Council: Convene the council, open the audit of a round. Home: hold the stop button to revoke.
"Built on Arc" lists every Arc piece with its live state, and which extras are switched off.
