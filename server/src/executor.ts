/**
 * A council round, end to end, on Arc:
 *
 *   1. read everything the seats need — the owner's permission from XorrDelegation, Chainlink through XorrPriceGuard's
 *      feeds, the venue's quote, the pegs and cirBTC's Proof of Reserve;
 *   2. convene the five seats;
 *   3. record the decision and every vote on XorrCouncil (approved or not — rejected rounds are scored too);
 *   4. if approved, carry it out through XorrDelegation, sent through Arc's Memo with the decision id as the memo id,
 *      so the trade, the round that decided it and its reputation are tied together on chain.
 *
 * The executor key is an agent the owner granted on chain. Nothing here can exceed the grant: the contract checks the
 * cap, expiry, venue and revocation, and refuses any fill below Chainlink's value less the owner's slippage limit.
 */
import { encodeFunctionData, formatUnits, getAddress, keccak256, parseUnits, toHex, type Address, type Hex } from 'viem';
import { councilAbi, delegationAbi, erc20Abi, swapRouter02Abi, v2RouterAbi } from './abis.js';
import { ASSETS, labelOf, tokenOf, VOTE_CODE, type Sym, type XorrDeployment } from '../../shared/arc.js';
import { executor, explain, memoLine, memoLive, pub, send, wrapInMemo } from './chain.js';
import { convene, type RoundInputs } from './council.js';
import { MAX_GAP_BPS, NETWORK, CFG } from './env.js';
import { cirBtcReserve, fairOut, quote, readFeed, readRounds } from './market.js';
import { postMirrors } from './mirrors.js';
import { repegTestnet } from './repeg.js';
import { riskKeeper } from './council.js';
import { store, type RoundRecord } from './store.js';

export type Proposal = { sym: Sym; side: 'buy' | 'sell'; usd: number };

async function readPermission(d: XorrDeployment, owner: Address): Promise<RoundInputs['permission']> {
  try {
    if (!executor) return { ok: false, error: 'the executor has no key' };
    const [p, remaining, venueAllowed] = await Promise.all([
      pub.readContract({ address: d.delegation, abi: delegationAbi, functionName: 'agentPolicyOf', args: [owner, executor.address] }),
      pub.readContract({ address: d.delegation, abi: delegationAbi, functionName: 'remainingTodayFor', args: [owner, executor.address] }),
      pub.readContract({ address: d.delegation, abi: delegationAbi, functionName: 'venuesOf', args: [owner] }),
    ]);
    return {
      ok: true,
      dailyCapUsd: Number(formatUnits(p[0], 6)),
      expiresAt: Number(p[1]),
      slippageBps: p[2],
      revoked: p[3],
      stopped: p[4],
      remainingUsd: Number(formatUnits(remaining, 6)),
      venueAllowed: venueAllowed.some((v: Address) => v.toLowerCase() === d.venue.toLowerCase()),
    };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

export async function gatherInputs(d: XorrDeployment, owner: Address, p: Proposal) {
  const label = labelOf(p.sym, NETWORK);
  const now = Math.floor(Date.now() / 1000);
  const permission = await readPermission(d, owner);
  const slippageBps = permission.ok && permission.slippageBps > 0 ? permission.slippageBps : 100;

  let assetPrice = 0;
  let amountIn = 0n;
  let price: RoundInputs['price'];
  let q: Awaited<ReturnType<typeof quote>> | null = null;
  try {
    const feed = await readFeed(d, p.sym);
    assetPrice = feed.price;
    if (p.side === 'buy') amountIn = parseUnits(p.usd.toFixed(6), 6);
    else {
      const held = await pub.readContract({ address: tokenOf(d, p.sym), abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
      const want = parseUnits((p.usd / feed.price).toFixed(ASSETS[p.sym].decimals), ASSETS[p.sym].decimals);
      amountIn = want > held ? held : want;
    }
    if (amountIn === 0n) throw new Error(`nothing to ${p.side}`);
    q = await quote(d, p.side === 'buy' ? 'USDC' : p.sym, p.side === 'buy' ? p.sym : 'USDC', amountIn);
    const gapBps = (Math.abs(q.price - feed.price) / feed.price) * 10_000;
    price = {
      ok: true,
      chainlink: feed.price,
      ageSec: feed.ageSec,
      maxAgeSec: feed.maxAgeSec,
      mirror: feed.mirror,
      fill: q.price,
      venue: q.venue,
      gapBps,
      maxGapBps: Math.min(MAX_GAP_BPS, slippageBps),
    };
  } catch (e) {
    price = { ok: false, error: explain(e) };
  }

  let holding: RoundInputs['holding'];
  try {
    const held = await pub.readContract({ address: tokenOf(d, p.sym), abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
    holding = { ok: true, assetUsd: Number(formatUnits(held, ASSETS[p.sym].decimals)) * assetPrice };
  } catch (e) {
    holding = { ok: false, error: explain(e) };
  }

  let trend: RoundInputs['trend'];
  try {
    trend = { ok: true, rounds: await readRounds(d, p.sym) };
  } catch (e) {
    trend = { ok: false, error: explain(e) };
  }

  let peg: RoundInputs['peg'];
  try {
    const [usdc, eurc] = await Promise.all([readFeed(d, 'USDC'), readFeed(d, 'EURC')]);
    let eur: number | null = null;
    if (NETWORK === 'arc-mainnet') {
      const { aggregatorAbi } = await import('./abis.js');
      const r = await pub.readContract({ address: CFG.chainlink.EUR, abi: aggregatorAbi, functionName: 'latestRoundData' });
      eur = Number(formatUnits(r[1], 8));
    }
    peg = { ok: true, usdc: usdc.price, eurc: eurc.price, eur, por: p.sym === 'CBTC' ? await cirBtcReserve() : { ratio: 1 } };
  } catch (e) {
    peg = { ok: false, error: explain(e) };
  }

  const inputs: RoundInputs = { proposal: { ...p, label }, price, permission, holding, trend, peg, now };
  return { inputs, amountIn, quote: q, slippageBps };
}

function venueCall(d: XorrDeployment, from: Sym, to: Sym, amountIn: bigint, minOut: bigint, owner: Address): Hex {
  const tin = tokenOf(d, from);
  const tout = tokenOf(d, to);
  if (d.venueKind === 'uniswap-v3') {
    const asset = (from === 'USDC' ? to : from) as 'WETH' | 'CBTC' | 'EURC';
    return encodeFunctionData({
      abi: swapRouter02Abi,
      functionName: 'exactInputSingle',
      args: [{ tokenIn: tin, tokenOut: tout, fee: CFG.v3Fees[asset], recipient: owner, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }],
    });
  }
  return encodeFunctionData({
    abi: v2RouterAbi,
    functionName: 'swapExactTokensForTokens',
    args: [amountIn, minOut, [tin, tout], owner, BigInt(Math.floor(Date.now() / 1000) + 600)],
  });
}

let counter = 0;

async function runRoundSerial(d: XorrDeployment, owner: Address, p: Proposal, trigger: RoundRecord['trigger']): Promise<RoundRecord> {
  owner = getAddress(owner);
  let maintenance: RoundRecord['maintenance'];
  if (NETWORK === 'arc-testnet' && d.chainId === 5042002 && d.mirrorFeeds && d.venueKind === 'uniswap-v2' && p.sym === 'WETH') {
    // Do not spend maintenance funds for absent, expired, stopped or over-cap permissions.
    const preliminary = await gatherInputs(d, owner, p);
    if (riskKeeper(preliminary.inputs).vote === 'yes') {
      try {
        await postMirrors(d);
        maintenance = await repegTestnet(d);
      } catch (e) {
        maintenance = { status: 'unavailable', hashes: [], note: explain(e) };
      }
    }
  }
  const { inputs, amountIn, quote: q, slippageBps } = await gatherInputs(d, owner, p);
  if (maintenance?.status === 'unavailable') inputs.price = { ok: false, error: maintenance.note };
  const { ballots, decision, summary } = convene(inputs);
  const id = keccak256(toHex(`xorr:${NETWORK}:${owner}:${Date.now()}:${counter++}:${Math.random()}`));
  const record: RoundRecord = { id, owner, createdAt: Date.now(), trigger, inputs, ballots, decision, summary, maintenance };
  store.add(record);

  // The decision and every vote, on chain — approved or not.
  const asset = tokenOf(d, p.sym);
  try {
    const votes = ballots.map((b) => VOTE_CODE[b.vote]);
    const r = await send(
      d.council,
      encodeFunctionData({ abi: councilAbi, functionName: 'recordDecision', args: [id, owner, asset, p.side === 'buy', decision === 'approved', votes] }),
      'recordDecision',
    );
    store.update(id, { record: { hash: r.hash, ms: r.ms } });
  } catch (e) {
    store.update(id, { record: { error: explain(e) } });
  }

  if (decision !== 'approved' || !q) return store.get(id)!;

  // Carry it out inside the permission. minOut follows the live quote less the owner's slippage limit; the contract
  // ALSO enforces Chainlink's value less that limit, whatever minOut says.
  const from: Sym = p.side === 'buy' ? 'USDC' : p.sym;
  const to: Sym = p.side === 'buy' ? p.sym : 'USDC';
  const minOut = (q.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const fair = await fairOut(d, from, to, amountIn).catch(() => 0n);
  const floor = (fair * BigInt(10_000 - slippageBps)) / 10_000n;
  const data = venueCall(d, from, to, amountIn, minOut > 0n ? minOut : 1n, owner);
  const call =
    p.side === 'buy'
      ? encodeFunctionData({ abi: delegationAbi, functionName: 'spend', args: [owner, d.venue, amountIn, asset, minOut > 0n ? minOut : 1n, id, data] })
      : encodeFunctionData({ abi: delegationAbi, functionName: 'closePosition', args: [owner, asset, d.venue, amountIn, minOut > 0n ? minOut : 1n, id, data] });
  const line = memoLine([
    'xorr',
    p.side,
    labelOf(p.sym, NETWORK),
    p.side === 'buy' ? `${formatUnits(amountIn, 6)} USDC` : `${formatUnits(amountIn, ASSETS[p.sym].decimals)} ${labelOf(p.sym, NETWORK)}`,
    `decision ${id.slice(0, 10)}`,
  ]);
  const tagged = await memoLive();
  const tx = tagged ? wrapInMemo(d.delegation, call, id, line) : { to: d.delegation, data: call };
  const toToken = tokenOf(d, to);
  const before = await pub.readContract({ address: toToken, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
  try {
    const r = await send(tx.to, tx.data, p.side === 'buy' ? 'spend' : 'closePosition');
    const after = await pub.readContract({ address: toToken, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
    store.update(id, {
      trade: {
        hash: r.hash,
        ms: r.ms,
        gasUsed: r.gasUsed.toString(),
        memo: { tagged, line },
        amountIn: amountIn.toString(),
        received: (after - before).toString(),
        floor: floor.toString(),
        venue: q.venue,
      },
    });
  } catch (e) {
    store.update(id, { trade: { error: explain(e) } });
  }
  return store.get(id)!;
}

/** Settle every recorded round past the council's horizon: Chainlink scores it, ERC-8004 records it. */
export async function settleDue(d: XorrDeployment): Promise<number> {
  const horizon = Number(await pub.readContract({ address: d.council, abi: councilAbi, functionName: 'HORIZON' }));
  let n = 0;
  const block = await pub.getBlock();
  for (const r of store.all()) {
    if ((r.settlement && !('error' in r.settlement)) || !r.record || 'error' in r.record) continue;
    const filled = r.trade && !('error' in r.trade);
    const onchain = await pub.readContract({ address: d.council, abi: councilAbi, functionName: 'decisionOf', args: [r.id] });
    if (onchain.status === 3) {
      store.update(r.id, { settlement: { hash: '0x' as Hex, edgeBps: onchain.edgeBps } });
      continue;
    }
    // Chain time, not wall time: on a fork the clock can be moved, and the contract only listens to the chain.
    const ready = Number(filled ? onchain.filledAt : onchain.recordedAt) + horizon;
    if (Number(block.timestamp) < ready) continue;
    try {
      const s = await send(d.council, encodeFunctionData({ abi: councilAbi, functionName: 'settle', args: [r.id] }), 'settle');
      const after = await pub.readContract({ address: d.council, abi: councilAbi, functionName: 'decisionOf', args: [r.id] });
      store.update(r.id, { settlement: { hash: s.hash, edgeBps: after.edgeBps } });
      n++;
    } catch (e) {
      store.update(r.id, { settlement: { error: explain(e) } });
    }
  }
  return n;
}

// Serialize maintenance, quote, vote and fill together across owner and keeper requests.
let roundQueue: Promise<unknown> = Promise.resolve();
export function runRound(d: XorrDeployment, owner: Address, p: Proposal, trigger: RoundRecord['trigger']) {
  const next = roundQueue.then(() => runRoundSerial(d, owner, p, trigger));
  roundQueue = next.catch(() => undefined);
  return next;
}
