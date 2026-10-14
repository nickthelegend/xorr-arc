/**
 * What the council reads: Chainlink on Arc (through XorrPriceGuard, and the feeds directly for their rounds), the
 * venue's quote, the pegs, and cirBTC's Proof of Reserve. Every number carries where and when it was read.
 */
import { formatUnits, getAddress, type Address } from 'viem';
import { aggregatorAbi, erc20Abi, guardAbi, quoterV2Abi, v2RouterAbi } from './abis.js';
import { ARC, ASSETS, labelOf, tokenOf, type Sym, type XorrDeployment } from '../../shared/arc.js';
import { pub } from './chain.js';
import { CFG, NETWORK } from './env.js';
import { createPublicClient, http } from 'viem';

export type FeedRead = {
  sym: Sym;
  feed: Address;
  price: number;
  updatedAt: number;
  ageSec: number;
  maxAgeSec: number;
  fresh: boolean;
  mirror: boolean;
  description: string;
};

/** Chainlink's price of an asset, through the same feed XorrPriceGuard uses (mirror feeds on testnet). */
export async function readFeed(d: XorrDeployment, sym: Sym): Promise<FeedRead> {
  const feed = getAddress(d.feeds[ASSETS[sym].feedIndex]!);
  const [round, decimals, description, cfg] = await Promise.all([
    pub.readContract({ address: feed, abi: aggregatorAbi, functionName: 'latestRoundData' }),
    pub.readContract({ address: feed, abi: aggregatorAbi, functionName: 'decimals' }),
    pub.readContract({ address: feed, abi: aggregatorAbi, functionName: 'description' }).catch(() => `${sym} / USD`),
    pub.readContract({ address: d.priceGuard, abi: guardAbi, functionName: 'feedOf', args: [tokenOf(d, sym)] }),
  ]);
  const block = await pub.getBlock();
  const updatedAt = Number(round[3]);
  const ageSec = Number(block.timestamp) - updatedAt;
  const maxAgeSec = Number(cfg[1]);
  return {
    sym,
    feed,
    price: Number(formatUnits(round[1], decimals)),
    updatedAt,
    ageSec,
    maxAgeSec,
    fresh: round[1] > 0n && ageSec <= maxAgeSec,
    mirror: d.mirrorFeeds,
    description,
  };
}

/** The last few Chainlink rounds of an asset's feed, oldest first (for the Trend Reader). */
export async function readRounds(d: XorrDeployment, sym: Sym, n = 5): Promise<{ price: number; at: number }[]> {
  const feed = getAddress(d.feeds[ASSETS[sym].feedIndex]!);
  const [latest, decimals] = await Promise.all([
    pub.readContract({ address: feed, abi: aggregatorAbi, functionName: 'latestRoundData' }),
    pub.readContract({ address: feed, abi: aggregatorAbi, functionName: 'decimals' }),
  ]);
  const out: { price: number; at: number }[] = [{ price: Number(formatUnits(latest[1], decimals)), at: Number(latest[3]) }];
  for (let i = 1n; i < BigInt(n); i++) {
    if (latest[0] <= i) break;
    try {
      const r = await pub.readContract({ address: feed, abi: aggregatorAbi, functionName: 'getRoundData', args: [latest[0] - i] });
      if (r[1] > 0n) out.unshift({ price: Number(formatUnits(r[1], decimals)), at: Number(r[3]) });
    } catch {
      break; // a mirror feed keeps no history; a phase boundary ends it too
    }
  }
  return out;
}

export type Quote = { venue: string; amountIn: bigint; amountOut: bigint; price: number; fee?: number };

/** What the venue would give for `amountIn` of `from` in `to`, right now. */
export async function quote(d: XorrDeployment, from: Sym, to: Sym, amountIn: bigint): Promise<Quote> {
  const tin = tokenOf(d, from);
  const tout = tokenOf(d, to);
  let amountOut: bigint;
  let fee: number | undefined;
  if (d.venueKind === 'uniswap-v3') {
    const asset = from === 'USDC' ? to : from;
    fee = CFG.v3Fees[asset as 'WETH' | 'CBTC' | 'EURC'];
    const r = await pub.simulateContract({
      address: d.quoter,
      abi: quoterV2Abi,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn: tin, tokenOut: tout, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    amountOut = r.result[0];
  } else {
    const r = await pub.readContract({ address: d.venue, abi: v2RouterAbi, functionName: 'getAmountsOut', args: [amountIn, [tin, tout]] });
    amountOut = r[1]!;
  }
  const usd = from === 'USDC' ? Number(formatUnits(amountIn, 6)) : Number(formatUnits(amountOut, 6));
  const units = from === 'USDC' ? Number(formatUnits(amountOut, ASSETS[to].decimals)) : Number(formatUnits(amountIn, ASSETS[from].decimals));
  return {
    venue: d.venueKind === 'uniswap-v3' ? `Uniswap v3 (${(fee! / 10_000).toFixed(2)}% pool)` : 'Uniswap v2 (XORR testnet pool)',
    amountIn,
    amountOut,
    price: units > 0 ? usd / units : 0,
    fee,
  };
}

/** Chainlink's fair output for a trade (XorrPriceGuard.quote: the floor's basis on chain). */
export async function fairOut(d: XorrDeployment, from: Sym, to: Sym, amountIn: bigint): Promise<bigint> {
  return pub.readContract({ address: d.priceGuard, abi: guardAbi, functionName: 'quote', args: [tokenOf(d, from), tokenOf(d, to), amountIn] });
}

const forkRpc = process.env.ARC_MAINNET_RPC_URL;
const mainnetClient = forkRpc && /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(forkRpc) ? createPublicClient({ transport: http(forkRpc) }) : null;

/**
 * cirBTC's Chainlink Proof of Reserve on Arc mainnet against cirBTC's supply. Read on MAINNET even from the testnet
 * build (there is no testnet PoR), and labelled with where it was read.
 */
export async function cirBtcReserve(): Promise<{ reserve: number; supply: number; ratio: number; ageSec: number } | { error: string }> {
  try {
    if (!mainnetClient) return { error: 'Proof of Reserve requires a local Arc mainnet fork; unavailable on hosted testnet.' };
    const m = ARC['arc-mainnet'];
    const cbtc = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0' as const;
    const [r, dec, supply] = await Promise.all([
      mainnetClient.readContract({ address: m.chainlink.CIRBTC_POR, abi: aggregatorAbi, functionName: 'latestRoundData' }),
      mainnetClient.readContract({ address: m.chainlink.CIRBTC_POR, abi: aggregatorAbi, functionName: 'decimals' }),
      mainnetClient.readContract({ address: cbtc, abi: erc20Abi, functionName: 'totalSupply' }),
    ]);
    const reserve = Number(formatUnits(r[1], dec));
    const sup = Number(formatUnits(supply, 8));
    return { reserve, supply: sup, ratio: sup > 0 ? reserve / sup : 0, ageSec: Math.floor(Date.now() / 1000) - Number(r[3]) };
  } catch (e) {
    return { error: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
  }
}

export async function balances(d: XorrDeployment, owner: Address) {
  const syms: Sym[] = ['USDC', 'EURC', 'WETH', 'CBTC'];
  const raw = await Promise.all(syms.map((s) => pub.readContract({ address: tokenOf(d, s), abi: erc20Abi, functionName: 'balanceOf', args: [owner] })));
  const usyc = await pub.readContract({ address: d.usyc, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }).catch(() => 0n);
  return {
    tokens: syms.map((s, i) => ({ sym: s, label: labelOf(s, NETWORK), raw: raw[i]!.toString(), amount: Number(formatUnits(raw[i]!, ASSETS[s].decimals)) })),
    usyc: Number(formatUnits(usyc, 6)),
  };
}
