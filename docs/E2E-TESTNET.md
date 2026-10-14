# End-to-end on Arc testnet (live)

Produced by `node scripts/e2e-testnet.mjs` (scripts/e2e-testnet.mjs + server/scripts/e2e.ts) on 2026-10-13.

- Network: **Arc testnet** (chain id 5042002, https://rpc.testnet.arc.io). Real transactions; explorer links below open on https://explorer.testnet.arc.io.
- Contracts: the live deployment in `deployments/arc-testnet.json` (XorrDelegation `0x0CDB99A17EBE31d6179cEF0963856Fc06C7267F0`).
- Market: **XORR-seeded**. Arc testnet has no Uniswap and no Chainlink feeds, so the trade runs on XORR's own ~5 USDC Uniswap v2 pool for the
  XORR test token xWETH, floored on chain by a mirror feed of Chainlink's Arc **mainnet** ETH/USD answer. Mainnet uses the real
  Uniswap v3 pools and real Chainlink feeds (proven on a mainnet fork: `docs/E2E-FORK.md`).
- Sizes are pennies on purpose: the pool is 5 USDC deep, so a $0.04 buy already moves its price about 1%.
- Memo was live on this node: the trade went through Arc's Memo with the council decision id as memo id.
- Result: **all steps passed**.

```
XORR e2e on arc-testnet; owner 0x224fbbcd10DFC08A51875c094E129EC27cE7DDD6; agent 0x9AFa02F2BF4df7740e0Ad6a4f68163E0f48E7ada; Memo live
✔ 1 approve — USDC and xWETH approved to XorrDelegation
✔ 2 grant — $0.1/day, 1 day(s), 2% slippage, venue 0x13A41b4B6e8dC8Eb00e266139ECf18c07E4b0Bf1 (https://explorer.testnet.arc.io/tx/0x4c5210e186b4a7e996225dce311ab1595d3b72f9e95f6627a47af0d048444dee); CCIP stop receiver is a guardian (https://explorer.testnet.arc.io/tx/0xe315728124b198dbbd7f0ab7a85c3116ddcd9d5889b284a8889443bd886ac7a2)
✔ 3 buy xWETH $0.04 — Approved 4–0. https://explorer.testnet.arc.io/tx/0x3fde474f4bacdd03e156e80b694d6e18ce4b775796b3a195d695a8bd9d95c13e in 1572 ms, received 15778778663955 base units, memo tagged; decision recorded https://explorer.testnet.arc.io/tx/0x8dd21e325698458270b740aadc4fa28a11a21db33129f3f8a117d51fad70bb0a
✔ 4a buy EURC — not run on testnet: the USDC/EURC pool is not seeded (no testnet EURC); run on the mainnet fork
✔ 4b sell xWETH — Approved 4–0. https://explorer.testnet.arc.io/tx/0x3d6eda7ca0e7bffd1d3df5aebe012e7023f7ff189ad9d797d38a52bd94cd9aa8, received 0.039762 USDC
✔ 5 over-cap round — Vetoed by the Risk Keeper: $0.04 is more than the $0.02 left of today's $0.10 cap; the contract would refuse it. (the veto is on chain too: https://explorer.testnet.arc.io/tx/0x6b1fb69da791583552edbab9d30dbe54b62cc11b76fe004e2808aa3c10de308d)
✔ 6 raw over-cap spend — XorrDelegation refuses: DailyCapExceeded, mined revert https://explorer.testnet.arc.io/tx/0xb53b0e6541f331876eb7a915986a7c1fdcc46ce3c62ba143343f95c548a4f055
✔ 6b price floor — owner tightens slippage to 0.3% (https://explorer.testnet.arc.io/tx/0x93c359fbca57174edb04800520d934c07d6ee5c84fc4f2c837ce497b65883eed); XorrDelegation refuses a $0.05 fill below Chainlink's price less 0.3%: BelowOracleFloor, mined revert https://explorer.testnet.arc.io/tx/0x53040a5da70e4d5835614790cda11b62d8669b0998ec026b325011d699f00ba0
✔ 8 settle → ERC-8004 — deferred: a decision can be settled 60 min after it was recorded or filled; the keeper (or anyone) settles it later, see the bottom of docs/E2E-TESTNET.md for the outcome
✔ 9 kill switch — revoke https://explorer.testnet.arc.io/tx/0xd008e2fd7489e9bde227fb078ceec6bc361adbfe97a6a1a5ba98f873fb7cdb50; next round: Risk Keeper: "The owner stopped the agents (kill switch)." (decision vetoed, no trade sent)
✔ 10 raw spend after revoke — XorrDelegation refuses: PolicyRevoked, mined revert https://explorer.testnet.arc.io/tx/0xff4bfda48b7a1087d6917e91477ca197ca063ad6940f364ff44146e3243a473a

owner now: 1.171335 USDC, 0.000000 EURC, 0.000000 xWETH, 0.000000 xcirBTC; gas left 1.1713 USDC
owner transactions: 6; passed 11/11
```

## Around the run (testnet housekeeping, explorer links)

- Owner (a throwaway key, `0x224fbbcd10DFC08A51875c094E129EC27cE7DDD6`, not committed) funded with 1.2 USDC:
  https://explorer.testnet.arc.io/tx/0xb1fd85467c1f5f0a795c565096654145df36afe5fe35827327885f12ed8844b6
- Executor (`0x9AFa02F2BF4df7740e0Ad6a4f68163E0f48E7ada`, gas for the keeper, mirror posts and rounds) funded with 0.4 USDC:
  https://explorer.testnet.arc.io/tx/0xf838f7f639010544062ac8a25113896d9db3ed9cf1db402db5e573df4f1decd0
- The first dry run found the Price Desk vetoing every buy: the mirror feed had moved 0.5% since the pool was seeded, so the
  thin pool sat outside the 1.5% limit. The council was right to refuse. The deployer minted 0.0000049 xWETH and sold it into
  the pool to bring it back to the mirror price (it costs the deployer nothing): https://explorer.testnet.arc.io/tx/0xde1cb00ce61f7e3a109081f1e73517d5a5b7c4a8040250af920c321c0b9d88c6
  A XORR-seeded pool drifts from the mirror whenever Chainlink's mainnet price moves, and nobody arbitrages it on testnet.
- Leftover owner funds swept back to the deployer: https://explorer.testnet.arc.io/tx/0x30e574ffa4609919a76f6930cf161a8f467dd8b1f5c46513ec9376e8264d30d5
  The executor keeps about 0.29 USDC for the keeper.
- Net testnet cost of the whole pass: about 0.45 USDC (1.6 sent out, 1.17 swept back, ~0.03 gas), under the 2.5 USDC budget.

## What this run did not show

- **Step 8 (ERC-8004 settlement) did not run.** `XorrCouncil.HORIZON` is 3600 s: a decision can be settled one hour after it was
  recorded or filled, and this pass did not wait. The fork run settled and wrote reputation (`docs/E2E-FORK.md`). To finish
  it on testnet, start the executor (`npm run server` with the testnet deployment); its keeper settles due rounds.
- No EURC trade (pool not seeded), no cirBTC trade (the xcirBTC pool is 5,997 units deep), no Gateway/CCTP/USYC, and no CCIP stop sent from another chain.
- The live trade went through the Uniswap **v2** test pool; the mainnet venue is Uniswap **v3** (fork run only).


## Frontend browser rehearsal — 14 October 2026

The exported Expo app was driven with Playwright locators in Chrome against the deployment above. A loopback-only
EIP-1193 test signer used the existing owner key; real receipts and council records were read from Arc testnet.
No key, wallet storage or trace was saved in the repository. The keeper was off to bound the rehearsal cost.

- [Owner top-up: 0.12 USDC](https://explorer.testnet.arc.io/tx/0x4aa53b1c23b7f8c5fced5409d132055aa09289785d0a85d10f193b8ed2799ece).
- [Grant: 0.10 USDC/day, one day, 2% floor](https://explorer.testnet.arc.io/tx/0x19337ce37101e9701a200b8fc59177633d4600a4c634eb6c43edfd732ae12a4c).
- [Council: approved 4–0](https://explorer.testnet.arc.io/tx/0xe89b69567d8504d25baf58f5eac0b61811b8fd60a39a2d0f7b8926d40f0de233).
- [Trade: 0.04 USDC → 0.000015778031771014 xWETH](https://explorer.testnet.arc.io/tx/0x18d0ece826a79f1eb523929aa10b21bca7961a868e93d403feeaac08addf0a0a),
  XORR-seeded v2 pool; Chainlink mirror floor enforced; Arc Memo tagged. 1498 ms send-to-receipt, 0.007723225 USDC gas.
- [Revoke: hold-to-stop from Home](https://explorer.testnet.arc.io/tx/0x8434be907bcfe71596bb324e17c496748fa4e40e688e31de61eb5799002ab3e2).
  The subsequent account read returned `stopped: true` and `remainingToday: 0`.

Two token approvals also completed. All owner and executor hashes/fees are in `UI-OWNER-TRANSACTIONS.json` and
`UI-BROWSER-TESTNET.json`. Total gas, including funding: **0.015956345 USDC**. Trade plus gas: **0.055956345 USDC**.
Even counting the 0.12 USDC top-up again, gross flow plus fees was **0.175956345 USDC**, below the **0.5 USDC** limit.
The owner retained about 0.080876 USDC and the purchased test token; the permission is stopped.

The RPC finalized tag briefly lagged two mined owner receipts. Home's original-call recovery confirmed each without
resubmitting. The frontend now waits briefly for the tag while retaining every exact-call and canonical-block check;
191 unit tests pass, including both lag regressions. No further live transaction was needed to test that read-only wait.

Gateway, CCTP, USYC and a CCIP stop from another chain remain **Not run**. This rehearsal did not settle the one-hour
reputation horizon, sell the test token, run native mobile apps or broadcast to mainnet.
