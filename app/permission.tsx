/**
 * The permission: what XORR's agent may do with your USDC on Arc, written to XorrDelegation by your own wallet.
 * Every limit here is enforced by the contract on every trade — the executor cannot exceed it.
 */
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { encodeFunctionData, maxUint256, type Address } from 'viem';
import { Button, Text, colors, space } from '@/ui';
import { api } from '@/arc/api';
import { delegationAbi, erc20Abi } from '@/arc/abis';
import { usd } from '@/arc/format';
import { useConfig, usePoll } from '@/arc/hooks';
import { AddressLink, Card, Choice, KV, Note, Page, TxLink } from '@/arc/ui';
import { sendTx, useWallet } from '@/arc/wallet';

export default function Permission() {
  const config = useConfig((s) => s.config);
  const d = config?.deployment;
  const address = useWallet((s) => s.address);
  const account = usePoll(address ? () => api.account(address) : null, 0, [address]);
  const ceiling = d ? d.dailyCapCeiling / 1e6 : 250;
  const [cap, setCap] = useState(0.1);
  const [days, setDays] = useState(1);
  const [slip, setSlip] = useState(200);
  const [guardian, setGuardian] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [txs, setTxs] = useState<{ label: string; hash: string; ms: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if(config?.network === 'arc-mainnet') setCap(25); }, [config?.network]);

  if (!d || !config?.executor) return <Page title="Permission">{<Note tone="warn">No deployment loaded.</Note>}</Page>;
  if (!address) return <Page title="Permission">{<Note>Connect a wallet on the home screen first.</Note>}</Page>;
  const agent = config.executor;
  const a = account.data;

  async function run(label: string, to: Address, data: `0x${string}`) {
    setBusy(label);
    const r = await sendTx(to, data);
    setTxs((t) => [...t, { label, hash: r.hash, ms: r.ms }]);
  }

  async function grant() {
    setErr(null);
    setTxs([]);
    try {
      // USDC for buys, and each asset the agent may sell back (closing never touches the daily cap).
      for (const [label, token] of [['Approve USDC', d!.usdc], ['Approve cirBTC', d!.cbtc], ['Approve WETH', d!.weth], ['Approve EURC', d!.eurc]] as const) {
        const have = a?.allowances.find((x) => x.sym === (label === 'Approve USDC' ? 'USDC' : label === 'Approve cirBTC' ? 'CBTC' : label === 'Approve WETH' ? 'WETH' : 'EURC'));
        if (have && BigInt(have.raw) > 10n ** 30n) continue;
        await run(label, token, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [d!.delegation, maxUint256] }));
      }
      const expires = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
      await run('Grant', d!.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'grant', args: [agent, BigInt(cap * 1e6), expires, slip, [d!.venue]] }));
      if (guardian !== a?.guardian.set) {
        await run(guardian ? 'Arm the CCIP stop' : 'Disarm the CCIP stop', d!.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'setGuardian', args: [d!.stopReceiver, guardian] }));
      }
      await account.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0]! : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function revokeAgent() {
    setErr(null);
    try {
      await run('Revoke the agent', d!.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'revokeAgent', args: [agent] }));
      await account.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0]! : String(e));
    } finally {
      setBusy(null);
    }
  }

  const p = a?.permission;
  return (
    <Page title="The permission" eyebrow="XorrDelegation on Arc">
      {p?.granted ? (
        <Card title="Now, on chain">
          <KV k="Agent" v={<AddressLink address={agent} />} />
          <KV k="Daily cap" v={`${usd(p.dailyCap)} (left today ${usd(p.remainingToday)})`} />
          <KV k="Ends" v={new Date(p.expiresAt * 1000).toUTCString().slice(5, 22)} />
          <KV k="Slippage floor" v={`${p.maxSlippageBps / 100}% under Chainlink`} />
          <KV k="State" v={p.stopped ? 'stopped (kill switch)' : p.revoked ? 'agent revoked' : 'live'} tone={p.stopped || p.revoked ? colors.down : colors.up} />
          <KV k="CCIP stop receiver" v={a?.guardian.set ? 'guardian (can only stop)' : 'not a guardian'} />
        </Card>
      ) : null}

      <Card title="Daily cap, in USDC" eyebrow="Resets at midnight UTC">
        <Choice options={(config.network === 'arc-testnet' ? [0.05, 0.1, 0.2] : [5, 10, 25, 50, 100]).filter((n) => n <= ceiling).map((n) => ({ label: usd(n, n < 1 ? 2 : 0), value: n }))} value={cap} onChange={setCap} testID="cap" />
        <Text variant="secondarySm">This deployment refuses any cap over {usd(ceiling, 0)} a day{config.network === 'arc-mainnet' ? ' (mainnet is kept tiny on purpose)' : ''}.</Text>
      </Card>
      <Card title="Ends after">
        <Choice options={[{ label: '1 day', value: 1 }, { label: '7 days', value: 7 }, { label: '30 days', value: 30 }]} value={days} onChange={setDays} testID="days" />
      </Card>
      <Card title="Slippage floor" eyebrow="Checked against Chainlink on chain">
        <Choice options={[{ label: '0.5%', value: 50 }, { label: '1%', value: 100 }, { label: '2%', value: 200 }]} value={slip} onChange={setSlip} testID="slip" />
        <Text variant="secondarySm">XorrDelegation refuses any fill that pays you less than Chainlink’s value of what was sold, minus this. The agent’s key does not choose the floor.</Text>
      </Card>
      <Card title="Venue">
        <KV k={d.venueKind === 'uniswap-v3' ? 'Uniswap v3 SwapRouter02' : 'Uniswap v2 (XORR testnet pools)'} v={<AddressLink address={d.venue} />} />
        <Text variant="secondarySm">Only venues on XORR’s curated registry can be allowed (DEX routers that pull from the caller), and the output must reach your wallet.</Text>
      </Card>
      <Card title="Stop from another chain" eyebrow="Chainlink CCIP">
        <Choice options={[{ label: 'Armed', value: 1 }, { label: 'Off', value: 0 }]} value={guardian ? 1 : 0} onChange={(v) => setGuardian(v === 1)} testID="guardian" />
        <Text variant="secondarySm">
          Not run over a live cross-chain lane. Lets XorrStopReceiver ({d.stopReceiver.slice(0, 10)}…) stop your agents when you send a stop from Base or Ethereum with CCIP (XorrStopSender.stopAll(), fee in ETH). It can only stop — never grant or trade.
        </Text>
      </Card>

      <Button label={busy ? `${busy}…` : p?.granted ? 'Save the permission' : 'Approve and grant'} loading={!!busy} onPress={grant} testID="grant" />
      {p?.granted && !p.revoked ? <Button label="Revoke this agent" variant="ghost" loading={!!busy} onPress={revokeAgent} testID="revoke-agent" /> : null}

      {txs.length ? (
        <Card title="Signed and final on Arc">
          {txs.map((t) => (
            <View key={t.hash} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s8 }}>
              <Text variant="secondary">
                {t.label} · {t.ms} ms
              </Text>
              <TxLink hash={t.hash} />
            </View>
          ))}
        </Card>
      ) : null}
      {err ? <View testID="permission-error"><Note tone="down">{err}</Note></View> : null}
    </Page>
  );
}
