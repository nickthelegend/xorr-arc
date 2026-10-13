/**
 * The council. Propose a trade (or let autopilot propose them), and watch five agents vote on Arc's numbers. An
 * approved round is carried out inside your permission, sent through Arc's Memo with the round's decision id.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AgentOrb, Button, Eyebrow, Press, Text, colors, radius, space } from '@/ui';
import { api, postSigned, type Ballot, type Round } from '@/arc/api';
import { usd, when } from '@/arc/format';
import { useConfig, usePoll } from '@/arc/hooks';
import { Card, Choice, Note, Page, TxLink } from '@/arc/ui';
import { signMessage, useWallet } from '@/arc/wallet';
import { SEATS, labelOf, type Sym } from '../shared/arc';
import { agentGradient } from '@/design/gradients';

const VOTE_TONE: Record<string, string> = { yes: colors.up, no: colors.ink55, veto: colors.down, abstain: colors.ink38 };

export function BallotRow({ b }: { b: Ballot }) {
  const seat = SEATS.find((s) => s.id === b.seat)!;
  return (
    <View style={{ flexDirection: 'row', gap: space.s12, alignItems: 'flex-start' }}>
      <AgentOrb gradient={agentGradient(seat.name)} size={52} face identity={seat.name} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="rowPrimary">{seat.name}</Text>
          <Text variant="control" color={VOTE_TONE[b.vote]}>
            {b.vote.toUpperCase()}
            {b.vote !== 'abstain' ? ` · ${Math.round(b.confidence * 100)}%` : ''}
          </Text>
        </View>
        <Text variant="secondary">{b.reason}</Text>
      </View>
    </View>
  );
}

/** Each seat's vote as a chip; the reasons are one tap away, and in full on the round's audit (the readability rule). */
function VoteChips({ ballots }: { ballots: Ballot[] }) {
  const [why, setWhy] = useState(false);
  return (
    <View style={{ gap: space.s8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s8 }}>
        {ballots.map((b) => {
          const seat = SEATS.find((s) => s.id === b.seat)!;
          return (
            <View key={b.seat} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s6 }}>
              <Text variant="footnote" color={colors.ink70}>
                {seat.name}
              </Text>
              <Text variant="footnote" color={VOTE_TONE[b.vote]}>
                {b.vote.toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>
      <Press onPress={() => setWhy(!why)} accessibilityRole="button" accessibilityState={{ expanded: why }} hitHeight={44} testID="council-why" style={{ alignSelf: 'flex-start' }}>
        <Text variant="footnote" color={colors.ink55}>
          {why ? 'Hide why' : 'Why'}
        </Text>
      </Press>
      {why ? ballots.map((b) => <BallotRow key={b.seat} b={b} />) : null}
    </View>
  );
}

export function RoundResult({ r }: { r: Round }) {
  const t = r.trade;
  return (
    <Card tone={r.decision === 'approved' ? 'accent' : undefined} eyebrow={`${r.inputs.proposal.side} ${r.inputs.proposal.label} ${usd(r.inputs.proposal.usd)}`} title={r.summary} testID="round-result">
      <VoteChips ballots={r.ballots} />
      <View style={{ gap: 4, marginTop: space.s6 }}>
        {r.record && 'hash' in r.record ? <TxLink hash={r.record.hash} label="Votes recorded on XorrCouncil" /> : r.record ? <Note tone="down">Not recorded: {r.record.error}</Note> : null}
        {t && 'hash' in t ? (
          <>
            <TxLink hash={t.hash} label={`Filled on ${t.venue} in ${t.ms} ms`} />
            <Text variant="secondarySm">{t.memo.tagged ? `Arc Memo: “${t.memo.line}”, memo id = decision id` : 'Memo not executed by this node: sent as a plain call'}</Text>
          </>
        ) : t ? (
          <Note tone="down">Refused on chain: {t.error}</Note>
        ) : null}
      </View>
      <Button label="Open the audit" variant="ghost" onPress={() => router.push(`/round/${r.id}`)} />
    </Card>
  );
}

export default function Council() {
  const config = useConfig((s) => s.config);
  const address = useWallet((s) => s.address);
  const rounds = usePoll(address ? () => api.rounds(address) : null, 8000, [address]);
  const account = usePoll(address ? () => api.account(address) : null, 0, [address]);
  const [sym, setSym] = useState<Sym>('CBTC');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Round | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const testnet = config?.network === 'arc-testnet';
  // XORR's testnet pools hold ~5 USDC each: rounds are cents there, and cirBTC/EURC have no usable pool.
  const amounts = testnet ? [0.02, 0.04, 0.05] : [5, 10, 20];
  const autoUsd = testnet ? 0.04 : 5;
  useEffect(() => {
    if (testnet) {
      setSym('WETH');
      setAmount(0.04);
    }
  }, [testnet]);
  if (!address || !config) return <Page title="Council">{<Note>Connect a wallet on the home screen first.</Note>}</Page>;
  const net = config.network;

  async function convene() {
    setBusy(true);
    setErr(null);
    try {
      const out = await postSigned<{ round: Round }>('/rounds', 'round', address!, { sym, side, usd: amount }, signMessage);
      setLast(out.round);
      await rounds.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function autopilot(on: boolean) {
    try {
      await postSigned('/autopilot', 'autopilot', address!, { on, usd: autoUsd }, signMessage);
      await account.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Page title="The council" eyebrow="Five ERC-8004 agents on Arc">
      <Card title="Propose a trade">
        <Choice options={(['CBTC', 'WETH', 'EURC'] as Sym[]).map((s) => ({ label: labelOf(s, net), value: s }))} value={sym} onChange={setSym} testID="sym" />
        <Choice options={[{ label: 'Buy', value: 'buy' as const }, { label: 'Sell', value: 'sell' as const }]} value={side} onChange={setSide} testID="side" />
        <Choice options={amounts.filter((n) => n <= config.maxRoundUsd).map((n) => ({ label: usd(n, n < 1 ? 2 : 0), value: n }))} value={amount} onChange={setAmount} testID="usd" />
        <Text variant="secondarySm">You sign the request (no gas); the executor runs the round. It can never exceed the permission on chain. The five votes are deterministic rules over what was read this round, not an LLM.</Text>
        {testnet ? <Note tone="warn">Testnet: XORR’s own ~5 USDC pools, so rounds are cents. Only the xWETH pool is deep enough to fill; cirBTC is dust and the EURC pool is not seeded.</Note> : null}
        <Button label={busy ? 'The council is voting…' : 'Convene the council'} loading={busy} onPress={convene} testID="convene" />
      </Card>
      {err ? <Note tone="down">{err}</Note> : null}
      {last ? <RoundResult r={last} /> : null}

      <Card title="Autopilot" eyebrow="The keeper proposes, the council decides">
        <Text variant="secondary">
          Every ten minutes the keeper proposes a {usd(autoUsd, autoUsd < 1 ? 2 : 0)} buy, rotating cirBTC, WETH and EURC. Each round still needs the council and still fits inside the permission.
        </Text>
        <Choice options={[{ label: 'On', value: 1 }, { label: 'Off', value: 0 }]} value={account.data?.autopilot.on ? 1 : 0} onChange={(v) => autopilot(v === 1)} testID="autopilot" />
      </Card>

      <Eyebrow>Rounds</Eyebrow>
      {rounds.data && rounds.data.rounds.length === 0 ? (
        <Note>No rounds yet. Convene the council above, or switch autopilot on: each round lands here with its votes and its audit.</Note>
      ) : null}
      {(rounds.data?.rounds ?? []).map((r) => (
        <Press key={r.id} onPress={() => router.push(`/round/${r.id}`)}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.s12, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="rowPrimary">
                {r.inputs.proposal.side === 'buy' ? 'Buy' : 'Sell'} {r.inputs.proposal.label} {usd(r.inputs.proposal.usd)}
                {r.trigger === 'autopilot' ? ' · autopilot' : ''}
              </Text>
              <Text variant="control" color={r.decision === 'approved' ? colors.up : r.decision === 'vetoed' ? colors.down : colors.ink55}>
                {r.decision}
              </Text>
            </View>
            <Text variant="secondarySm" numberOfLines={2}>
              {when(r.createdAt)} · {r.summary}
              {r.settlement && 'edgeBps' in r.settlement ? ` · settled ${r.settlement.edgeBps >= 0 ? '+' : ''}${r.settlement.edgeBps} bps` : ''}
            </Text>
          </View>
        </Press>
      ))}
    </Page>
  );
}
