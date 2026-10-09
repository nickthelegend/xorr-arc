/**
 * Treasury: idle USDC parked in USYC (Hashnote's tokenized money-market fund on Arc) between trades, and the EURC the
 * FX desk holds. USYC is permissioned: only wallets Circle has entitled can subscribe, and this screen says which you are.
 */
import React, { useState } from 'react';
import { encodeFunctionData, parseUnits } from 'viem';
import { Button, Text, colors } from '@/ui';
import { api } from '@/arc/api';
import { erc20Abi, usycTellerAbi } from '@/arc/abis';
import { amt, usd } from '@/arc/format';
import { useConfig, usePoll } from '@/arc/hooks';
import { AddressLink, Card, Choice, KV, Note, Page, TxLink } from '@/arc/ui';
import { sendTx, useWallet } from '@/arc/wallet';

export default function Treasury() {
  const config = useConfig((s) => s.config);
  const address = useWallet((s) => s.address);
  const account = usePoll(address ? () => api.account(address) : null, 0, [address]);
  const [amount, setAmount] = useState(10);
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!config || !address) return <Page title="Treasury">{<Note>Connect a wallet on the home screen first.</Note>}</Page>;
  const cfg = config.arc;
  const a = account.data;
  const u = a?.usyc;
  const writes = !!config.features?.usyc; // subscribe/redeem is untested without a Circle-entitled wallet: off until the operator turns it on
  const entitled = writes && !!u && 'entitled' in u && u.entitled;
  const eurc = a?.balances.tokens.find((t) => t.sym === 'EURC')?.amount ?? 0;

  async function park() {
    setErr(null);
    try {
      const v = parseUnits(String(amount), 6);
      await sendTx(cfg.usdc, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [cfg.usycTeller, v] }));
      const r = await sendTx(cfg.usycTeller, encodeFunctionData({ abi: usycTellerAbi, functionName: 'deposit', args: [v, address!] }));
      setTx(r.hash);
      await account.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0]! : String(e));
    }
  }

  async function unpark() {
    setErr(null);
    try {
      const shares = parseUnits(String(a!.balances.usyc), 6);
      const r = await sendTx(cfg.usycTeller, encodeFunctionData({ abi: usycTellerAbi, functionName: 'redeem', args: [shares, address!, address!] }));
      setTx(r.hash);
      await account.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0]! : String(e));
    }
  }

  return (
    <Page title="Treasury" eyebrow="USYC · EURC">
      <Card title="Park idle USDC in USYC" eyebrow="Yield between trades">
        <KV figure="units" k="USYC held" v={a ? amt(a.balances.usyc) : '…'} />
        {u && 'entitled' in u ? (
          <>
            <KV k="1 USYC" v={u.priceUsdc ? `${u.priceUsdc.toFixed(6)} USDC` : '—'} />
            <KV k="This wallet" v={u.entitled ? 'entitled' : 'not entitled'} tone={u.entitled ? colors.up : colors.warn} />
            <KV k="Teller" v={<AddressLink address={u.teller} />} />
          </>
        ) : u ? (
          <Text variant="secondary">USYC unreadable: {u.error}</Text>
        ) : null}
        {!writes ? (
          <Note>Parking is switched off on this executor (FEATURE_USYC=on, and the wallet must be entitled by Circle). Reading your entitlement and the USYC price stays on.</Note>
        ) : !entitled ? (
          <Note tone="warn">
            USYC is permissioned: Circle (Hashnote) entitles each wallet in the Entitlements contract ({cfg.usycEntitlements.slice(0, 10)}…). Ask Circle Support to allowlist this address; until then XORR leaves idle USDC in your wallet.
          </Note>
        ) : null}
        <Choice options={[10, 25, 50].map((n) => ({ label: usd(n, 0), value: n }))} value={amount} onChange={setAmount} />
        <Button label="Park in USYC" onPress={park} disabled={!entitled} />
        <Button label="Redeem all USYC" variant="ghost" onPress={unpark} disabled={!entitled || !a?.balances.usyc} />
      </Card>
      <Card title="EURC" eyebrow="The FX desk">
        <KV figure="units" k="EURC held" v={amt(eurc)} />
        <Text variant="secondary">
          The council trades EURC against USDC on Uniswap v3’s USDC/EURC pool on Arc, floored by Chainlink’s EURC/USD feed; the Peg Desk vetoes when EURC leaves the euro. Circle StableFX (FxEscrow {cfg.fxEscrow.slice(0, 10)}…) needs a Circle StableFX account and API quotes, so XORR does not route through it.
        </Text>
      </Card>
      {tx ? <Note tone="up">Final on Arc: <TxLink hash={tx} /></Note> : null}
      {err ? <Note tone="down">{err}</Note> : null}
    </Page>
  );
}
