/** Testnet-only copies of mainnet answers; timestamps and prices are never synthesized. */
import { createPublicClient, encodeFunctionData, http, type Address } from 'viem';
import { aggregatorAbi, mirrorFeedAbi } from './abis.js';
import { ARC, ASSETS, type Sym, type XorrDeployment } from '../../shared/arc.js';
import { executor, explain, pub, send } from './chain.js';
import { NETWORK } from './env.js';
const mainnet = createPublicClient({ transport: http(process.env.ARC_MAINNET_RPC_URL ?? ARC['arc-mainnet'].rpcUrl) });
/** Testnet: copy each mainnet Chainlink round into its mirror feed when mainnet has a newer one. */
export async function postMirrors(d: XorrDeployment): Promise<number> {
  if (NETWORK !== 'arc-testnet' || d.chainId !== 5042002 || !d.mirrorFeeds || !executor) return 0;
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
      throw new Error(`Mirror ${sym}: ${explain(e)}`);
    }
  }

  return n;
}

