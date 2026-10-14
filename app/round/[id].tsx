/**
 * One round, audited: what each seat read, how it voted, the decision and votes on XorrCouncil, the fill through
 * XorrDelegation, the Arc Memo that ties them, and — after the horizon — Chainlink's verdict, written to ERC-8004.
 */
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { formatUnits } from 'viem';
import { Text, colors, space } from '@/ui';
import { api } from '@/arc/api';
import { age, px, usd, when } from '@/arc/format';
import { useConfig, usePoll } from '@/arc/hooks';
import { AddressLink, Card, KV, Note, Page, TxLink } from '@/arc/ui';
import { ASSETS } from '../../shared/arc';
import { SpeedReceipt } from '@/arc/rounds';
import { BallotRow } from '../council';

export default function RoundAudit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const config = useConfig((s) => s.config);
  const q = usePoll(id ? () => api.round(id) : null, 10_000, [id]);
  const r = q.data?.round;
  if (!r) return <Page title="Round">{<Text variant="secondary">{q.error ?? 'Reading…'}</Text>}</Page>;
  const p = r.inputs.proposal;
  const price = r.inputs.price;
  const t = r.trade;
  const onchain = q.data?.onchain as { status: number; edgeBps: number; filledAt: number; priceAtVote: string } | null;
  const outSym = p.side === 'buy' ? p.sym : 'USDC';
  const status = ['none', 'recorded', 'filled', 'settled'][onchain?.status ?? 0];
  return (
    <Page title={`${p.side === 'buy' ? 'Buy' : 'Sell'} ${p.label} ${usd(p.usd)}`} eyebrow={`Round ${r.id.slice(0, 10)} · ${when(r.createdAt)}`}>
      <Note tone={r.decision === 'approved' ? 'up' : r.decision === 'vetoed' ? 'down' : undefined}>{r.summary}</Note>
      <SpeedReceipt round={r} />
      {r.maintenance ? <Card title="Testnet pool maintenance">
        <Note tone={r.maintenance.status === 'unavailable' ? 'warn' : undefined}>{r.maintenance.note}</Note>
        {r.maintenance.hashes.map(hash => <TxLink key={hash} hash={hash} label="Re-peg transaction" />)}
      </Card> : null}
      <Card title="What the council read">
        {price.ok ? (
          <>
            <KV figure="market" k={`Chainlink${price.mirror ? ' (mirror of mainnet)' : ''}`} v={`${px(price.chainlink!)} · ${age(price.ageSec!)} old`} />
            <KV figure="market" k={`Fill on ${price.venue}`} v={px(price.fill!)} />
            <KV k="Apart" v={`${price.gapBps!.toFixed(1)} bps`} />
          </>
        ) : (
          <Text variant="secondary">Price unreadable: {price.error}</Text>
        )}
      </Card>
      <Card title="The votes">
        {r.ballots.map((b) => (
          <BallotRow key={b.seat} b={b} />
        ))}
      </Card>
      <Card title="On Arc">
        <KV k="Decision id (= Memo id)" v={<Text variant="secondary">{r.id.slice(0, 18)}…</Text>} />
        <KV k="XorrCouncil status" v={status ?? '—'} />
        {r.record && 'hash' in r.record ? <KV k="Votes recorded" v={<TxLink hash={r.record.hash} />} /> : null}
        {t && 'hash' in t ? (
          <>
            <KV k="Trade" v={<TxLink hash={t.hash} />} />
            <KV k="Sent through Arc Memo" v={t.memo.tagged ? 'yes' : 'no (node without CallFrom)'} />
            {t.memo.tagged ? <Text variant="secondarySm">“{t.memo.line}”</Text> : null}
            <KV k="Paid" v={p.side === 'buy' ? `${formatUnits(BigInt(t.amountIn), 6)} USDC` : `${formatUnits(BigInt(t.amountIn), ASSETS[p.sym].decimals)} ${p.label}`} />
            {t.received ? <KV k="Received" v={`${formatUnits(BigInt(t.received), ASSETS[outSym].decimals)} ${outSym === 'USDC' ? 'USDC' : p.label}`} /> : null}
            <KV k="Chainlink floor (on chain)" v={`${formatUnits(BigInt(t.floor), ASSETS[outSym].decimals)} ${outSym === 'USDC' ? 'USDC' : p.label}`} />
            <KV k="Send to receipt" v={`${t.ms} ms · gas ${t.gasUsed} (paid in USDC)`} />
          </>
        ) : t ? (
          <Note tone="down">The contract refused the trade: {t.error}</Note>
        ) : (
          <Text variant="secondary">No trade: the council did not approve.</Text>
        )}
        {(q.data?.memo ?? []).map((m) => (
          <KV key={m.tx} k={`Memo event #${m.memoIndex}`} v={<TxLink hash={m.tx} />} />
        ))}
      </Card>
      <Card title="Outcome, measured by Chainlink" eyebrow="ERC-8004 reputation">
        {r.settlement && 'edgeBps' in r.settlement ? (
          <>
            <KV k="Edge" v={`${r.settlement.edgeBps >= 0 ? '+' : ''}${r.settlement.edgeBps} bps`} tone={r.settlement.edgeBps >= 0 ? colors.up : colors.down} />
            <Text variant="secondarySm">Each seat that voted yes got +edge on the ERC-8004 Reputation Registry, each no/veto got −edge (tag tradeEdge / xorr-council).</Text>
            {r.settlement.hash.length > 4 ? <TxLink hash={r.settlement.hash} label="Settled" /> : null}
          </>
        ) : (
          <Text variant="secondary">Settles an hour after the {t && 'hash' in t ? 'fill' : 'vote'}: anyone can call XorrCouncil.settle; automatic settlement requires the keeper to be running.</Text>
        )}
        {config?.deployment ? <KV k="Reputation registry" v={<AddressLink address={config.deployment.reputationRegistry} />} /> : null}
      </Card>
      <View style={{ height: space.s20 }} />
    </Page>
  );
}
