# End-to-end on an Arc mainnet fork

Produced by `npm run e2e:fork` (scripts/e2e-fork.mjs) on 2026-10-09.

- Fork: Arc mainnet (chain id 5042) at block 25109689, local anvil on http://127.0.0.1:9110. Nothing was sent to the public network.
- Mode: **Arc Foundry (real native-USDC precompile and Memo)**.
- Contracts: the real deploy script (contracts/script/Deploy.s.sol) against the real Uniswap v3 SwapRouter02, Chainlink Arc feeds and ERC-8004 registries.
- Result: **all steps passed**.

```
XORR e2e on arc-mainnet (local fork); owner 0xD249712bD37D4E063fd1dF81986F4C3bc5B70Bc6; agent 0x33Fea3A69a3C9357Ab6c8a06548D9202eD461F04; Memo live
✔ 1 approve — USDC, cirBTC, EURC, WETH approved to XorrDelegation
✔ 2 grant — $40/day, 7 days, 1% slippage, venue 0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77 (0x324d8a9865d775a90eafb11bf5ffcfee7e33eab49af4421825b8ef0a868e737a); CCIP stop receiver is a guardian
✔ 3 buy cirBTC $10 — Approved 4–1. 0xdced3b8bc366662e09e0ca7907b9c885d1a01e0537b8d4a5c916922a154577d2 in 1420 ms, received 12089 sats, memo tagged
✔ 4 buy EURC $10 — Approved 4–0. 0x2407dd7c4496507240d7b8f7d016dba43271128b974b5f296b48cad50dcdec4b, received 8.930718 EURC
✔ 5 over-cap round — Vetoed by the Risk Keeper: $25.00 is more than the $20.00 left of today's $40.00 cap; the contract would refuse it.
✔ 6 raw over-cap spend — XorrDelegation refuses: DailyCapExceeded(25000000, 20000000)
✔ 7 sell cirBTC — Approved 5–0. 0x51d15e73360ba164b4121938c360366d3387b746e1eef6c2f01951e780174a9b, received 9.517865 USDC
✔ 8 settle → ERC-8004 — 3 rounds settled by the keeper; 5 seats now have reputation on the ERC-8004 Reputation Registry (Price Desk n=3 Σ=0.14%, Risk Keeper n=3 Σ=0.14%, Trend Reader n=2 Σ=0.08%, Peg Desk n=3 Σ=0.14%, Strategist n=2 Σ=0.21%)
✔ 9 kill switch — revoke 0x1244dbdb7d0819caeb0acde6998c4a4189f525e2a5b4a67651128112601bae90; next round: Vetoed by the Risk Keeper: The owner stopped the agents (kill switch).
✔ 10 raw spend after revoke — XorrDelegation refuses: PolicyRevoked

owner now: 989.506519 USDC, 8.930718 EURC, 0.000000 WETH, 0.000006 cirBTC; gas left 989.5065 USDC
owner transactions: 7; passed 10/10
```
