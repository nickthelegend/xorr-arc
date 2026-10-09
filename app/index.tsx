import { useStore } from "@/state/store";
/**
 * Home. Who you are on Arc, what XORR may do with your money (read from the chain), the one hold that stops it, and
 * what the council did last.
 */
import React, { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { encodeFunctionData } from 'viem';
import { Aurora, Button, Eyebrow, HoldButton, Press, Text, colors, radius, space } from '@/ui';
import { api } from '@/arc/api';
import { delegationAbi } from '@/arc/abis';
import { amt, usd, when } from '@/arc/format';
import { useConfig, usePoll } from '@/arc/hooks';
import { Bar, Card, KV, NetworkBadge, Note, TxLink } from '@/arc/ui';
import { recoverOwnerTransaction, sendTx, useWallet } from '@/arc/wallet';

const WORDMARK = require('../assets/brand/xorr-wordmark.png');

const TILES = [
  { href: '/council', title: 'Council', sub: 'Five agents vote; trades carry their decision id' },
  { href: '/permission', title: 'Permission', sub: 'Daily cap, venue, end date, kill switch' },
  { href: '/markets', title: 'Markets', sub: 'Chainlink on Arc beside Uniswap' },
  { href: '/agents', title: 'Agents', sub: 'ERC-8004 identity and reputation' },
  { href: '/fund', title: 'Fund & withdraw', sub: 'Gateway and CCTP V2, any chain' },
  { href: '/treasury', title: 'Treasury', sub: 'USYC yield and EURC' },
  { href: '/arc', title: 'Built on Arc', sub: 'Every Arc piece, checked live' },
] as const;

export default function Home() {
  const { balancesHidden, setBalancesHidden } = useStore();
  const config = useConfig((s) => s.config);
  const { address, kind, connectDevice, connectInjected } = useWallet();
  const account = usePoll(address ? () => api.account(address) : null, 6000, [address]);
  const rounds = usePoll(address ? () => api.rounds(address) : null, 6000, [address]);
  const [stopTx, setStopTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const a = account.data;
  const p = a?.permission;
  const live = !!p?.granted && !p.revoked && !p.stopped && p.expiresAt * 1000 > Date.now();

  async function stop() {
    if (!config?.deployment) return;
    setErr(null);
    try {
      const r = await sendTx(config.deployment.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'revoke', args: [] }));
      setStopTx(`${r.hash}|${r.ms}`);
      await account.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingBottom: 90, gap: space.s16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Image source={WORDMARK} style={{ width: 104, height: 21 }} resizeMode="contain" accessibilityLabel="XORR" />
          <NetworkBadge />
          {address?<Button label="Check original transaction" onPress={async()=>{setErr(null);try{const r=await recoverOwnerTransaction();setErr(`Original call finalized: ${r.transactionHash}. No new transaction was sent.`);await account.refresh();}catch(e){setErr(e instanceof Error?e.message:String(e));}}}/>:null}
          <Press onPress={() => setBalancesHidden(!balancesHidden)} testID="toggle-balances" accessibilityLabel={balancesHidden ? 'Show balances' : 'Hide balances'}>
            <Text variant="control">{balancesHidden ? 'Show balances' : 'Hide balances'}</Text>
          </Press>
        </View>

        <View style={{ gap: space.s6 }}>
          <Text variant="onboardingTitle">A council of agents trades for you, inside a permission Arc enforces.</Text>
          <Text variant="body" color={colors.ink65}>
            Capped per day, one venue, an end date, every fill floored at Chainlink’s price. You hold only USDC, and it pays the gas. Revoke in one hold.
          </Text>
        </View>

        {!config?.deployment ? <Note tone="warn">The executor has no XORR deployment loaded for {config?.network ?? 'this network'}.</Note> : null}

        {!address ? (
          <Card title="Connect a wallet on Arc" eyebrow="Self-custodial" testID="connect-card">
            <Text variant="bodySm" color={colors.ink65}>
              XORR never holds a key that can move your money. A device key is generated in this browser (fine for a testnet or a fork); a browser wallet works too.
            </Text>
            <Button label="Create a device key" onPress={() => {
              if (config) connectDevice(config);
            }} testID="connect-device" />
            <Button label="Use a browser wallet" variant="secondary" onPress={() => {
              if (config) connectInjected(config).catch((e) => setErr(String(e?.message ?? e)));
            }} />
          </Card>
        ) : (
          <Card eyebrow={kind === 'device' ? 'Device key' : 'Browser wallet'} title={`${address.slice(0, 8)}…${address.slice(-6)}`} testID="wallet-card">
            {a ? (
              <>
                {a.balances.tokens.map((t) => (
                  <KV figure="units" key={t.sym} k={t.label} v={amt(t.amount, t.sym === 'CBTC' ? 8 : 6)} />
                ))}
                {a.balances.usyc > 0 ? <KV figure="units" k="USYC" v={amt(a.balances.usyc)} /> : null}
                <Text variant="secondarySm">USDC is also the gas token on Arc: one balance, no second coin to keep topped up.</Text>
              </>
            ) : (
              <Text variant="secondary">{account.error ?? 'Reading Arc…'}</Text>
            )}
            {config?.arc.faucet && a && a.gasUsdc < 1 ? (
              <Note tone="warn">This wallet has no USDC yet. Get testnet USDC at faucet.circle.com (it pays gas too), or fund it from another chain.</Note>
            ) : null}
          </Card>
        )}

        {address && p ? (
          <Card tone="accent" eyebrow="The permission, read from Arc" title={live ? 'Your agents may trade' : p.granted ? 'Your agents are stopped' : 'No permission granted yet'} testID="permission-card">
            {p.granted ? (
              <>
                <KV k="Left today" v={`${usd(p.remainingToday)} of ${usd(p.dailyCap)}`} />
                <Bar fraction={p.dailyCap ? p.spentToday / p.dailyCap : 0} />
                <KV k="Ends" v={new Date(p.expiresAt * 1000).toUTCString().slice(5, 22)} />
                <KV k="Slippage floor" v={`${(p.maxSlippageBps / 100).toFixed(2)}% under Chainlink`} />
                <KV k="Venues" v={`${p.venues.length} (Uniswap on Arc)`} />
                <KV k="Cross-chain stop (CCIP)" v={a?.guardian.set ? 'armed' : 'off'} />
              </>
            ) : (
              <Text variant="bodySm" color={colors.ink65}>Grant XORR a daily USDC cap on one venue, with an end date. The contract enforces every limit.</Text>
            )}
            <Button label={p.granted ? 'Change the permission' : 'Grant a permission'} variant={p.granted ? 'secondary' : 'primary'} onPress={() => router.push('/permission')} testID="open-permission" />
          </Card>
        ) : null}

        {address && live ? (
          <View style={{ gap: space.s8 }}>
            <HoldButton label="Hold to stop every agent" accessibilityHint="Hold to stop" onCommit={stop} testID="hold-stop" />
            <Text variant="secondarySm" align="center">
              One transaction to XorrDelegation.revoke(). Final in under a second; no server involved.
            </Text>
          </View>
        ) : null}
        {stopTx ? (
          <Note tone="up">
            Stopped on Arc in {stopTx.split('|')[1]} ms. <TxLink hash={stopTx.split('|')[0]} />
          </Note>
        ) : null}
        {err ? <Note tone="down">{err}</Note> : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s10 }}>
          {TILES.map((t) => (
            <Press key={t.href} onPress={() => router.push(t.href)} style={{ width: '48%' }} testID={`tile-${t.href.slice(1)}`}>
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.cardBorder, padding: space.s14, minHeight: 92, gap: 4 }}>
                <Text variant="rowPrimary">{t.title}</Text>
                <Text variant="secondarySm">{t.sub}</Text>
              </View>
            </Press>
          ))}
        </View>

        {address ? (
          <View style={{ gap: space.s8 }}>
            <Eyebrow>Latest rounds</Eyebrow>
            {(rounds.data?.rounds ?? []).slice(0, 5).map((r) => (
              <Press key={r.id} onPress={() => router.push(`/round/${r.id}`)}>
                <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, padding: space.s12, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="rowPrimary">
                      {r.inputs.proposal.side === 'buy' ? 'Buy' : 'Sell'} {r.inputs.proposal.label} {usd(r.inputs.proposal.usd)}
                    </Text>
                    <Text variant="control" color={r.decision === 'approved' ? colors.up : r.decision === 'vetoed' ? colors.down : colors.ink55}>
                      {r.decision}
                    </Text>
                  </View>
                  <Text variant="secondarySm" numberOfLines={2}>
                    {when(r.createdAt)} · {r.summary}
                  </Text>
                </View>
              </Press>
            ))}
            {rounds.data && rounds.data.rounds.length === 0 ? <Text variant="secondary">No rounds yet. Open the Council to run one.</Text> : null}
          </View>
        ) : null}
        {config ? (
          <Text variant="secondarySm" align="center">
            {config.arc.name} · chain {config.chainId} · block {config.block ?? '—'} · Memo {config.memoLive ? 'live' : 'off on this node'}
            {config.deployment?.mirrorFeeds ? ' · feeds mirror Chainlink mainnet' : ''}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
