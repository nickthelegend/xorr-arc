/** The council's five seats as ERC-8004 agents on Arc, with the reputation Chainlink has measured for each. */
import React from 'react';
import { View } from 'react-native';
import { AgentOrb, Text, colors, space } from '@/ui';
import { agentGradient } from '@/design/gradients';
import { api } from '@/arc/api';
import { usePoll } from '@/arc/hooks';
import { AddressLink, Card, KV, Page } from '@/arc/ui';

export default function Agents() {
  const q = usePoll(() => api.agents(), 20_000);
  const d = q.data;
  return (
    <Page title="The agents" eyebrow="ERC-8004 on Arc">
      <Text variant="body" color={colors.ink65}>
        Each seat is an agent on Arc’s ERC-8004 Identity Registry. After every round, XorrCouncil measures the decision against Chainlink and writes each seat’s signed edge to the Reputation Registry: a seat that said yes to a winner, or no to a loser, gains.
      </Text>
      {d ? (
        <Card title="Registries">
          <KV k="Identity" v={<AddressLink address={d.identityRegistry} />} />
          <KV k="Reputation" v={<AddressLink address={d.reputationRegistry} />} />
          <KV k="XorrCouncil (the only client)" v={<AddressLink address={d.council} />} />
        </Card>
      ) : null}
      {(d?.seats ?? []).map((s) => (
        <Card key={s.id} testID={`agent-${s.id}`}>
          <View style={{ flexDirection: 'row', gap: space.s12, alignItems: 'center' }}>
            <AgentOrb gradient={agentGradient(s.name)} size={56} face identity={s.name} />
            <View style={{ flex: 1 }}>
              <Text variant="cardTitle">{s.name}</Text>
              <Text variant="secondary">{s.role}</Text>
            </View>
          </View>
          <KV k="Agent id" v={`#${s.agentId}${s.veto ? ' · can veto' : ''}`} />
          <KV k="Operator" v={<AddressLink address={s.operator} />} />
          <KV
            k="Reputation (tradeEdge)"
            v={s.reputation && s.reputation.count > 0 ? `${s.reputation.count} rounds · ${(s.reputation.value / 10 ** s.reputation.decimals).toFixed(2)}%` : 'no settled rounds yet'}
          />
          <KV k="Average edge" v={`${s.averageEdgeBps} bps over ${s.scored}`} tone={s.averageEdgeBps > 0 ? colors.up : s.averageEdgeBps < 0 ? colors.down : undefined} />
        </Card>
      ))}
    </Page>
  );
}
