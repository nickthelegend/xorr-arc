#!/usr/bin/env node
/**
 * XORR's core loop on a local fork of Arc MAINNET, with real signed transactions, in one command:
 *
 *   npm run e2e:fork                       # stock Foundry: USDC is a stateless ERC-20 stand-in (see below)
 *   ARC_FOUNDRY=/path/to/arc-foundry npm run e2e:fork   # Circle's Arc Foundry: the real native-USDC precompile and Memo
 *
 * It starts anvil forking https://rpc.mainnet.arc.io on port 9110, deploys the contracts with the real deploy script,
 * starts the executor on 9120, runs server/scripts/e2e.ts (grant -> council -> Uniswap v3 trade under the cap with the
 * Chainlink floor -> revoke -> refused), writes docs/E2E-FORK.md, then stops ONLY the processes it started (by PID).
 *
 * Stock Foundry cannot execute Arc's native-USDC precompile or the Memo (CallFrom) precompile. In that mode this script
 * puts test/mocks/ForkUsdcShim.sol over 0x3600… and mints the shim the exact USDC balances the real Uniswap pools hold;
 * everything else (Uniswap v3 pools and router, Chainlink feeds, WETH/EURC/cirBTC, ERC-8004) is Arc's real state, and the
 * trades go untagged because Memo cannot run. docs/E2E-FORK.md records which mode produced it.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AF = process.env.ARC_FOUNDRY ?? '';
const bin = (n) => (AF ? join(AF, n) : n);
const ANVIL_PORT = Number(process.env.ARC_FORK_PORT ?? 9110);
const API_PORT = Number(process.env.XORR_API_PORT ?? 9120);
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;
const UPSTREAM = process.env.ARC_MAINNET_RPC_URL ?? 'https://rpc.mainnet.arc.io';
const USDC = '0x3600000000000000000000000000000000000000';
// The real Uniswap v3 USDC pools XORR trades through (docs/VENUES.md): cirBTC, EURC, WETH.
const POOLS = ['0x82916bee18fCEF517B26C72d7Cb5F13694E1dB41', '0x6fd5F2fb831940DcD61A98c5B3aCB7D8C6f3bFc1', '0x964cFF2cCCB9059e83D507df348f070e5257A2e0'];
const fork = resolve(ROOT, '.fork');
mkdirSync(fork, { recursive: true });

const started = []; // [{ name, pid }] — the only processes this script may stop
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const rpc = async (method, params = []) => {
  const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json();
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
};
const up = (url) => fetch(url).then((r) => r.ok || r.status < 500, () => false);
const waitFor = async (what, fn, secs) => {
  for (let i = 0; i < secs; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${what} did not come up in ${secs}s`);
};
function stopAll() {
  for (const p of started.reverse()) {
    try { process.kill(p.pid); console.log(`stopped ${p.name} (pid ${p.pid})`); } catch { /* already gone */ }
  }
}
process.on('SIGINT', () => { stopAll(); process.exit(130); });

async function main() {
  if (await fetch(RPC, { method: 'POST', body: '{}' }).then(() => true, () => false)) {
    throw new Error(`port ${ANVIL_PORT} is already in use; set ARC_FORK_PORT to a free port in 9100-9199`);
  }
  const mode = AF ? 'Arc Foundry (real native-USDC precompile and Memo)' : 'stock Foundry (USDC stand-in over 0x3600…, no Memo)';
  console.log(`mode: ${mode}`);

  // 1. the fork, pinned two blocks behind the tip
  const tip = parseInt(sh(bin('cast'), ['block-number', '--rpc-url', UPSTREAM]), 10);
  const block = process.env.ARC_FORK_BLOCK ?? String(tip - 2);
  const anvilArgs = [...(AF ? ['--network', 'arc'] : []), '--fork-url', UPSTREAM, '--fork-block-number', block, '--port', String(ANVIL_PORT),
    '--compute-units-per-second', '40', '--fork-retry-backoff', '2000', '--retries', '8', '--silent'];
  const anvil = spawn(bin('anvil'), anvilArgs, { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  started.push({ name: 'anvil', pid: anvil.pid });
  writeFileSync(join(fork, 'mainnet.pid'), String(anvil.pid));
  await waitFor('anvil', () => fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }).then((r) => r.ok, () => false), 120);
  console.log(`forked Arc mainnet at block ${block} on ${RPC} (anvil pid ${anvil.pid})`);

  // 2. stock Foundry: USDC stand-in carrying the pools' real USDC balances
  if (!AF) {
    sh(bin('forge'), ['build'], { cwd: join(ROOT, 'contracts') });
    const art = JSON.parse(readFileSync(join(ROOT, 'contracts/out/ForkUsdcShim.sol/ForkUsdcShim.json'), 'utf8'));
    const held = [];
    for (const pool of POOLS) held.push([pool, sh(bin('cast'), ['call', USDC, 'balanceOf(address)(uint256)', pool, '--rpc-url', RPC]).split(' ')[0]]);
    await rpc('anvil_setCode', [USDC, art.deployedBytecode.object]);
    for (const [who, amt] of held) await setUsdc(who, BigInt(amt));
    console.log(`USDC stand-in etched at ${USDC}; pools hold ${held.map(([, a]) => (Number(a) / 1e6).toFixed(0)).join(' / ')} USDC as on mainnet`);
  }

  // 3. keys, native gas, and the real deploy script (scripts/arc-fork.sh skips starting anvil: it is already up)
  const env = { ...process.env, ARC_FORK_PORT: String(ANVIL_PORT) };
  if (AF) env.ARC_FOUNDRY = AF;
  console.log(sh('sh', ['scripts/arc-fork.sh', 'mainnet'], { env }).split('\n').slice(-3).join('\n'));
  const keys = readFileSync(join(fork, 'keys.env'), 'utf8');
  const ownerKey = /FORK_OWNER_KEY=(0x[0-9a-fA-F]{64})/.exec(keys)?.[1];
  const owner = sh(bin('cast'), ['wallet', 'address', '--private-key', ownerKey]);
  if (!AF) await setUsdc(owner, 1_000_000_000n); // 1,000 USDC (arc-fork.sh funded gas natively; Arc Foundry's native balance IS the USDC)
  const dep = resolve(fork, 'arc-mainnet-fork.json');
  if (!existsSync(dep)) throw new Error('the deploy script did not write .fork/arc-mainnet-fork.json');

  // 4. the executor
  const dataDir = join(fork, 'data');
  rmSync(dataDir, { recursive: true, force: true });
  const server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: join(ROOT, 'server'),
    env: { ...process.env, XORR_NETWORK: 'arc-mainnet', ARC_RPC_URL: RPC, XORR_DEPLOYMENT: dep, XORR_EXECUTOR_KEY_FILE: '.fork/keys.env', PORT: String(API_PORT), XORR_DATA_DIR: dataDir, ALLOWED_ORIGINS: '*', KEEPER: 'on', KEEPER_TICK_MS: '5000' },
    stdio: ['ignore', openLog('server.log'), openLog('server.log')],
  });
  started.push({ name: 'executor', pid: server.pid });
  writeFileSync(join(fork, 'server.pid'), String(server.pid));
  await waitFor('executor', () => up(`${API}/health`), 90);
  console.log(`executor up on ${API} (pid ${server.pid})`);

  // 5. the loop
  let log = '';
  let failed = false;
  const e2e = spawn('npx', ['tsx', 'scripts/e2e.ts'], { cwd: join(ROOT, 'server'), env: { ...process.env, XORR_API: API, ARC_RPC_URL: RPC, OWNER_KEY_FILE: '.fork/keys.env' } });
  e2e.stdout.on('data', (d) => { process.stdout.write(d); log += d; });
  e2e.stderr.on('data', (d) => { process.stderr.write(d); log += d; });
  await new Promise((r) => e2e.on('close', (code) => { failed = code !== 0; r(); }));

  const doc = `# End-to-end on an Arc mainnet fork

Produced by \`npm run e2e:fork\` (scripts/e2e-fork.mjs) on ${new Date().toISOString().slice(0, 10)}.

- Fork: Arc mainnet (chain id 5042) at block ${block}, local anvil on ${RPC}. Nothing was sent to the public network.
- Mode: **${mode}**.
- Contracts: the real deploy script (contracts/script/Deploy.s.sol) against the real Uniswap v3 SwapRouter02, Chainlink Arc feeds and ERC-8004 registries.
- Result: **${failed ? 'FAILED' : 'all steps passed'}**.
${AF ? '' : `
> Stock Foundry cannot execute Arc's native-USDC precompile or Memo's CallFrom precompile, so in this mode the USDC ERC-20 at
> 0x3600… is replaced by contracts/test/mocks/ForkUsdcShim.sol (carrying the pools' real USDC balances) and trades are not
> Memo-tagged. Re-run with \`ARC_FOUNDRY=<dir with Circle's anvil/forge/cast>\` for the real precompiles and the Memo tag.
`}
\`\`\`
${log.replace(/\x1b\[[0-9;]*m/g, '').trim()}
\`\`\`
`;
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(join(ROOT, 'docs/E2E-FORK.md'), doc);
  if (failed) process.exitCode = 1;
}

// anvil_setStorageAt on OpenZeppelin v5 ERC20: _balances is slot 0
async function setUsdc(who, amount) {
  const slot = sh(bin('cast'), ['index', 'address', who, '0']);
  await rpc('anvil_setStorageAt', [USDC, slot, '0x' + amount.toString(16).padStart(64, '0')]);
}
const openLog = (name) => openSync(join(fork, name), 'w');

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(stopAll);
