/**
 * XORR's executor on Arc: an HTTP API for the app, the council, and the keeper.
 *
 *   GET  /config               network, addresses, the executor (the agent the owner grants), Memo live or not
 *   GET  /markets              Chainlink on Arc for every asset, the venue's quote beside it, cirBTC reserves
 *   GET  /account/:owner       balances, the on-chain permission, venues, guardian (CCIP kill switch), USYC entitlement
 *   GET  /rounds?owner=        council rounds;  GET /rounds/:id  one round with its on-chain decision and Memo log
 *   POST /rounds               run a round (signed by the owner)
 *   POST /autopilot            switch autopilot on/off (signed by the owner)
 *   GET  /agents               the five seats: ERC-8004 identity and reputation from the Reputation Registry
 *   GET  /keeper               what the keeper did lately
 */
import { serve } from '@hono/node-server';
import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { formatUnits, getAddress, isAddress, toFunctionSelector, type Address, type Hex } from 'viem';
import {
  councilAbi,
  delegationAbi,
  erc20Abi,
  identityAbi,
  memoAbi,
  reputationAbi,
  usycAuthorityAbi,
  usycTellerAbi,
} from './abis.js';
import { ASSETS, labelOf, SEATS, TRADABLE, tokenOf, type Sym } from '../../shared/arc.js';
import { createReplayGuard } from './request-replay.js';
import { resolve } from 'node:path';
import { autopilotInput, roundAmount } from './action-input.js';
import { requestReplayKey, verifyRequest } from './auth.js';
import { executor, explain, memoLive, pub } from './chain.js';
import { ALLOWED_ORIGINS, DATA_DIR, CFG, DEPLOYMENT, DEPLOYMENT_PATH, FEATURES, IS_FORK, KEEPER, MAX_ROUND_USD, NETWORK, PORT, RPC_URL } from './env.js';
import { runRound } from './executor.js';
import { keeperLog, startKeeper } from './keeper.js';
import { balances, cirBtcReserve, quote, readFeed } from './market.js';
import { store } from './store.js';
import {
  BURN_INTENT_DOMAIN,
  BURN_INTENT_TYPES,
  GATEWAY_MINTER_ABI,
  burnIntentFromJson,
  burnIntentToJson,
  buildBurnIntent,
  gatewayFor,
} from './gateway.js';
import { encodeFunctionData, keccak256, recoverTypedDataAddress, toHex } from 'viem';
import { send } from './chain.js';

const app = new Hono();
app.use('*', cors({ origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS }));
app.use('*', async (c, next) => {
  if (process.env.VERCEL && c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') return c.json({ error: 'Start the local executor to run council rounds. Hosted mode reads the configured Arc network only.' }, 503);
  await next();
});
app.onError((e, c) => c.json({ error: explain(e) }, 500));

const requests = createReplayGuard(resolve(DATA_DIR, 'signed-requests.json'));
const d = DEPLOYMENT;
const need = () => {
  if (!d) throw new Error(`No XORR deployment at ${DEPLOYMENT_PATH}. Deploy first (scripts/deploy.sh) or point XORR_DEPLOYMENT at one.`);
  return d;
};
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)));

app.get('/health', (c) => c.json({ ok: true, network: NETWORK, fork: IS_FORK }));

app.get('/config', async (c) => {
  const block = await pub.getBlockNumber().catch(() => null);
  return c.json(
    json({
      readOnly: Boolean(process.env.VERCEL),
      network: NETWORK,
      fork: IS_FORK,
      chainId: CFG.chainId,
      rpcUrl: IS_FORK ? RPC_URL : CFG.rpcUrl,
      explorerUrl: CFG.explorerUrl,
      arc: CFG,
      deployment: d,
      executor: executor?.address ?? null,
      memoLive: await memoLive(),
      maxRoundUsd: MAX_ROUND_USD,
      features: FEATURES,
      keeperEnabled: KEEPER,
      testnetRepeg: NETWORK === 'arc-testnet' && !!d?.mirrorFeeds && d?.venueKind === 'uniswap-v2',
      block,
      seats: SEATS,
    }),
  );
});

/** Mined Arc receipt fees use 18-decimal native USDC. */
app.get('/receipts/:hash', async (c) => {
  const hash = c.req.param('hash');
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return c.json({ error: 'invalid transaction hash' }, 400);
  const r = await pub.getTransactionReceipt({ hash: hash as Hex });
  return c.json({ block: r.blockNumber.toString(), gasUsed: r.gasUsed.toString(), feeUsdc: Number(formatUnits(r.gasUsed * r.effectiveGasPrice, 18)) });
});

app.get('/markets', async (c) => {
  const dep = need();
  const rows = [];
  for (const sym of ['USDC', ...TRADABLE] as Sym[]) {
    try {
      const feed = await readFeed(dep, sym);
      let venue: { venue: string; price: number; gapBps: number } | { error: string } | null = null;
      if (sym !== 'USDC') {
        try {
          const q = await quote(dep, 'USDC', sym, PROBE_USDC);
          venue = { venue: q.venue, price: q.price, gapBps: ((q.price - feed.price) / feed.price) * 10_000 };
        } catch (e) {
          venue = { error: explain(e) };
        }
      }
      rows.push({ sym, label: labelOf(sym, NETWORK), token: tokenOf(dep, sym), feed, venue });
    } catch (e) {
      rows.push({ sym, label: labelOf(sym, NETWORK), error: explain(e) });
    }
  }
  return c.json(json({ network: NETWORK, mirror: dep.mirrorFeeds, probeUsd: Number(PROBE_USDC) / 1e6, rows, cirBtcReserve: await cirBtcReserve(), readAt: Date.now() }));
});

/** The size the markets table quotes. XORR's testnet pools hold ~5 USDC each, so a $10 probe would only show the pool's price impact. */
const PROBE_USDC = NETWORK === 'arc-mainnet' ? 10_000_000n : 20_000n;

const DEPOSIT_SIG = toFunctionSelector('deposit(uint256,address)');

app.get('/account/:owner', async (c) => {
  const dep = need();
  const o = c.req.param('owner');
  if (!isAddress(o)) return c.json({ error: 'not an address' }, 400);
  const owner = getAddress(o);
  const agent = executor?.address ?? dep.executor;
  const [bal, pol, remaining, spent, venues, guardian, stopped] = await Promise.all([
    balances(dep, owner),
    pub.readContract({ address: dep.delegation, abi: delegationAbi, functionName: 'agentPolicyOf', args: [owner, agent] }),
    pub.readContract({ address: dep.delegation, abi: delegationAbi, functionName: 'remainingTodayFor', args: [owner, agent] }),
    pub.readContract({ address: dep.delegation, abi: delegationAbi, functionName: 'spentTodayBy', args: [owner, agent] }),
    pub.readContract({ address: dep.delegation, abi: delegationAbi, functionName: 'venuesOf', args: [owner] }),
    pub.readContract({ address: dep.delegation, abi: delegationAbi, functionName: 'isGuardian', args: [owner, dep.stopReceiver] }),
    pub.readContract({ address: dep.delegation, abi: delegationAbi, functionName: 'isStopped', args: [owner] }),
  ]);
  const allowances = await Promise.all(
    (['USDC', ...TRADABLE] as Sym[]).map(async (s) => ({
      sym: s,
      raw: (await pub.readContract({ address: tokenOf(dep, s), abi: erc20Abi, functionName: 'allowance', args: [owner, dep.delegation] })).toString(),
    })),
  );
  let usyc: { entitled: boolean; priceUsdc: number | null; teller: Address } | { error: string };
  try {
    const authority = await pub.readContract({ address: CFG.usycTeller, abi: usycTellerAbi, functionName: 'authority' });
    const [entitled, per] = await Promise.all([
      pub.readContract({ address: authority, abi: usycAuthorityAbi, functionName: 'canCall', args: [owner, CFG.usycTeller, DEPOSIT_SIG] }),
      pub.readContract({ address: CFG.usycTeller, abi: usycTellerAbi, functionName: 'convertToAssets', args: [1_000_000n] }).catch(() => null),
    ]);
    usyc = { entitled, priceUsdc: per === null ? null : Number(formatUnits(per, 6)), teller: CFG.usycTeller };
  } catch (e) {
    usyc = { error: explain(e) };
  }
  const nativeGas = await pub.getBalance({ address: owner });
  return c.json(
    json({
      owner,
      agent,
      balances: bal,
      gasUsdc: Number(formatUnits(nativeGas, 18)),
      permission: {
        dailyCap: Number(formatUnits(pol[0], 6)),
        expiresAt: Number(pol[1]),
        maxSlippageBps: pol[2],
        revoked: pol[3],
        stopped: pol[4] || stopped,
        remainingToday: Number(formatUnits(remaining, 6)),
        spentToday: Number(formatUnits(spent, 6)),
        venues,
        granted: pol[0] > 0n,
      },
      guardian: { stopReceiver: dep.stopReceiver, set: guardian },
      allowances,
      autopilot: store.autopilot()[owner.toLowerCase()] ?? { on: false, usd: 0 },
      usyc,
    }),
  );
});

app.get('/rounds', (c) => {
  const owner = c.req.query('owner');
  const rows = owner ? store.byOwner(owner) : store.all();
  return c.json(json({ rounds: rows.slice(0, 100) }));
});

app.get('/rounds/:id', async (c) => {
  const dep = need();
  const r = store.get(c.req.param('id'));
  if (!r) return c.json({ error: 'no such round' }, 404);
  const onchain = await pub.readContract({ address: dep.council, abi: councilAbi, functionName: 'decisionOf', args: [r.id] }).catch(() => null);
  let memo: unknown[] = [];
  try {
    const from = BigInt(Math.max(0, dep.deployedAtBlock - 1));
    const logs = await pub.getContractEvents({ address: CFG.memo, abi: memoAbi, eventName: 'Memo', args: { memoId: r.id }, fromBlock: from });
    memo = logs.map((l) => ({ tx: l.transactionHash, sender: l.args.sender, target: l.args.target, memoIndex: l.args.memoIndex }));
  } catch {
    /* the RPC may cap log ranges; the trade's own receipt still shows the Memo event */
  }
  return c.json(json({ round: r, onchain, memo }));
});

type Signed<T> = { owner: string; body: T; at: number; signature: Hex };

app.post('/rounds', async (c) => {
  const dep = need();
  const req = (await c.req.json()) as Signed<{ sym: Sym; side: 'buy' | 'sell'; usd: number }>;
  const owner = await verifyRequest({ ...req, action: 'round' });
  const { sym, side, usd } = req.body;
  if (!TRADABLE.includes(sym) || (side !== 'buy' && side !== 'sell')) return c.json({ error: 'unknown asset or side' }, 400);
  try { roundAmount(usd, MAX_ROUND_USD); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  if (!requests.claim(requestReplayKey({ ...req, action: 'round' }), req.at + 5 * 60_000)) return c.json({ error: 'This signed request has already been used or expired. Sign a new request.' }, 409);
  const r = await runRound(dep, owner, { sym, side, usd }, 'owner');
  return c.json(json({ round: r }));
});

app.post('/autopilot', async (c) => {
  const req = (await c.req.json()) as Signed<{ on: boolean; usd: number }>;
  const owner = await verifyRequest({ ...req, action: 'autopilot' });
  let input;
  if (req.body.on && !KEEPER) return c.json({ error: 'Autopilot is unavailable while the keeper is off. Convene a round manually.' }, 409);
  try { input = autopilotInput(req.body, MAX_ROUND_USD); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  if (!requests.claim(requestReplayKey({ ...req, action: 'autopilot' }), req.at + 5 * 60_000)) return c.json({ error: 'This signed request has already been used or expired. Sign a new request.' }, 409);
  store.setAutopilot(owner, input.on, input.usd);
  return c.json({ ok: true, autopilot: store.autopilot()[owner.toLowerCase()] });
});

app.get('/agents', async (c) => {
  const dep = need();
  const seats = await Promise.all(
    SEATS.map(async (s, i) => {
      const agentId = BigInt(dep.seatAgentIds[i] ?? 0);
      const [summary, scored, avg, owner, uri] = await Promise.all([
        pub
          .readContract({ address: dep.reputationRegistry, abi: reputationAbi, functionName: 'getSummary', args: [agentId, [dep.council], 'tradeEdge', 'xorr-council'] })
          .catch(() => null),
        pub.readContract({ address: dep.council, abi: councilAbi, functionName: 'seatScored', args: [i] }),
        pub.readContract({ address: dep.council, abi: councilAbi, functionName: 'seatAverageEdge', args: [i] }),
        pub.readContract({ address: dep.identityRegistry, abi: identityAbi, functionName: 'ownerOf', args: [agentId] }).catch(() => null),
        pub.readContract({ address: dep.identityRegistry, abi: identityAbi, functionName: 'tokenURI', args: [agentId] }).catch(() => null),
      ]);
      return {
        ...s,
        seat: i,
        agentId: agentId.toString(),
        operator: owner,
        uri,
        reputation: summary ? { count: Number(summary[0]), value: Number(summary[1]), decimals: summary[2] } : null,
        scored: Number(scored),
        averageEdgeBps: Number(avg),
      };
    }),
  );
  return c.json(json({ identityRegistry: dep.identityRegistry, reputationRegistry: dep.reputationRegistry, council: dep.council, seats }));
});

// ─── Circle Gateway: fund from any chain ─────────────────────────────────────
const gw = gatewayFor(NETWORK);
const off = (name: keyof typeof FEATURES) => async (c: Context, next: Next) => {
  if (FEATURES[name]) return next();
  return c.json({ error: `${name} is switched off on this executor (FEATURE_${name.toUpperCase()}=on to enable).` }, 404);
};
app.use('/gateway/*', off('gateway'));
app.use('/cctp/*', off('cctp'));
async function gatewayApi(path: string, body: unknown) {
  const r = await fetch(`${gw.apiUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Circle Gateway ${r.status}: ${JSON.stringify(out).slice(0, 200)}`);
  return out;
}

app.get('/gateway/:owner', async (c) => {
  const owner = getAddress(c.req.param('owner'));
  const json = (await gatewayApi('/v1/balances', { token: 'USDC', sources: gw.sources.map((s) => ({ domain: s.domain, depositor: owner })) })) as {
    balances?: { domain: number; balance: string }[];
  };
  const balances = (json.balances ?? []).map((b) => ({ domain: b.domain, name: gw.sources.find((s) => s.domain === b.domain)?.name ?? `domain ${b.domain}`, balance: Number(b.balance) }));
  return c.json({ wallet: gw.wallet, minter: gw.minter, sources: gw.sources, balances, total: balances.reduce((t, b) => t + b.balance, 0) });
});

app.post('/gateway/intent', async (c) => {
  const b = (await c.req.json()) as { owner: string; sourceDomain: number; amountUnits: string };
  const owner = getAddress(b.owner);
  const salt = keccak256(toHex(`${owner}:${b.amountUnits}:${Date.now()}:${Math.random()}`));
  const intent = buildBurnIntent(gw, { sourceDomain: Number(b.sourceDomain), depositor: owner, recipient: owner, value: BigInt(b.amountUnits), salt });
  return c.json({ typedData: { domain: BURN_INTENT_DOMAIN, types: BURN_INTENT_TYPES, primaryType: 'BurnIntent', message: burnIntentToJson(intent) } });
});

app.post('/gateway/mint', async (c) => {
  const b = (await c.req.json()) as { burnIntent: unknown; signature: Hex };
  const intent = burnIntentFromJson(gw, b.burnIntent);
  const signer = await recoverTypedDataAddress({ domain: BURN_INTENT_DOMAIN, types: BURN_INTENT_TYPES, primaryType: 'BurnIntent', message: intent, signature: b.signature });
  if (signer.toLowerCase() !== `0x${intent.spec.sourceSigner.slice(26)}`.toLowerCase()) return c.json({ error: 'the burn intent is not signed by its depositor' }, 400);
  const res = (await gatewayApi('/v1/transfer', [{ burnIntent: burnIntentToJson(intent), signature: b.signature }])) as { attestation?: Hex; signature?: Hex };
  if (!res.attestation || !res.signature) return c.json({ error: 'Circle Gateway returned no attestation' }, 502);
  const r = await send(gw.minter, encodeFunctionData({ abi: GATEWAY_MINTER_ABI, functionName: 'gatewayMint', args: [res.attestation, res.signature] }), 'gatewayMint');
  return c.json({ mint: r.hash, ms: r.ms });
});

// ─── CCTP V2: withdraw to any chain (the app burns on Arc; Iris attests) ───
app.get('/cctp/:hash', async (c) => {
  const r = await fetch(`${CFG.irisApiUrl}/v2/messages/${CFG.cctpDomain}?transactionHash=${c.req.param('hash')}`);
  const out = await r.json().catch(() => ({}));
  return c.json(out, r.ok ? 200 : 404);
});

app.get('/keeper', (c) => c.json({ log: keeperLog.slice(0, 50) }));

app.get('/assets', (c) => c.json({ assets: ASSETS }));

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`XORR executor on ${NETWORK}${IS_FORK ? ' (local fork)' : ''} — http://localhost:${PORT}`);
    console.log(`  rpc ${RPC_URL}; deployment ${d ? d.delegation : 'NONE'}; executor ${executor?.address ?? 'NO KEY'}`);
  });
  if (d && KEEPER && executor) startKeeper(d);
}

export { app };
