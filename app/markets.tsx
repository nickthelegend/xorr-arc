/** Markets: Chainlink Data Feeds on Arc for every asset XORR trades, the venue's live quote beside each, and reserves. */
import React from 'react';
import { View } from 'react-native';
import { Text, colors, space } from '@/ui';
import { api } from '@/arc/api';
import { age, bps, px } from '@/arc/format';
import { usePoll } from '@/arc/hooks';
import { AddressLink, Card, KV, Note, Page } from '@/arc/ui';

export default function Markets() {
  const m = usePoll(() => api.markets(), 15_000);
  const data = m.data;
  return (
    <Page title="Markets" eyebrow="Chainlink on Arc · Uniswap on Arc">
      {data?.mirror ? (
        <Note tone="warn">Arc testnet has no Chainlink feeds. These are XORR mirror feeds, posted by the keeper from Chainlink’s Arc mainnet answers, and the pools are XORR’s own test pools.</Note>
      ) : null}
      {m.error ? <Note tone="down">{m.error}</Note> : null}
      {(data?.rows ?? []).map((r) => (
        <Card key={r.sym} title={r.label} eyebrow={r.feed?.description} testID={`market-${r.sym}`}>
          {r.feed ? (
            <>
              <KV figure="market" k="Chainlink" v={px(r.feed.price)} />
              <KV k="Updated" v={`${age(r.feed.ageSec)} ago (limit ${age(r.feed.maxAgeSec)})`} tone={r.feed.fresh ? undefined : colors.down} />
              <KV k="Feed" v={<AddressLink address={r.feed.feed} />} />
            </>
          ) : (
            <Text variant="secondary">{r.error}</Text>
          )}
          {r.venue && 'price' in r.venue ? (
            <>
              <KV figure="market" k={`$10 on ${r.venue.venue}`} v={px(r.venue.price)} />
              <KV k="From Chainlink" v={bps(r.venue.gapBps)} tone={Math.abs(r.venue.gapBps) > 100 ? colors.warn : undefined} />
            </>
          ) : r.venue && 'error' in r.venue ? (
            <Text variant="secondary">Quote unavailable: {r.venue.error}</Text>
          ) : null}
        </Card>
      ))}
      {data ? (
        <Card title="cirBTC Proof of Reserve" eyebrow="Chainlink PoR on Arc mainnet">
          {'ratio' in data.cirBtcReserve ? (
            <>
              <KV k="Reserves" v={`${data.cirBtcReserve.reserve.toFixed(4)} BTC`} />
              <KV k="cirBTC supply" v={`${data.cirBtcReserve.supply.toFixed(4)}`} />
              <KV k="Backing" v={`${(data.cirBtcReserve.ratio * 100).toFixed(2)}%`} tone={data.cirBtcReserve.ratio >= 0.999 ? colors.up : colors.down} />
              <Text variant="secondarySm">The Peg Desk vetoes any cirBTC buy while this is under 99.9%.</Text>
            </>
          ) : (
            <Text variant="secondary">{data.cirBtcReserve.error}</Text>
          )}
        </Card>
      ) : null}
      <View style={{ height: space.s20 }} />
    </Page>
  );
}
