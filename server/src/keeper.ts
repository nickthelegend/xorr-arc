/**
 * The keeper (it replaces Chainlink CRE, which Arc mainnet does not run): on a timer it
 *   - posts Chainlink's Arc-mainnet answers to the testnet mirror feeds (testnet only),
 *   - settles council rounds past their horizon, which writes the seats' ERC-8004 reputation,
 *   - runs autopilot rounds for owners who switched it on (signed), inside their on-chain permission.
 */
import { type Address } from 'viem';
import { TRADABLE, type XorrDeployment } from '../../shared/arc.js';
import { explain } from './chain.js';
import { KEEPER_MS, NETWORK } from './env.js';
import { runRound, settleDue } from './executor.js';
import { store } from './store.js';
import { postMirrors } from './mirrors.js';
export { postMirrors } from './mirrors.js';

export const keeperLog: { at: number; line: string }[] = [];
const log = (line: string) => {
  keeperLog.unshift({ at: Date.now(), line });
  if (keeperLog.length > 200) keeperLog.length = 200;
  console.log(`[keeper] ${line}`);
};

const lastAuto = new Map<string, number>();
const turn = new Map<string, number>();
const AUTOPILOT_EVERY_MS = Number(process.env.AUTOPILOT_EVERY_MS ?? 10 * 60_000);

export async function autopilot(d: XorrDeployment): Promise<void> {
  for (const [owner, cfg] of Object.entries(store.autopilot())) {
    if (!cfg.on || Date.now() - (lastAuto.get(owner) ?? 0) < AUTOPILOT_EVERY_MS) continue;
    lastAuto.set(owner, Date.now());
    const i = turn.get(owner) ?? 0;
    turn.set(owner, i + 1);
    const tradable = NETWORK === 'arc-testnet' ? ['WETH'] as const : TRADABLE;
    const sym = tradable[i % tradable.length]!;
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
