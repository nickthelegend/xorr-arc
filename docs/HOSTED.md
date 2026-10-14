# Hosted Arc testnet

Live: https://app-production-0530.up.railway.app (Arc testnet)

Railway project `xorr-arc-testnet`:
- `app`: Expo static export served by nginx, public URL above.
- `executor`: https://executor-production-bdf5.up.railway.app ; Hono API, council executor and keeper, one instance with a persistent `/data` volume for rounds, autopilot and replay protection.

Runtime uses `deployments/arc-testnet.json`, chain 5042002, the official Blockdaemon Arc testnet RPC, and the repo's separate executor credential set as a Railway secret. Mainnet calls only read Chainlink prices for labeled testnet mirrors. The keeper runs once per minute. The hosted per-round ceiling is 0.05 USDC. Gateway, CCTP and USYC remain off. API CORS allows the frontend's exact origin.

The Dockerfiles accept the public API build argument, include deployment addresses, initialize the mounted volume's ownership and run the executor as node. Ignore files exclude env files, key directories, fork state, dependencies and generated outputs. Deploy each service from the local repo using `railway up --service executor` and `railway up --service app`.

Evidence is in `docs/screens/hosted/`. `server/scripts/hosted-smoke.ts` uses the dedicated testnet owner to approve only 0.04 USDC, grant a 10-minute capped permission, request one hosted council round and revoke in a finally block. It never sends or logs the private key.

Limits: agents are deterministic rules, not LLMs. Testnet uses seeded Uniswap v2 pools and mirror feeds, not native Chainlink/Uniswap deployments. EURC has no seeded testnet pool. Cross-chain kill switch and Circle products have not been run live; the existing Fork/Not run claims remain unchanged. Fresh hosted storage does not import historical local round JSON. ERC-8004 settlement is eligible one hour after the new round and is handled by the keeper; it is not part of the immediate smoke claim.

Hosted result: all 13 navigation routes and health returned 200. The real 0.04-USDC buy request was vetoed because the seeded pool quote was 328 bps away from Chainlink, beyond the 150-bps limit. Approval, grant and revoke were mined; permission is revoked. Total testnet gas was 0.0075009625 USDC. No buy fill is claimed for this hosted run. See action.json for the complete ballots and transactions.

Both Railway deployments reached SUCCESS. Browser console errors: none. Live mirror prices, ERC-8004 seats and the recorded veto round rendered; the exact-origin CORS check passed.
