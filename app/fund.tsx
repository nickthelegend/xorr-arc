import {BURN_INTENT_TYPES,BURN_INTENT_DOMAIN,burnIntentFromJson,gatewayFor} from '@/arc/gateway-codec';
import {readGateway,saveGateway,clearGateway,publicIntent,recoverGateway,type GatewayPending} from '@/arc/gateway-recovery';
/**
 * Money in and out of Arc, chain-abstracted: Circle Gateway brings a unified USDC balance from any supported chain
 * into your Arc wallet; CCTP V2 burns USDC on Arc and mints it on Base or Ethereum. Either way you hold USDC only.
 */
import React, { useState } from 'react';
import { encodeFunctionData, pad, parseUnits,keccak256, type Hex } from 'viem';
import { Button, Text, colors } from '@/ui';
import { api, API_URL } from '@/arc/api';
import { erc20Abi, tokenMessengerV2Abi } from '@/arc/abis';
import { usd, amt } from '@/arc/format';
import { useConfig, usePoll } from '@/arc/hooks';
import { AddressLink, Card, Choice, KV, Note, Page, TxLink, open } from '@/arc/ui';
import { sendTx, useWallet } from '@/arc/wallet';

type GatewayInfo = { wallet: string; minter: string; sources: { domain: number; name: string }[]; balances: { domain: number; name: string; balance: number }[]; total: number };

export default function Fund() {
  const config = useConfig((s) => s.config);
  const { address, wallet } = useWallet();
  const account = usePoll(address ? () => api.account(address) : null, 10000, [address]);
  const gw = usePoll<GatewayInfo>(address && config?.features?.gateway ? () => fetch(`${API_URL}/gateway/${address}`).then((r) => r.json()) : null, 0, [address]);
  const [source, setSource] = useState(6);
  const [gwAmount, setGwAmount] = useState(5);
  const [dest, setDest] = useState(0);
  const [outAmount, setOutAmount] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ burn?: string; mint?: string; status?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!config || !address) return <Page title="Fund & withdraw">{<Note>Connect a wallet on the home screen first.</Note>}</Page>;
  const cfg = config.arc;
  const remote = cfg.remotes[dest]!;

  async function gatewayMint() {
    setErr(null);
    setBusy('Signing the burn intent');
    let original:GatewayPending|undefined;let submitted=false;
    try {
      if(readGateway(localStorage,config!.chainId,address!))throw Error('An original Gateway transfer is unresolved. Check its receipt before signing again.');
      const intent = await fetch(`${API_URL}/gateway/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: address, sourceDomain: source, amountUnits: String(gwAmount * 1e6) }),
      }).then((r) => r.json());
      if (intent.error) throw new Error(intent.error);
      const t = intent.typedData;
      if(JSON.stringify(t.types)!==JSON.stringify(BURN_INTENT_TYPES)||JSON.stringify(t.domain)!==JSON.stringify(BURN_INTENT_DOMAIN))throw Error('Unexpected Gateway signing schema.');
      const parsed=burnIntentFromJson(gatewayFor(config!.network),t.message);
      if(parsed.spec.sourceSigner.toLowerCase()!==pad(address!,{size:32}).toLowerCase()||parsed.spec.value!==parseUnits(String(gwAmount),6)||parsed.spec.sourceDomain!==source)throw Error('Gateway intent differs from the original owner/input.');
      original={version:1,chainId:config!.chainId,owner:address!,minter:config!.arc.gatewayMinter,token:config!.arc.usdc,intents:[publicIntent(t.message)],stage:'unsigned'};saveGateway(localStorage,original);
      if(useWallet.getState().address!==address||useWallet.getState().wallet!==wallet||await wallet!.getChainId()!==config!.chainId)throw Error('Original wallet/network changed before signing.');
      const message = { ...t.message, maxBlockHeight: BigInt(t.message.maxBlockHeight), maxFee: BigInt(t.message.maxFee), spec: { ...t.message.spec, value: BigInt(t.message.spec.value) } };
      const signature = await wallet!.signTypedData({ account: wallet!.account ?? address!, domain: t.domain, types: t.types, primaryType: 'BurnIntent', message });
      if(useWallet.getState().address!==address||useWallet.getState().wallet!==wallet||await wallet!.getChainId()!==config!.chainId)throw Error('Original wallet/network changed before submission.');
      original={...original,signatureHashes:[keccak256(signature)],stage:'submitted'};saveGateway(localStorage,original);submitted=true;
      setBusy('Circle attests, XORR mints on Arc');
      const r = await fetch(`${API_URL}/gateway/mint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ burnIntent: t.message, signature }) }).then((x) => x.json());
      if(r.mint){original={...original,hash:r.mint};saveGateway(localStorage,original);}
      if (r.error) throw new Error(r.error);
      const proven=await recoverGateway(useWallet.getState().pub!,localStorage,config!.chainId,address!);
      setOut({ mint: proven.hash });
      await gw.refresh();
    } catch (e) {
      if(original&&!submitted&&original.stage==='unsigned'){try{clearGateway(localStorage,original);}catch(error){e=error;}}
      setErr(e instanceof Error ? e.message.split('\n')[0]! : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function recoverMint(){setErr(null);try{const r=await recoverGateway(useWallet.getState().pub!,localStorage,config!.chainId,address!);setOut({mint:r.hash});await gw.refresh();}catch(e){setErr(e instanceof Error?e.message:String(e));}}
  async function withdraw() {
    setErr(null);
    try {
      const amount = parseUnits(String(outAmount), 6);
      setBusy('Approving USDC to CCTP');
      await sendTx(cfg.usdc, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [cfg.tokenMessengerV2, amount] }));
      setBusy('Burning on Arc');
      const r = await sendTx(
        cfg.tokenMessengerV2,
        encodeFunctionData({
          abi: tokenMessengerV2Abi,
          functionName: 'depositForBurn',
          args: [amount, remote.cctpDomain, pad(address!, { size: 32 }) as Hex, cfg.usdc, pad('0x00', { size: 32 }) as Hex, 0n, 2000],
        }),
      );
      setOut({ burn: r.hash, status: 'Burned on Arc. Waiting for Circle’s attestation…' });
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const s = await fetch(`${API_URL}/cctp/${r.hash}`).then((x) => x.json()).catch(() => null);
        const m = s?.messages?.[0];
        if (m?.status === 'complete') {
          setOut({ burn: r.hash, status: `Attested. Mint it on ${remote.name}: MessageTransmitterV2.receiveMessage(message, attestation) from any wallet there (server/scripts/cctp-mint.ts does it).` });
          break;
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0]! : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page title="Fund & withdraw" eyebrow="Circle Gateway · CCTP V2 · USDC gas">
      {config.fork ? <Note tone="warn">On a local fork Circle’s APIs cannot attest fork transactions: these flows need the real network.</Note> : null}
      <Card title="Your Arc address">
        {account.data?.balances.tokens.map(t => <KV figure="units" key={t.sym} k={t.label} v={amt(t.amount, t.sym === 'CBTC' ? 8 : 6)} />)}
        {account.data && account.data.balances.usyc > 0 ? <KV figure="units" k="USYC" v={amt(account.data.balances.usyc)} /> : null}
        {account.error ? <Note tone="down">Balance read failed: {account.error}</Note> : null}
        <KV k="Address" v={<AddressLink address={address} />} />
        <Text variant="secondarySm">USDC is Arc’s gas token: this one balance pays for every transaction you sign.</Text>
        {cfg.faucet ? <Button label="Get testnet USDC / EURC (Circle faucet)" variant="secondary" onPress={() => open(cfg.faucet!)} /> : null}
      </Card>

      {config.features?.gateway ? (
      <Card title="From any chain, with Gateway" eyebrow="Unified USDC balance">
        <Text variant="secondary">
          Deposit USDC once into GatewayWallet ({cfg.gatewayWallet.slice(0, 10)}…) on any supported chain. Then move any part of it to Arc here: you sign a burn intent, Circle attests, XORR’s executor mints it to you on Arc.
        </Text>
        <KV k="Your Gateway balance" v={gw.data ? usd(gw.data.total) : gw.error ? 'unreadable' : '…'} />
        {(gw.data?.balances ?? []).filter((b) => b.balance > 0).map((b) => (
          <KV key={b.domain} k={b.name} v={usd(b.balance)} />
        ))}
        <Choice options={(gw.data?.sources ?? []).filter((s) => s.domain !== cfg.cctpDomain).map((s) => ({ label: s.name, value: s.domain }))} value={source} onChange={setSource} testID="gw-source" />
        <Choice options={[5, 20, 100].map((n) => ({ label: usd(n, 0), value: n }))} value={gwAmount} onChange={setGwAmount} />
        <Button label="Check original Gateway transfer" onPress={()=>void recoverMint()}/>
        <Button label={busy?.startsWith('Sign') || busy?.startsWith('Circle') ? `${busy}…` : 'Move to Arc'} onPress={gatewayMint} disabled={!!busy} />
      </Card>

      ) : (
        <Note>Gateway funding is switched off on this executor (it needs Circle’s live attestation service). Fund this address with USDC directly.</Note>
      )}

      {config.features?.cctp ? (
      <Card title="Out to another chain, with CCTP V2" eyebrow="Burn on Arc, mint there">
        <Choice options={cfg.remotes.map((r, i) => ({ label: r.name, value: i }))} value={dest} onChange={setDest} testID="cctp-dest" />
        <Choice options={[1, 5, 20].map((n) => ({ label: usd(n, 0), value: n }))} value={outAmount} onChange={setOutAmount} />
        <Button label={busy && !busy.startsWith('Sign') && !busy.startsWith('Circle') ? `${busy}…` : `Withdraw to ${remote.name}`} variant="secondary" onPress={withdraw} disabled={!!busy} />
      </Card>
      ) : null}
      {out?.mint ? <Note tone="up">Minted on Arc: <TxLink hash={out.mint} /></Note> : null}
      {out?.burn ? (
        <Note>
          {out.status} <TxLink hash={out.burn} />
        </Note>
      ) : null}
      {err ? <Note tone="down">{err}</Note> : null}
      <Text variant="secondarySm" color={colors.ink45}>
        CCTP domain {cfg.cctpDomain} · TokenMessengerV2 {cfg.tokenMessengerV2.slice(0, 10)}… · GatewayMinter {cfg.gatewayMinter.slice(0, 10)}…
      </Text>
    </Page>
  );
}
