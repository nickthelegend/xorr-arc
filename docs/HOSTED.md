Current production: **Arc mainnet**. See [mainnet hosting and browser checks](HOSTED-MAINNET.md). The report below is historical testnet evidence.

# XORR — Vercel / Live testnet

LEAD: RUN THESE
```sh
node scripts/e2e-browser-hosted.mjs
npm run typecheck
npm --prefix server run typecheck
```

URL: https://xorr-arc.vercel.app
Expo web is exported to static assets. `/api/*` GET requests use the existing Hono reads in a Vercel function.
Configuration, mirror feed values, seeded-pool quotes, account permissions and ERC-8004 agent records come from live Arc testnet, using `deployments/arc-testnet.json`.
Testnet mirror feeds and seeded pools are labelled. Mainnet Proof of Reserve is unavailable here; it requires a local Arc mainnet fork.

The hosted UI explicitly says to start the local executor for council rounds/autopilot. Vercel rejects every mutation, and has no executor key.
The daemon cannot safely be replaced by a cron alone: its replay claims, maintenance quota and transaction queue currently rely on one writer and durable files.
A shared queue/storage migration would be required before enabling hosted execution. Minimum separate server: one Node process, approximately 512 MiB RAM, persistent disk, one writer. No such resource was created.
On-demand demo: use the repo's existing local executor/browser scripts and rebuild the app with its URL. No new transaction was sent during this hosting pass.

Env: `EXPO_PUBLIC_API_URL=/api`, `XORR_NETWORK=arc-testnet`, `ARC_RPC_URL=https://rpc.testnet.arc.io`, `KEEPER=off`.
Deploy: `vercel link --project xorr-arc`, then `vercel deploy --prod --yes` from the repo root.
The API bundles as ESM so Expo's CommonJS tooling and the server's ESM package do not conflict. Env, local state and contract artifacts are excluded from upload.
Screenshots and machine-readable route/API checks replace the deleted hosting evidence in `docs/screens/hosted/`.

Results: 13/13 navigation routes HTTP 200, zero console errors, no mobile overflow. Creating a device key works without a server transaction. Config, markets and agent reads pass; delegation bytecode verified on chain 5042002. POST mutation refusal returns 503 as intended. Frontend and server typechecks pass.
