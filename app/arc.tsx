/** Built on Arc: each Arc and Chainlink piece XORR uses, what it does here, the contract, and its state read now. */
import React from 'react';
import { View } from 'react-native';
import { Text, colors, space } from '@/ui';
import { api } from '@/arc/api';
import { useConfig, usePoll } from '@/arc/hooks';
import { AddressLink, Card, Details, Note, Page } from '@/arc/ui';

export default function BuiltOnArc() {
  const config = useConfig((s) => s.config);
  const markets = usePoll(() => api.markets(), 0);
  const agents = usePoll(() => api.agents(), 0);
  if (!config) return <Page title="Built on Arc">{null}</Page>;
  const d = config.deployment;
  const a = config.arc;
  const fresh = markets.data?.rows.filter((r) => r.feed?.fresh).length ?? 0;
  const test = config.network === 'arc-testnet';
  const rows: { piece: string; what: string; address?: string | null; state: string; ok: boolean; proof: string }[] = [
    { piece: 'USDC gas · sub-second finality', what: 'You hold one token; every signature is final in under a second.', address: a.usdc, state: `chain ${config.chainId}, block ${config.block ?? '—'}`, ok: !!config.block, proof: 'Live on testnet: a $0.04 buy confirmed in 1.6 to 2.6 s end to end (gas estimate and receipt polling included); sub-second finality is Arc’s documented property.' },
    { piece: 'XorrDelegation', what: 'The permission: daily cap, venue, end date, Chainlink floor, one-tap revoke.', address: d?.delegation, state: d ? 'deployed' : 'not deployed', ok: !!d, proof: 'Live on testnet (grant, trade, over-cap and price-floor refusals, revoke: docs/E2E-TESTNET.md). Fork: mainnet.' },
    { piece: 'Chainlink Data Feeds', what: 'The council’s prices and the on-chain floor under every fill (XorrPriceGuard).', address: d?.priceGuard, state: d?.mirrorFeeds ? `${fresh}/4 fresh (testnet mirrors of mainnet)` : `${fresh}/4 fresh`, ok: fresh >= 4, proof: 'Testnet: live mirrors of Chainlink’s Arc mainnet answers (Arc testnet has no Chainlink feeds). Real feeds: proven on a mainnet fork only.' },
    { piece: d?.venueKind === 'uniswap-v3' ? 'Uniswap v3 on Arc' : 'Uniswap v2 (XORR-deployed, testnet)', what: d?.venueKind === 'uniswap-v3' ? 'The venue: real pools for cirBTC, EURC and WETH.' : 'Testnet has no Uniswap: published v2 bytecode, XORR-seeded pools.', address: d?.venue, state: 'venue registry', ok: !!d, proof: d?.venueKind === 'uniswap-v3' ? 'Fork: fills on the real Arc mainnet pools (docs/E2E-FORK.md).' : 'Live on testnet: XORR-seeded pools for test tokens (xWETH, xcirBTC) of about 5 USDC each; thin on purpose, labelled everywhere.' },
    { piece: 'ERC-8004', what: 'Five council agents with on-chain identity; every round scored into the Reputation Registry.', address: d?.identityRegistry, state: `${agents.data?.seats.filter((s) => s.operator).length ?? 0}/5 registered`, ok: (agents.data?.seats.filter((s) => s.operator).length ?? 0) === 5, proof: 'Live on testnet: five seats registered. Reputation writes: proven on the mainnet fork; testnet settles one hour after a round.' },
    { piece: 'Arc Memo', what: 'Every agent trade carries its council decision id as the memo id.', address: a.memo, state: config.memoLive ? 'CallFrom live on this node' : 'node does not run CallFrom: plain calls', ok: config.memoLive, proof: 'Live on testnet: trades are sent through Memo with the decision id as memo id.' },
    { piece: 'Chainlink CCIP', what: 'A stop sent from Base or Ethereum reaches your permission on Arc (XorrStopReceiver).', address: d?.stopReceiver, state: `router ${a.ccip.router.slice(0, 8)}…`, ok: !!d, proof: 'Receiver deployed on testnet. A stop from Base/Ethereum has NOT run over a live lane; covered by Chainlink Local tests only.' },
    { piece: 'Circle Gateway', what: 'Fund XORR from a unified USDC balance on any chain.', address: a.gatewayMinter, state: config.features?.gateway ? 'enabled on this executor' : 'switched off (FEATURE_GATEWAY)', ok: !!config.features?.gateway, proof: 'Not run: needs Circle’s live attestation service.' },
    { piece: 'CCTP V2', what: 'Withdraw: burn on Arc, mint on Base or Ethereum.', address: a.tokenMessengerV2, state: config.features?.cctp ? `domain ${a.cctpDomain}, enabled` : 'switched off (FEATURE_CCTP)', ok: !!config.features?.cctp, proof: 'Not run: needs Circle’s live attestation service.' },
    { piece: 'USYC', what: 'Idle USDC parked for yield (entitled wallets).', address: a.usyc, state: config.features?.usyc ? 'permissioned, enabled' : 'read-only (FEATURE_USYC off)', ok: !!config.features?.usyc, proof: 'Not run: only an entitled wallet can hold it.' },
    { piece: 'EURC', what: 'The FX desk; Peg Desk checks EURC against EUR/USD.', address: a.eurc, state: test ? 'pool not seeded' : 'Uniswap USDC/EURC', ok: !test, proof: 'Testnet: the USDC/EURC pool is not seeded, so nothing trades EURC there. Mainnet fork: bought on the real pool.' },
  ];
  return (
    <Page title="Built on Arc" eyebrow="State read from Arc now">
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
          {r.address ? <AddressLink address={r.address} /> : null}
          <Text variant="secondarySm" color={colors.ink65}>
            {r.proof}
          </Text>
          <Details testID={`arc-details-${r.piece.split(' ')[0]?.toLowerCase()}`}>
            <Text variant="secondary">{r.what}</Text>
          </Details>
        </Card>
      ))}
    </Page>
  );
}
