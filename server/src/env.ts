/**
 * Where the executor runs and with what: the Arc network, XORR's deployment on it, and the executor's key.
 *
 *   XORR_NETWORK         arc-testnet (default) | arc-mainnet
 *   XORR_DEPLOYMENT      path to the deployment JSON (default ../deployments/<network>.json; a fork writes .fork/…)
 *   ARC_RPC_URL          the RPC to use (default: the network's public RPC; a fork: http://127.0.0.1:9110)
 *   XORR_EXECUTOR_KEY    the executor's private key: council recorder, the agent that trades, the keeper
 *   XORR_EXECUTOR_KEY_FILE  or a file holding `XORR_EXECUTOR_KEY=0x…` / `FORK_EXECUTOR_KEY=0x…` (never committed)
 *   ALLOW_MAINNET=yes    required to start against arc-mainnet: a deliberate decision, never a default
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hex } from 'viem';
import { ARC, type ArcConfig, type ArcNetwork, type XorrDeployment } from '../../shared/arc.js';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = existsSync(resolve(here, '../../package.json')) ? resolve(here, '../..') : resolve(here, '../../../..');

function loadDotEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
}
loadDotEnv(resolve(ROOT, 'server/.env'));
loadDotEnv(resolve(ROOT, '.env.local'));

const asked = (process.env.XORR_NETWORK ?? 'arc-testnet') as ArcNetwork;
if (!(asked in ARC)) throw new Error(`XORR_NETWORK=${asked} is not arc-testnet or arc-mainnet`);
if (asked === 'arc-mainnet' && process.env.ALLOW_MAINNET !== 'yes' && !process.env.ARC_RPC_URL?.includes('127.0.0.1')) {
  throw new Error('XORR_NETWORK=arc-mainnet needs ALLOW_MAINNET=yes: real money, a deliberate decision.');
}
export const NETWORK: ArcNetwork = asked;
export const CFG: ArcConfig = ARC[NETWORK];
export const RPC_URL = process.env.ARC_RPC_URL ?? CFG.rpcUrl;
export const IS_FORK = /127\.0\.0\.1|localhost/.test(RPC_URL);

const deploymentPath = resolve(ROOT, process.env.XORR_DEPLOYMENT ?? `deployments/${NETWORK}.json`);
export function loadDeployment(): XorrDeployment | null {
  if (!existsSync(deploymentPath)) return null;
  return JSON.parse(readFileSync(deploymentPath, 'utf8')) as XorrDeployment;
}
export const DEPLOYMENT = loadDeployment();
export const DEPLOYMENT_PATH = deploymentPath;

function keyFromFile(): Hex | undefined {
  const f = process.env.XORR_EXECUTOR_KEY_FILE;
  if (!f) return undefined;
  const text = readFileSync(resolve(ROOT, f), 'utf8');
  const m = /^(?:XORR_EXECUTOR_KEY|XORR_EXECUTOR_PRIVATE_KEY|FORK_EXECUTOR_KEY)=(0x[0-9a-fA-F]{64})/m.exec(text);
  return m?.[1] as Hex | undefined;
}
export const EXECUTOR_KEY: Hex | undefined = (process.env.XORR_EXECUTOR_KEY as Hex | undefined) ?? keyFromFile();

export const PORT = Number(process.env.PORT ?? 9120);
export const DATA_DIR = resolve(ROOT, process.env.XORR_DATA_DIR ?? 'server/data');
export const KEEPER_MS = Number(process.env.KEEPER_TICK_MS ?? 30_000);
export const KEEPER = process.env.KEEPER !== 'off';
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
/** Largest single council trade, USDC. The on-chain cap is the real limit; this keeps rounds small. */
export const MAX_ROUND_USD = Number(process.env.MAX_ROUND_USD ?? (NETWORK === 'arc-mainnet' ? 25 : 50));
/** Price Desk: the most a quote may sit from Chainlink, in bps (the on-chain floor is the owner's slippage). */
export const MAX_GAP_BPS = Number(process.env.MAX_GAP_BPS ?? 150);
/**
 * Extras that cannot be exercised on a fork (they need Circle's live attestation services) stay off until an operator
 * turns them on: FEATURE_GATEWAY=on, FEATURE_CCTP=on, FEATURE_USYC=on. The core loop (permission, council, trade, revoke) never needs them.
 */
export const FEATURES = {
  gateway: process.env.FEATURE_GATEWAY === 'on',
  cctp: process.env.FEATURE_CCTP === 'on',
  usyc: process.env.FEATURE_USYC === 'on',
};
