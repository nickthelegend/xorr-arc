# Arc mainnet on Vercel

LEAD: RUN THESE
```sh
node scripts/e2e-browser-hosted-mainnet.mjs
```

Live: https://xorr-arc.vercel.app (Arc mainnet, chain 5042).
Production reads `deployments/arc-mainnet.json` with RPC `https://rpc.mainnet.arc.io` and explorer `https://explorer.arc.io`.
Network configuration, contract bytecode, routes, rendered wording and explorer links are checked by the script. Detailed outcomes are in `docs/screens/mainnet/*/results.json`; failures remain failures.

Hosted mode reads mainnet markets and contracts; council execution needs the on-demand local executor.

Service credentials were supplied to Vercel via stdin from the ignored `.deployer/mainnet/` files. Read-only broker/executor/studio frontends do not receive signing keys. Mainnet databases have separate names from historical data. No new database, Railway or paid resource was provisioned.

The previous production artifacts were retained at `https://xorr-arc-testnet.vercel.app` (Vercel aliases, no extra build). These are frozen historical builds, not a freshly verified preview environment; shared backend URLs may now resolve to mainnet. Do not use them for transaction rehearsals without checking the displayed chain.

This migration performs reads only: no wallet connection, signature, deposit, payment, withdrawal or chain broadcast. Mainnet contract/deployment transaction evidence is recorded separately in the repository. Local executors remain an on-demand demo requirement, not an always-on hosting service provisioned here.

Verified: 13 routes returned HTTP 200 with no rendered testnet wording, wrong Arc explorer link or uncaught page exception. Network APIs and RPC reported chain 5042; expected mainnet contract bytecode was present. Screenshots and machine-readable results are saved beside this report.

## Final hosted polish — 2026-10-15

Four original mainnet video council rounds (one filled, three vetoed) are served from a verified deployment archive, scoped to the mainnet council address. Decision receipts and trade receipt were checked. The hosted executor remains read-only; no live transaction queue or autopilot was enabled.

Re-run: `node scripts/e2e-browser-hosted-mainnet.mjs` and `node scripts/e2e-browser-hosted-proof.mjs`.

No mainnet broadcasts or paid API calls. Live mainnet reads and DB writes only; fork transactions and complete wallet sign-ins: Not run.
