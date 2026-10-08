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
import { Hono } from 'hono';
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
import { verifyRequest } from './auth.js';
import { executor, explain, memoLive, pub } from './chain.js';
import { ALLOWED_ORIGINS, CFG, DEPLOYMENT, DEPLOYMENT_PATH, IS_FORK, KEEPER, MAX_ROUND_USD, NETWORK, PORT, RPC_URL } from './env.js';
import { runRound } from './executor.js';
import { keeperLog, startKeeper } from './keeper.js';
import { balances, cirBtcReserve, quote, readFeed } from './market.js';
import { store } from './store.js';

const app = new Hono();
app.use('*', cors({ origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS }));
app.onError((e, c) => c.json({ error: explain(e) }, 500));

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
      block,
      seats: SEATS,
    }),
  );
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
          const q = await quote(dep, 'USDC', sym, 10_000_000n);
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
  return c.json(json({ network: NETWORK, mirror: dep.mirrorFeeds, rows, cirBtcReserve: await cirBtcReserve(), readAt: Date.now() }));
});

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
  const owner = await verifyRequest({ action: 'round', ...req });
  const { sym, side, usd } = req.body;
  if (!TRADABLE.includes(sym) || (side !== 'buy' && side !== 'sell')) return c.json({ error: 'unknown asset or side' }, 400);
  if (!(usd > 0) || usd > MAX_ROUND_USD) return c.json({ error: `a round is between $0 and $${MAX_ROUND_USD}` }, 400);
  const r = await runRound(dep, owner, { sym, side, usd }, 'owner');
  return c.json(json({ round: r }));
});

app.post('/autopilot', async (c) => {
  const req = (await c.req.json()) as Signed<{ on: boolean; usd: number }>;
  const owner = await verifyRequest({ action: 'autopilot', ...req });
  const usd = Math.min(Math.max(1, Number(req.body.usd) || 5), MAX_ROUND_USD);
  store.setAutopilot(owner, !!req.body.on, usd);
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

app.get('/keeper', (c) => c.json({ log: keeperLog.slice(0, 50) }));

app.get('/assets', (c) => c.json({ assets: ASSETS }));

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`XORR executor on ${NETWORK}${IS_FORK ? ' (local fork)' : ''} — http://localhost:${PORT}`);
    console.log(`  rpc ${RPC_URL}; deployment ${d ? d.delegation : 'NONE'}; executor ${executor?.address ?? 'NO KEY'}`);
  });
  if (d && KEEPER && executor) startKeeper(d);
}

export { app };
