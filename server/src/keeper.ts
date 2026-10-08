/**
 * The keeper (it replaces Chainlink CRE, which Arc mainnet does not run): on a timer it
 *   - posts Chainlink's Arc-mainnet answers to the testnet mirror feeds (testnet only),
 *   - settles council rounds past their horizon, which writes the seats' ERC-8004 reputation,
 *   - runs autopilot rounds for owners who switched it on (signed), inside their on-chain permission.
 */
import { createPublicClient, encodeFunctionData, http, type Address } from 'viem';
import { aggregatorAbi, mirrorFeedAbi } from './abis.js';
import { ARC, ASSETS, TRADABLE, type Sym, type XorrDeployment } from '../../shared/arc.js';
import { executor, explain, pub, send } from './chain.js';
import { KEEPER_MS } from './env.js';
import { runRound, settleDue } from './executor.js';
import { store } from './store.js';

const mainnet = createPublicClient({ transport: http(process.env.ARC_MAINNET_RPC_URL ?? ARC['arc-mainnet'].rpcUrl) });
export const keeperLog: { at: number; line: string }[] = [];
const log = (line: string) => {
  keeperLog.unshift({ at: Date.now(), line });
  if (keeperLog.length > 200) keeperLog.length = 200;
  console.log(`[keeper] ${line}`);
};

/** Testnet: copy each mainnet Chainlink round into its mirror feed when mainnet has a newer one. */
export async function postMirrors(d: XorrDeployment): Promise<number> {
  if (!d.mirrorFeeds || !executor) return 0;
  let n = 0;
  for (const sym of ['USDC', 'EURC', 'WETH', 'CBTC'] as Sym[]) {
    const mirror = d.feeds[ASSETS[sym].feedIndex] as Address;
    try {
      const poster = await pub.readContract({ address: mirror, abi: mirrorFeedAbi, functionName: 'poster' });
      if (poster.toLowerCase() !== executor.address.toLowerCase()) continue;
      const src = ARC['arc-mainnet'].chainlink[ASSETS[sym].feed];
      const [m, here] = await Promise.all([
        mainnet.readContract({ address: src, abi: aggregatorAbi, functionName: 'latestRoundData' }),
        pub.readContract({ address: mirror, abi: mirrorFeedAbi, functionName: 'latestRoundData' }),
      ]);
      if (m[3] <= here[3]) continue;
      await send(mirror, encodeFunctionData({ abi: mirrorFeedAbi, functionName: 'post', args: [m[1], m[3]] }), `mirror ${sym}`);
      n++;
    } catch (e) {
      log(`mirror ${sym}: ${explain(e)}`);
    }
  }
  if (n) log(`posted ${n} mirror round(s) from Chainlink Arc mainnet`);
  return n;
}

const lastAuto = new Map<string, number>();
const turn = new Map<string, number>();
const AUTOPILOT_EVERY_MS = Number(process.env.AUTOPILOT_EVERY_MS ?? 10 * 60_000);

export async function autopilot(d: XorrDeployment): Promise<void> {
  for (const [owner, cfg] of Object.entries(store.autopilot())) {
    if (!cfg.on || Date.now() - (lastAuto.get(owner) ?? 0) < AUTOPILOT_EVERY_MS) continue;
    lastAuto.set(owner, Date.now());
    const i = turn.get(owner) ?? 0;
    turn.set(owner, i + 1);
    const sym = TRADABLE[i % TRADABLE.length]!;
    try {
      const r = await runRound(d, owner as Address, { sym, side: 'buy', usd: cfg.usd }, 'autopilot');
      log(`autopilot ${owner.slice(0, 8)} buy ${sym} $${cfg.usd}: ${r.summary}`);
    } catch (e) {
      log(`autopilot ${owner.slice(0, 8)}: ${explain(e)}`);
    }
  }
}

export function startKeeper(d: XorrDeployment) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await postMirrors(d);
      const n = await settleDue(d);
      if (n) log(`settled ${n} round(s): reputation written to ERC-8004`);
      await autopilot(d);
    } catch (e) {
      log(explain(e));
    } finally {
      busy = false;
    }
  };
  void tick();
  return setInterval(tick, KEEPER_MS);
}
