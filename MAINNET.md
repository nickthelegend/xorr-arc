# Deploying XORR to Arc mainnet (chain 5042)

Nothing here has been run against Arc mainnet. The same deploy script was run in full on a local fork of mainnet (21
transactions, 10,202,761 gas) and, with testnet differences, on Arc testnet (`deployments/arc-testnet.json`).

## 1. Money

Gas is USDC at a 20 gwei floor, so gas in USDC is `gas x 20e-9`.

| Item | Estimate |
|---|---|
| Contract deploy (21 txs, 10.2M gas) | 0.21 USDC |
| Executor key (council records, settles, keeper) | fund 1 USDC; about 0.01-0.03 USDC per round |
| Demo owner wallet gas (approvals, grant, revoke) | 0.5 USDC |
| Demo trading balance (mainnet round cap is 25 USDC) | 20 USDC |
| **Total for deploy plus a demo** | **about 22 USDC (3 USDC without trading)** |

Deployer: `0x0648aDF1967692A0c991d7715b0b588452321FBd`. The executor is a separate fresh key; never reuse the deployer.

## 2. Deploy

```sh
# from the repo root; the key file defines DEPLOYER_PRIVATE_KEY and is read inside the script, never printed
ARC_FOUNDRY=<dir with Circle's forge/cast, optional> \
DEPLOYER_ENV="/Volumes/Extreme SSD/Projects/arc/.deployer/deployer.env" \
DEPLOY_LOCK="/Volumes/Extreme SSD/Projects/arc/.deployer/lock" \
XORR_EXECUTOR=0x<executor address> VERIFY=1 \
  sh scripts/deploy.sh mainnet
```

It builds, checks the RPC answers chain 5042, runs `contracts/script/Deploy.s.sol`, verifies on explorer.arc.io
(Blockscout), and writes `deployments/arc-mainnet.json`. Commit that file. The daily-cap ceiling is small by default
(`DAILY_CAP_CEILING`, USDC units); mainnet has no seeded pools and no mirror feeds.

`XorrDelegation` has no admin and holds nothing. The deployer owns (two-step) `XorrVenueRegistry`, `XorrPriceGuard` and
`XorrCouncil`: venue and feed additions are 24 h timelocked, removals are immediate, and the council owner only registers
seats and recorders. Move ownership to a multisig after deploy if you have one. Details: `contracts/README.md`.

## 3. Executor (on demand locally; public hosting decision pending)

The current implementation requires durable files and one writer for replay protection, maintenance quota and nonce sequencing.
Use it locally for the demo. Do not create Railway or other paid resources. Public serverless deployment needs a durable
database/queue migration first; keep the lead informed rather than losing state in ephemeral functions.

| Variable | Value |
|---|---|
| `XORR_NETWORK` | `arc-mainnet` |
| `ALLOW_MAINNET` | `yes` (deliberate) |
| `XORR_DEPLOYMENT` | absolute path of `deployments/arc-mainnet.json` in the image or volume |
| `XORR_EXECUTOR_KEY` | the executor private key (secret environment variable) |
| `KEEPER` | `on` once the loop is checked (settles rounds into ERC-8004, runs autopilot) |
| `ALLOWED_ORIGINS` | the exact frontend origin |
| `MAX_ROUND_USD` | default 25 on mainnet |
| `FEATURE_GATEWAY`, `FEATURE_CCTP`, `FEATURE_USYC` | leave `off` unless you test them live |

Liveness: `/health`. Full list: `server/.env.example`.

## 4. Frontend (Vercel)

`EXPO_PUBLIC_API_URL=<executor URL> npm run build:web`, publish `dist-web`. The app reads chain, addresses and features
from the executor's `/config`, so it needs no other variable.

## 5. Services that must run

The executor (API, council, keeper) is the only service. No indexer. Chainlink CRE is not used (Arc mainnet does not run
it); the keeper does settlement. For the CCIP stop from another chain, deploy `XorrStopSender` on Base or Ethereum
(`contracts/src/ccip`) and have users register the Arc `XorrStopReceiver` as a guardian; untested over a live lane.

## 6. After deploy

`npm run e2e:fork` proves the loop on a fork. On mainnet do the same by hand with 5-20 USDC: grant a $10 cap, run a
round, check the Memo log on the trade (`Memo(...)` event from `0x5294...e505`), revoke, and confirm the next round is
refused.
