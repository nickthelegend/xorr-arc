#!/usr/bin/env node
/**
 * XORR's core loop on the REAL Arc testnet (chain 5042002), with real transactions, in one command:
 *
 *   OWNER_KEY_FILE=/path/to/file-with-OWNER_KEY=0x… \
 *   XORR_EXECUTOR_KEY_FILE=/path/to/file-with-XORR_EXECUTOR_PRIVATE_KEY=0x… \
 *     node scripts/e2e-testnet.mjs
 *
 * Needs roughly 1.2 testnet USDC on the owner (gas plus a few cents of trades) and 0.4 on the executor (gas), a throwaway
 * owner you fund yourself (faucet.circle.com, or send from the deployer). It uses the deployment in
 * deployments/arc-testnet.json: XORR's own Uniswap v2 pools (xWETH) priced by mirror feeds of Chainlink's Arc mainnet
 * answers, because Arc testnet has neither Uniswap nor Chainlink feeds. It starts ONE executor on port 9121, runs
 * server/scripts/e2e.ts (grant a $0.20/day permission -> council -> a $0.04 trade with the price floor and Memo -> an
 * over-cap round and two mined reverts -> sell back -> revoke -> refused), writes docs/E2E-TESTNET.md with explorer links,
 * then stops ONLY the executor it started (by PID). No key is printed: both are read from their files inside this process.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = Number(process.env.XORR_API_PORT ?? 9121);
const API = `http://127.0.0.1:${API_PORT}`;
const RPC = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io';
const ownerFile = resolve(ROOT, process.env.OWNER_KEY_FILE ?? '../.deployer/xorr-testnet-owner.env');
const execFile = resolve(ROOT, process.env.XORR_EXECUTOR_KEY_FILE ?? '../.deployer/xorr-roles.env');
for (const f of [ownerFile, execFile]) if (!existsSync(f)) throw new Error(`missing key file ${f}`);
const pick = (file, names) => new RegExp(`^(?:${names})=(0x[0-9a-fA-F]{64})`, 'm').exec(readFileSync(file, 'utf8'))?.[1];
const executorKey = pick(execFile, 'XORR_EXECUTOR_KEY|XORR_EXECUTOR_PRIVATE_KEY');
if (!executorKey || !pick(ownerFile, 'OWNER_KEY')) throw new Error('key files do not hold OWNER_KEY / XORR_EXECUTOR_PRIVATE_KEY');

const dataDir = join(ROOT, '.fork/testnet-data');
mkdirSync(dataDir, { recursive: true });
let serverPid = 0;
const stop = () => {
  if (!serverPid) return;
  try { process.kill(serverPid); console.log(`stopped executor (pid ${serverPid})`); } catch { /* gone */ }
  serverPid = 0;
};
process.on('SIGINT', () => { stop(); process.exit(130); });

async function main() {
  if (await fetch(`${API}/health`).then(() => true, () => false)) throw new Error(`port ${API_PORT} is in use; set XORR_API_PORT (9100-9199)`);
  const server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: join(ROOT, 'server'),
    env: { ...process.env, XORR_NETWORK: 'arc-testnet', ARC_RPC_URL: RPC, XORR_EXECUTOR_KEY: executorKey, PORT: String(API_PORT), XORR_DATA_DIR: dataDir, ALLOWED_ORIGINS: '*', KEEPER: 'on', KEEPER_TICK_MS: '20000' },
    stdio: ['ignore', openSync(join(ROOT, '.fork/testnet-server.log'), 'w'), openSync(join(ROOT, '.fork/testnet-server.log'), 'a')],
  });
  serverPid = server.pid;
  writeFileSync(join(ROOT, '.fork/testnet-server.pid'), String(server.pid));
  for (let i = 0; i < 90 && !(await fetch(`${API}/health`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 1000));
  console.log(`executor up on ${API} (pid ${server.pid})`);

  let log = '';
  let failed = false;
  const e2e = spawn('npx', ['tsx', 'scripts/e2e.ts'], {
    cwd: join(ROOT, 'server'),
    env: { ...process.env, XORR_API: API, ARC_RPC_URL: RPC, OWNER_KEY_FILE: ownerFile, XORR_EXECUTOR_KEY: executorKey },
  });
  e2e.stdout.on('data', (d) => { process.stdout.write(d); log += d; });
  e2e.stderr.on('data', (d) => { process.stderr.write(d); log += d; });
  await new Promise((r) => e2e.on('close', (code) => { failed = code !== 0; r(); }));

  const cfg = await (await fetch(`${API}/config`)).json().catch(() => ({}));
  const doc = `# End-to-end on Arc testnet (live)

Produced by \`node scripts/e2e-testnet.mjs\` (scripts/e2e-testnet.mjs + server/scripts/e2e.ts) on ${new Date().toISOString().slice(0, 10)}.

- Network: **Arc testnet** (chain id 5042002, ${RPC}). Real transactions; explorer links below open on https://explorer.testnet.arc.io.
- Contracts: the live deployment in \`deployments/arc-testnet.json\` (XorrDelegation \`${cfg.deployment?.delegation ?? ''}\`).
- Market: **XORR-seeded**. Arc testnet has no Uniswap and no Chainlink feeds, so the trade runs on XORR's own ~5 USDC Uniswap v2 pool for the
  XORR test token xWETH, floored on chain by a mirror feed of Chainlink's Arc **mainnet** ETH/USD answer. Mainnet uses the real
  Uniswap v3 pools and real Chainlink feeds (proven on a mainnet fork: \`docs/E2E-FORK.md\`).
- Sizes are pennies on purpose: the pool is 5 USDC deep, so a $0.04 buy already moves its price about 1%.
- Memo was ${cfg.memoLive ? 'live on this node: the trade went through Arc\'s Memo with the council decision id as memo id' : 'not live on this node'}.
- Result: **${failed ? 'FAILED' : 'all steps passed'}**.

\`\`\`
${log.replace(/\x1b\[[0-9;]*m/g, '').trim()}
\`\`\`
`;
  writeFileSync(join(ROOT, 'docs/E2E-TESTNET.md'), doc);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(stop);
