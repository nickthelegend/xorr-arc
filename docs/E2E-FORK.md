# End-to-end on an Arc mainnet fork

Produced by `npm run e2e:fork` (scripts/e2e-fork.mjs) on 2026-10-09.

- Fork: Arc mainnet (chain id 5042) at block 25109206, local anvil on http://127.0.0.1:9110. Nothing was sent to the public network.
- Mode: **stock Foundry (USDC stand-in over 0x3600…, no Memo)**.
- Contracts: the real deploy script (contracts/script/Deploy.s.sol) against the real Uniswap v3 SwapRouter02, Chainlink Arc feeds and ERC-8004 registries.
- Result: **all steps passed**.

> Stock Foundry cannot execute Arc's native-USDC precompile or Memo's CallFrom precompile, so in this mode the USDC ERC-20 at
> 0x3600… is replaced by contracts/test/mocks/ForkUsdcShim.sol (carrying the pools' real USDC balances) and trades are not
> Memo-tagged. Re-run with `ARC_FOUNDRY=<dir with Circle's anvil/forge/cast>` for the real precompiles and the Memo tag.

```
XORR e2e on arc-mainnet (local fork); owner 0xD249712bD37D4E063fd1dF81986F4C3bc5B70Bc6; agent 0x33Fea3A69a3C9357Ab6c8a06548D9202eD461F04; Memo not live
✔ 1 approve — USDC, cirBTC, EURC, WETH approved to XorrDelegation
✔ 2 grant — $40/day, 7 days, 1% slippage, venue 0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77 (0xf8ad0e5e2fa287d5e645bc2e9879a13fe61ffd1591bedbe4f4a0fa9c249c4e11); CCIP stop receiver is a guardian
✔ 3 buy cirBTC $10 — Approved 4–1. 0x20985adb533686ee76129e57d1d48590a62d6a978b3b4cdff66efc2e1771400d in 639 ms, received 12089 sats, memo not tagged
✔ 4 buy EURC $10 — Approved 4–0. 0xd9e8bb75bcb9d1c00a0883c2c40f9b787a6baae457f28e783acec262c0903540, received 8.930785 EURC
✔ 5 over-cap round — Vetoed by the Risk Keeper: $25.00 is more than the $20.00 left of today's $40.00 cap; the contract would refuse it.
✔ 6 raw over-cap spend — XorrDelegation refuses: DailyCapExceeded(25000000, 20000000)
✔ 7 sell cirBTC — Approved 5–0. 0x544ab153f4b109d9bf91b12d7c1b74003d05e20b17c3badfc25b5efc1bfb7274, received 9.517911 USDC
✔ 8 settle → ERC-8004 — 4 rounds settled by the keeper; 5 seats now have reputation on the ERC-8004 Reputation Registry (Price Desk n=4 Σ=0.05%, Risk Keeper n=4 Σ=0.05%, Trend Reader n=3 Σ=0.12%, Peg Desk n=4 Σ=0.05%, Strategist n=3 Σ=0.07%)
✔ 9 kill switch — revoke 0x1244dbdb7d0819caeb0acde6998c4a4189f525e2a5b4a67651128112601bae90; next round: Vetoed by the Risk Keeper: The owner stopped the agents (kill switch).
✔ 10 raw spend after revoke — XorrDelegation refuses: PolicyRevoked

owner now: 989.517911 USDC, 8.930785 EURC, 0.000000 WETH, 0.000006 cirBTC; gas left 999.9991 USDC
owner transactions: 7; passed 10/10
```
