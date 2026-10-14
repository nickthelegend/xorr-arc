/** TESTNET ONLY. Re-peg XORR's seeded xWETH pool by donating faucet tokens or bounded executor USDC.
 * The mirror remains the unchanged mainnet answer. No owner funds, changed oracle, or relaxed floor.
 */
import { encodeFunctionData, parseAbi, type Hex } from 'viem';
import type { XorrDeployment } from '../../shared/arc.js';
import { executor, explain, pub, send } from './chain.js';
import { NETWORK } from './env.js';
import { readFeed } from './market.js';
import { planRepeg } from './repeg-plan.js';
import { store } from './store.js';

const abi = parseAbi([
  'function getPair(address,address) view returns(address)',
  'function token0() view returns(address)', 'function token1() view returns(address)',
  'function balanceOf(address) view returns(uint256)', 'function transfer(address,uint256) returns(bool)',
  'function faucet()', 'function faucetAmount() view returns(uint256)', 'function sync()',
]);
export type Repeg = { status: 'aligned' | 'repegged' | 'unavailable'; note: string; hashes: Hex[]; addedUsdc?: string; gapBps?: number };
export async function repegTestnet(d: XorrDeployment): Promise<Repeg> {
  const hashes: Hex[] = [];
  try {
    if (NETWORK !== 'arc-testnet' || d.chainId !== 5042002 || !d.mirrorFeeds || d.venueKind !== 'uniswap-v2') throw Error('Re-peg is testnet v2 only');
    if (!executor || !d.v2Factory || await pub.getChainId() !== 5042002) throw Error('Testnet executor unavailable');
    const feed = await readFeed(d, 'WETH');
    if (!feed.fresh) throw Error('Mirror stale: pool unchanged');
    const pair = await pub.readContract({ address: d.v2Factory, abi, functionName: 'getPair', args: [d.usdc, d.weth] });
    const [t0, t1, u, t] = await Promise.all([
      pub.readContract({ address: pair, abi, functionName: 'token0' }),
      pub.readContract({ address: pair, abi, functionName: 'token1' }),
      pub.readContract({ address: d.usdc, abi, functionName: 'balanceOf', args: [pair] }),
      pub.readContract({ address: d.weth, abi, functionName: 'balanceOf', args: [pair] }),
    ]);
    if (![t0, t1].every(a => [d.usdc.toLowerCase(), d.weth.toLowerCase()].includes(a.toLowerCase()))) throw Error('Unexpected pool tokens');
    const plan = planRepeg(u, t, BigInt(Math.round(feed.price * 1e8)), 18);
    if (plan.gapBps > 1000) throw Error('Pool differs by over 10%; operator review needed');
    if (plan.usdc > 100_000n) throw Error('Re-peg needs over 0.10 executor USDC; operator review needed');
    const transact = async (to: typeof pair, functionName: 'faucet' | 'transfer' | 'sync', args?: readonly [typeof pair, bigint]) => {
      const r = await send(to, encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]), `testnet re-peg ${functionName}`);
      hashes.push(r.hash);
    };
    if (plan.token > 0n) {
      const held = await pub.readContract({ address: d.weth, abi, functionName: 'balanceOf', args: [executor.address] });
      if (held < plan.token) {
        const faucet = await pub.readContract({ address: d.weth, abi, functionName: 'faucetAmount' });
        if (held + faucet < plan.token) throw Error('Re-peg exceeds one faucet claim');
        await transact(d.weth, 'faucet');
      }
      await transact(d.weth, 'transfer', [pair, plan.token]);
    } else if (plan.usdc > 0n) {
      const balance = await pub.getBalance({ address: executor.address });
      if (balance < plan.usdc * 10n ** 12n + 50_000_000_000_000_000n) throw Error('Executor needs a 0.05 USDC gas reserve');
      // Persist before sending: failed attempts consume quota too, and restarts cannot reset it.
      store.reserveRepegUsdc(plan.usdc);
      await transact(d.usdc, 'transfer', [pair, plan.usdc]);
    }
    // Also repairs a donation whose previous sync was interrupted.
    await transact(pair, 'sync');
    return { status: plan.token || plan.usdc ? 'repegged' : 'aligned', hashes, gapBps: plan.gapBps, addedUsdc: plan.usdc.toString(), note: 'Testnet only: seeded xWETH pool aligned to the unchanged mainnet mirror; normal price floor still enforced.' };
  } catch (e) {
    return { status: 'unavailable', hashes, note: `Testnet pool maintenance: ${explain(e)}` };
  }
}
