/** Built on Arc: each Arc and Chainlink piece XORR uses, what it does here, the contract, and its state read now. */
import React from 'react';
import { View } from 'react-native';
import { Text, colors, space } from '@/ui';
import { api } from '@/arc/api';
import { useConfig, usePoll } from '@/arc/hooks';
import { AddressLink, Card, Note, Page } from '@/arc/ui';

export default function BuiltOnArc() {
  const config = useConfig((s) => s.config);
  const markets = usePoll(() => api.markets(), 0);
  const agents = usePoll(() => api.agents(), 0);
  if (!config) return <Page title="Built on Arc">{null}</Page>;
  const d = config.deployment;
  const a = config.arc;
  const fresh = markets.data?.rows.filter((r) => r.feed?.fresh).length ?? 0;
  const rows: { piece: string; what: string; address?: string | null; state: string; ok: boolean }[] = [
    { piece: 'USDC gas · sub-second finality', what: 'You hold one token; every signature is final in under a second.', address: a.usdc, state: `chain ${config.chainId}, block ${config.block ?? '—'}`, ok: !!config.block },
    { piece: 'XorrDelegation', what: 'The permission: daily cap, venue, end date, Chainlink floor, one-tap revoke.', address: d?.delegation, state: d ? 'deployed' : 'not deployed', ok: !!d },
    { piece: 'Chainlink Data Feeds', what: 'The council’s prices and the on-chain floor under every fill (XorrPriceGuard).', address: d?.priceGuard, state: d?.mirrorFeeds ? `${fresh}/4 fresh (testnet mirrors of mainnet)` : `${fresh}/4 fresh`, ok: fresh >= 4 },
    { piece: d?.venueKind === 'uniswap-v3' ? 'Uniswap v3 on Arc' : 'Uniswap v2 (XORR-deployed, testnet)', what: d?.venueKind === 'uniswap-v3' ? 'The venue: real pools for cirBTC, EURC and WETH.' : 'Testnet has no Uniswap: published v2 bytecode, XORR-seeded pools.', address: d?.venue, state: 'venue registry', ok: !!d },
    { piece: 'ERC-8004', what: 'Five council agents with on-chain identity; every round scored into the Reputation Registry.', address: d?.identityRegistry, state: `${agents.data?.seats.filter((s) => s.operator).length ?? 0}/5 registered`, ok: (agents.data?.seats.filter((s) => s.operator).length ?? 0) === 5 },
    { piece: 'Arc Memo', what: 'Every agent trade carries its council decision id as the memo id.', address: a.memo, state: config.memoLive ? 'CallFrom live on this node' : 'node does not run CallFrom: plain calls', ok: config.memoLive },
    { piece: 'Chainlink CCIP', what: 'A stop sent from Base or Ethereum reaches your permission on Arc (XorrStopReceiver).', address: d?.stopReceiver, state: `router ${a.ccip.router.slice(0, 8)}…`, ok: !!d },
    { piece: 'Circle Gateway', what: 'Fund XORR from a unified USDC balance on any chain.', address: a.gatewayMinter, state: 'mint by the executor', ok: true },
    { piece: 'CCTP V2', what: 'Withdraw: burn on Arc, mint on Base or Ethereum.', address: a.tokenMessengerV2, state: `domain ${a.cctpDomain}`, ok: true },
    { piece: 'USYC', what: 'Idle USDC parked for yield (entitled wallets).', address: a.usyc, state: 'permissioned', ok: true },
    { piece: 'EURC', what: 'The FX desk; Peg Desk checks EURC against EUR/USD.', address: a.eurc, state: 'Uniswap USDC/EURC', ok: true },
  ];
  return (
    <Page title="Built on Arc" eyebrow="Read live">
      {config.fork ? <Note tone="warn">This is a local fork of {a.name}: real contracts and state, transactions that never leave this machine.</Note> : null}
      {rows.map((r) => (
        <Card key={r.piece}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s8 }}>
            <Text variant="cardTitle" style={{ flexShrink: 1 }}>
              {r.piece}
            </Text>
            <Text variant="control" color={r.ok ? colors.up : colors.warn}>
              {r.state}
            </Text>
          </View>
          <Text variant="secondary">{r.what}</Text>
          {r.address ? <AddressLink address={r.address} /> : null}
        </Card>
      ))}
    </Page>
  );
}
