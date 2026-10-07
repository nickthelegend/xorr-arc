# XORR contracts (Arc)

| Contract | What it does |
|---|---|
| `XorrDelegation` | The permission: per-agent daily USDC cap, expiry, owner venue allowlist (⊆ registry), Chainlink price floor on every fill, one-tap revoke, guardians that can only stop. Holds nothing. No admin. |
| `XorrPriceGuard` | Chainlink Data Feeds on Arc → `quote(tokenIn, tokenOut, amount)` with staleness/round checks. Feed changes are 24 h timelocked. |
| `XorrVenueRegistry` | Curated DEX routers the delegation may ever call. Adds are 24 h timelocked; removals are immediate. |
| `XorrCouncil` | Council decisions + votes; fills reported by the delegation; permissionless `settle` measures each decision against Chainlink and writes ERC-8004 reputation for every seat. |
| `ccip/XorrStopReceiver` | Arc side of the cross-chain kill switch (defensive CCIP receiver, retryable). |
| `ccip/XorrStopSender` | Base/Ethereum side: `stopAll()` / `revokeAgent()` for `msg.sender`, fee in native coin. |

Uniswap v2 is deployed from its published npm bytecode (`script/lib/Artifacts.sol`), not recompiled.

```sh
sh setup.sh                  # deps
forge test                   # unit + fuzz + invariant + Chainlink Local CCIP
ARC_FORK_TESTS=1 <arc-foundry>/forge test --match-path 'test/fork/*' --network arc   # Arc mainnet fork (real feeds)
```
