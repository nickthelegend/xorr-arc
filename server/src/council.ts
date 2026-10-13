/**
 * XORR's council on Arc: five seats, each a pure function of what was read this round, and the rule that decides.
 *
 * Every reason names the numbers it rests on, so a person can check each vote against the round's inputs (which are
 * stored with it). A seat that cannot read its input abstains and says which. Three seats can veto: a stale or
 * disagreeing price (Price Desk), a trade the permission would refuse (Risk Keeper), a broken peg or an under-reserved
 * cirBTC (Peg Desk). A round is approved when nobody vetoes and at least two seats vote yes with more yes than no.
 *
 * Seat order is the on-chain order in XorrCouncil, where each seat is an ERC-8004 agent that earns reputation from how
 * its votes turned out against Chainlink.
 */
import { SEATS, type SeatId, type Sym, type Vote } from '../../shared/arc.js';

export type Ballot = { seat: SeatId; vote: Vote; confidence: number; reason: string };
export type Decision = 'approved' | 'rejected' | 'vetoed';

export type RoundInputs = {
  proposal: { sym: Sym; label: string; side: 'buy' | 'sell'; usd: number };
  price:
    | { ok: true; chainlink: number; ageSec: number; maxAgeSec: number; mirror: boolean; fill: number; venue: string; gapBps: number; maxGapBps: number }
    | { ok: false; error: string };
  permission:
    | { ok: true; dailyCapUsd: number; remainingUsd: number; expiresAt: number; revoked: boolean; stopped: boolean; slippageBps: number; venueAllowed: boolean }
    | { ok: false; error: string };
  holding: { ok: true; assetUsd: number } | { ok: false; error: string };
  trend: { ok: true; rounds: { price: number; at: number }[] } | { ok: false; error: string };
  peg:
    | { ok: true; usdc: number; eurc: number; eur: number | null; por: { ratio: number } | { error: string } }
    | { ok: false; error: string };
  now: number;
};

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const px = (n: number) => (n >= 1 ? usd(n) : `$${n.toPrecision(4)}`);
const pct = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
const mins = (s: number) => (s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

/** A position may reach twice the daily cap: the pacing rule that keeps one asset from taking the whole account. */
export const POSITION_CAP_MULTIPLE = 2;
/** A stablecoin more than this far from its reference is treated as off peg. */
export const PEG_TOLERANCE_BPS = 75;
/** Below this a held position is dust: there is nothing worth a sale (Arc gas costs cents at most). */
export const SELL_DUST_USD = 0.02;

export function priceDesk(i: RoundInputs): Ballot {
  const seat = 'price-desk' as const;
  if (!i.price.ok) return { seat, vote: 'veto', confidence: 1, reason: `The price check could not run: ${i.price.error}. Nothing is traded blind.` };
  const p = i.price;
  const feed = `Chainlink ${px(p.chainlink)}${p.mirror ? ' (mirror of Arc mainnet)' : ''}, ${mins(p.ageSec)} old`;
  if (p.ageSec > p.maxAgeSec) return { seat, vote: 'veto', confidence: 1, reason: `Stale: ${feed}, past its ${mins(p.maxAgeSec)} limit.` };
  const parts = `${feed}; fill ${px(p.fill)} on ${p.venue}; ${p.gapBps.toFixed(1)} bps apart (limit ${p.maxGapBps})`;
  if (p.gapBps > p.maxGapBps) return { seat, vote: 'veto', confidence: 1, reason: `The fill is too far from Chainlink: ${parts}.` };
  const room = 1 - p.gapBps / p.maxGapBps;
  return { seat, vote: 'yes', confidence: Math.max(0.5, Math.min(0.95, 0.5 + room / 2)), reason: `Prices agree: ${parts}.` };
}

export function riskKeeper(i: RoundInputs): Ballot {
  const seat = 'risk-keeper' as const;
  if (!i.permission.ok) return { seat, vote: 'veto', confidence: 1, reason: `No readable permission on Arc: ${i.permission.error}.` };
  const p = i.permission;
  const { proposal } = i;
  if (p.dailyCapUsd === 0) return { seat, vote: 'veto', confidence: 1, reason: 'The owner has not granted XORR a permission.' };
  if (p.revoked || p.stopped) return { seat, vote: 'veto', confidence: 1, reason: 'The owner stopped the agents (kill switch).' };
  if (p.expiresAt <= i.now) return { seat, vote: 'veto', confidence: 1, reason: `The permission ended ${new Date(p.expiresAt * 1000).toISOString().slice(0, 16)} UTC.` };
  if (!p.venueAllowed) return { seat, vote: 'veto', confidence: 1, reason: 'The venue is not on the owner\'s allowlist.' };
  if (proposal.side === 'sell') {
    if (!i.holding.ok) return { seat, vote: 'abstain', confidence: 0, reason: `Holdings unreadable: ${i.holding.error}.` };
    if (i.holding.assetUsd < SELL_DUST_USD) return { seat, vote: 'veto', confidence: 1, reason: `Nothing to sell: ${proposal.label} held is worth ${usd(i.holding.assetUsd)}.` };
    return { seat, vote: 'yes', confidence: 0.8, reason: `A sale reduces exposure (${usd(i.holding.assetUsd)} of ${proposal.label} held); closing is outside the daily cap by design.` };
  }
  if (proposal.usd > p.remainingUsd) {
    return { seat, vote: 'veto', confidence: 1, reason: `${usd(proposal.usd)} is more than the ${usd(p.remainingUsd)} left of today's ${usd(p.dailyCapUsd)} cap; the contract would refuse it.` };
  }
  if (!i.holding.ok) return { seat, vote: 'abstain', confidence: 0, reason: `Within today's cap, but holdings are unreadable: ${i.holding.error}.` };
  const after = i.holding.assetUsd + proposal.usd;
  const limit = p.dailyCapUsd * POSITION_CAP_MULTIPLE;
  if (after > limit) {
    return { seat, vote: 'veto', confidence: 1, reason: `${proposal.label} would reach ${usd(after)}, over the ${usd(limit)} position limit (2× the daily cap).` };
  }
  return {
    seat,
    vote: 'yes',
    confidence: Math.max(0.5, 1 - after / limit),
    reason: `Fits: ${usd(proposal.usd)} of ${usd(p.remainingUsd)} left today; ${proposal.label} goes to ${usd(after)} of a ${usd(limit)} limit; slippage limit ${p.slippageBps} bps, enforced on chain against Chainlink.`,
  };
}

export function trendReader(i: RoundInputs): Ballot {
  const seat = 'trend-reader' as const;
  if (!i.trend.ok) return { seat, vote: 'abstain', confidence: 0, reason: `No price history: ${i.trend.error}.` };
  const r = i.trend.rounds;
  if (r.length < 2) return { seat, vote: 'abstain', confidence: 0, reason: `One Chainlink round only (${px(r[0]?.price ?? 0)}): no direction to read yet.` };
  const first = r[0]!;
  const last = r[r.length - 1]!;
  const change = ((last.price - first.price) / first.price) * 100;
  const hours = Math.max(0.1, (last.at - first.at) / 3600);
  const buy = i.proposal.side === 'buy';
  const score = change > 0.3 ? 1 : change < -1 ? -1 : 0;
  const s = buy ? score : -score;
  const vote: Vote = s > 0 ? 'yes' : s < 0 ? 'no' : 'abstain';
  const lead = vote === 'yes' ? (buy ? 'Leaning up' : 'Leaning down') : vote === 'no' ? (buy ? 'Falling' : 'Still rising') : 'No clear direction';
  return { seat, vote, confidence: vote === 'abstain' ? 0.2 : Math.min(0.85, 0.45 + Math.abs(change) / 10), reason: `${lead}: Chainlink ${pct(change)} over ${r.length} rounds (${hours.toFixed(1)} h).` };
}

export function pegDesk(i: RoundInputs): Ballot {
  const seat = 'peg-desk' as const;
  if (!i.peg.ok) return { seat, vote: 'abstain', confidence: 0, reason: `Pegs unreadable: ${i.peg.error}.` };
  const { usdc, eurc, eur, por } = i.peg;
  const usdcBps = Math.abs(usdc - 1) * 10_000;
  const notes = [`USDC ${px(usdc)} (${usdcBps.toFixed(0)} bps off)`];
  if (usdcBps > PEG_TOLERANCE_BPS) return { seat, vote: 'veto', confidence: 1, reason: `USDC is off its peg: ${notes[0]}. Every price XORR reads is in USDC.` };
  if (i.proposal.sym === 'EURC') {
    if (eur === null) notes.push(`EURC ${px(eurc)}`);
    else {
      const gap = Math.abs(eurc / eur - 1) * 10_000;
      notes.push(`EURC ${px(eurc)} vs EUR ${px(eur)} (${gap.toFixed(0)} bps)`);
      if (gap > PEG_TOLERANCE_BPS) return { seat, vote: 'veto', confidence: 1, reason: `EURC is off the euro: ${notes.join('; ')}.` };
    }
  }
  if (i.proposal.sym === 'CBTC') {
    if ('error' in por) notes.push(`cirBTC reserve unreadable (${por.error.slice(0, 60)})`);
    else {
      notes.push(`cirBTC reserve ${(por.ratio * 100).toFixed(2)}% of supply (Chainlink PoR, Arc mainnet)`);
      if (i.proposal.side === 'buy' && por.ratio < 0.999) return { seat, vote: 'veto', confidence: 1, reason: `cirBTC is not fully reserved: ${notes.join('; ')}.` };
    }
  }
  return { seat, vote: 'yes', confidence: 0.7, reason: `On peg: ${notes.join('; ')}.` };
}

/** The fifth seat: decides split rounds by weighing the desks' confidence; it never vetoes and never invents a number. */
export function strategist(desks: Ballot[]): Ballot {
  const seat = 'strategist' as const;
  if (desks.some((b) => b.vote === 'veto')) return { seat, vote: 'abstain', confidence: 0, reason: 'A desk vetoed; there is nothing to weigh.' };
  const weight = (v: Vote) => desks.filter((b) => b.vote === v).reduce((a, b) => a + b.confidence, 0);
  const yes = weight('yes');
  const no = weight('no');
  if (yes === 0 && no === 0) return { seat, vote: 'abstain', confidence: 0, reason: 'No desk took a side.' };
  const vote: Vote = yes > no ? 'yes' : 'no';
  return {
    seat,
    vote,
    confidence: Math.min(0.9, Math.abs(yes - no) / (yes + no) + 0.3),
    reason: `Weighted by confidence the desks lean ${vote} (${yes.toFixed(2)} for, ${no.toFixed(2)} against).`,
  };
}

export function convene(i: RoundInputs): { ballots: Ballot[]; decision: Decision; summary: string } {
  const desks = [priceDesk(i), riskKeeper(i), trendReader(i), pegDesk(i)];
  const ballots = [...desks, strategist(desks)];
  const veto = ballots.find((b) => b.vote === 'veto');
  const yes = ballots.filter((b) => b.vote === 'yes').length;
  const no = ballots.filter((b) => b.vote === 'no').length;
  const decision: Decision = veto ? 'vetoed' : yes >= 2 && yes > no ? 'approved' : 'rejected';
  const name = (id: SeatId) => SEATS.find((s) => s.id === id)!.name;
  const vetoes = ballots.filter((b) => b.vote === 'veto');
  const alsoVetoed = vetoes.length > 1 ? ` (also vetoed by the ${vetoes.slice(1).map((b) => name(b.seat)).join(' and the ')})` : '';
  const summary = veto
    ? `Vetoed by the ${name(veto.seat)}: ${veto.reason}${alsoVetoed}`
    : decision === 'approved'
      ? `Approved ${yes}–${no}.`
      : `Rejected ${yes}–${no}: not enough of the council agreed.`;
  return { ballots, decision, summary };
}
