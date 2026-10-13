/**
 * XORR's main flow, end to end, with real transactions — against a local Arc fork (scripts/arc-fork.sh) or, with a
 * funded owner key, Arc testnet. The owner side signs here exactly as the app does in the browser.
 *
 *   XORR_API=http://localhost:9120 ARC_RPC_URL=http://127.0.0.1:9110 OWNER_KEY_FILE=.fork/keys.env npx tsx scripts/e2e.ts
 *
 * 1  owner approves USDC (and the assets, for closes) to XorrDelegation
 * 2  owner grants the executor: $40/day, 7 days, 1% slippage, the venue — and makes the CCIP stop receiver a guardian
 * 3  council round: buy cirBTC $10 → approved → filled on Uniswap through XorrDelegation, tagged with Arc Memo
 * 4  council round: buy EURC $10 (FX desk) → filled
 * 5  council round: buy cirBTC $25 → the Risk Keeper vetoes it (over what is left of today's cap) — nothing traded
 * 6  a raw spend over the cap, sent straight to the contract → mined revert DailyCapExceeded
 * 7  council round: sell the cirBTC back to USDC (closePosition, outside the cap)
 * 8  fork only: one hour passes; the keeper settles the rounds against Chainlink → ERC-8004 reputation per seat
 * 9  owner pulls the kill switch (revoke) → the next round is vetoed
 * 10 a raw spend straight to the contract after the revoke → PolicyRevoked
 *
 * On Arc TESTNET (live: a real network, not a fork) the same loop runs in pennies against XORR's own ~5 USDC Uniswap v2
 * pools (xWETH): $0.20/day cap, 2% slippage, a $0.04 buy, a vetoed over-cap round, a mined over-cap revert and a mined
 * price-floor revert sent from the agent's own key (XORR_EXECUTOR_KEY, optional), then revoke. Use scripts/e2e-testnet.mjs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  maxUint256,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { delegationAbi, erc20Abi, swapRouter02Abi, v2RouterAbi } from '../src/abis.js';
import { requestMessage } from '../src/auth.js';

const ROOT = resolve(import.meta.dirname, '../..');
const API = process.env.XORR_API ?? 'http://localhost:9120';
const RPC = process.env.ARC_RPC_URL ?? 'http://127.0.0.1:9110';
const keyText = readFileSync(resolve(ROOT, process.env.OWNER_KEY_FILE ?? '.fork/keys.env'), 'utf8');
const ownerKey = (process.env.OWNER_KEY ?? /^(?:FORK_OWNER_KEY|OWNER_KEY)=(0x[0-9a-fA-F]{64})/m.exec(keyText)?.[1]) as Hex;
const account = privateKeyToAccount(ownerKey);

const results: { step: string; ok: boolean; detail: string }[] = [];
const ok = (step: string, detail: string) => {
  results.push({ step, ok: true, detail });
  console.log(`✔ ${step} — ${detail}`);
};
const fail = (step: string, detail: string) => {
  results.push({ step, ok: false, detail });
  console.log(`✘ ${step} — ${detail}`);
};

async function main() {
  const config = await (await fetch(`${API}/config`)).json();
  const d = config.deployment;
  const chain = defineChain({ id: config.chainId, name: 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const pub = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const fork = !!config.fork;
  const live = !fork && config.network === 'arc-testnet';
  const explorer: string = config.explorerUrl;
  const link = (h: string) => (live ? `${explorer}/tx/${h}` : h);
  const SYM = live ? 'WETH' : 'CBTC'; // the testnet's deepest XORR pool; the mainnet run trades cirBTC
  const LABEL = live ? 'xWETH' : 'cirBTC';
  let CAP = live ? 60_000n : 40_000_000n; // USDC units (6 dec)
  const SLIP = live ? 200 : 100;
  const days = live ? 1 : 7;
  const owner = account.address;
  const agent = getAddress(config.executor);
  console.log(`XORR e2e on ${config.network}${fork ? ' (local fork)' : ''}; owner ${owner}; agent ${agent}; Memo ${config.memoLive ? 'live' : 'not live'}`);
  const txs: Hex[] = [];
  const tx = async (to: Address, data: Hex, label: string) => {
    const hash = await wallet.sendTransaction({ to, data, maxFeePerGas: 60_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n });
    const r = await pub.waitForTransactionReceipt({ hash });
    txs.push(hash);
    if (r.status !== 'success') throw new Error(`${label} reverted ${hash}`);
    return { hash, gasUsed: r.gasUsed };
  };
  const signed = async (action: string, body: unknown) => {
    const at = Date.now();
    const signature = await account.signMessage({ message: requestMessage(action, owner, body, at) });
    const res = await fetch(`${API}/${action === 'round' ? 'rounds' : action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner, body, at, signature }) });
    return res.json();
  };
  const round = async (sym: string, side: 'buy' | 'sell', usd: number) => (await signed('round', { sym, side, usd })).round;

  // 1 approvals
  const toApprove = (live ? [d.usdc, d.weth] : [d.usdc, d.cbtc, d.eurc, d.weth]) as Address[];
  for (const t of toApprove) {
    await tx(t, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [d.delegation, maxUint256] }), 'approve');
  }
  ok('1 approve', live ? 'USDC and xWETH approved to XorrDelegation' : 'USDC, cirBTC, EURC, WETH approved to XorrDelegation');

  // 2 grant + guardian. Live: the day's spend survives a re-grant, so a re-run the same UTC day grants spent + $0.06.
  if (live) {
    const spent = await pub.readContract({ address: d.delegation, abi: delegationAbi, functionName: 'spentTodayBy', args: [owner, agent] });
    CAP = spent + 60_000n;
  }
  const expires = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
  const g = await tx(d.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'grant', args: [agent, CAP, expires, SLIP, [d.venue]] }), 'grant');
  const gd = await tx(d.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'setGuardian', args: [d.stopReceiver, true] }), 'guardian');
  ok('2 grant', `$${formatUnits(CAP, 6)}/day, ${days} day(s), ${SLIP / 100}% slippage, venue ${d.venue} (${link(g.hash)}); CCIP stop receiver is a guardian (${link(gd.hash)})`);

  const sellBack = async (step: string, usd: number) => {
    const r = await round(SYM, 'sell', usd);
    if (r.decision === 'approved' && r.trade?.hash) ok(`${step} sell ${LABEL}`, `${r.summary} ${link(r.trade.hash)}, received ${formatUnits(BigInt(r.trade.received), 6)} USDC`);
    else fail(`${step} sell ${LABEL}`, `${r.summary} ${JSON.stringify(r.trade ?? r.ballots.map((b: { vote: string; reason: string }) => `${b.vote}: ${b.reason}`))}`);
  };

  // 3 buy cirBTC
  const buyUsd = live ? 0.04 : 10;
  const r1 = await round(SYM, 'buy', buyUsd);
  if (r1.decision === 'approved' && r1.trade?.hash) {
    const rec = r1.record?.hash ? `; decision recorded ${link(r1.record.hash)}` : '';
    ok(`3 buy ${LABEL} $${buyUsd}`, `${r1.summary} ${link(r1.trade.hash)} in ${r1.trade.ms} ms, received ${r1.trade.received} base units, memo ${r1.trade.memo.tagged ? 'tagged' : 'not tagged'}${rec}`);
  } else fail(`3 buy ${LABEL} $${buyUsd}`, `${r1.summary} ${JSON.stringify(r1.trade ?? r1.ballots.map((b: { reason: string }) => b.reason))}`);

  // 4 buy EURC (the testnet has no seeded USDC/EURC pool: no testnet EURC to seed it with)
  if (live) {
    ok('4a buy EURC', 'not run on testnet: the USDC/EURC pool is not seeded (no testnet EURC); run on the mainnet fork');
    await sellBack('4b', 0.04); // closing restores the thin pool's price, and sits outside the daily cap by design
  } else {
    const r2 = await round('EURC', 'buy', 10);
    if (r2.decision === 'approved' && r2.trade?.hash) ok('4 buy EURC $10', `${r2.summary} ${r2.trade.hash}, received ${formatUnits(BigInt(r2.trade.received), 6)} EURC`);
    else fail('4 buy EURC $10', `${r2.summary} ${JSON.stringify(r2.trade ?? null)}`);
  }

  // 5 over the cap: vetoed by the Risk Keeper
  const overUsd = live ? 0.04 : 25; // live: $0.02 of the $0.06 cap is left
  const r3 = await round(SYM, 'buy', overUsd);
  if (r3.decision === 'vetoed' && !r3.trade) ok('5 over-cap round', `${r3.summary}${r3.record?.hash ? ` (the veto is on chain too: ${link(r3.record.hash)})` : ''}`);
  else fail('5 over-cap round', `${r3.decision}: ${r3.summary}`);

  // 6 a raw over-cap spend from the agent's own key is refused by the contract (fork: simulated as the agent; live: the
  //   agent's key sends it with a fixed gas limit so it is MINED and reverts, with a hash anyone can open)
  const ZERO32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
  const rawSpend = (usdUnits: bigint) => {
    const swap = d.venueKind === 'uniswap-v3'
      ? encodeFunctionData({ abi: swapRouter02Abi, functionName: 'exactInputSingle', args: [{ tokenIn: d.usdc, tokenOut: d.weth, fee: 3000, recipient: owner, amountIn: usdUnits, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] })
      : encodeFunctionData({ abi: v2RouterAbi, functionName: 'swapExactTokensForTokens', args: [usdUnits, 1n, [d.usdc, d.weth], owner, expires] });
    return [owner, d.venue, usdUnits, d.weth, 1n, ZERO32, swap] as const;
  };
  const agentKey = process.env.XORR_EXECUTOR_KEY as Hex | undefined;
  const agentWallet = agentKey ? createWalletClient({ account: privateKeyToAccount(agentKey), chain, transport: http(RPC) }) : null;
  /** Sent as the agent: returns the mined-revert hash (live) or the simulation's revert text (fork). */
  const refusedAsAgent = async (args: ReturnType<typeof rawSpend>): Promise<{ hash?: Hex; message: string } | null> => {
    const sim = (blockNumber?: bigint) => pub.simulateContract({ account: agent, address: d.delegation, abi: delegationAbi, functionName: 'spend', args: args as never, blockNumber });
    if (live && agentWallet) {
      const data = encodeFunctionData({ abi: delegationAbi, functionName: 'spend', args: args as never });
      const hash = await agentWallet.sendTransaction({ to: d.delegation, data, gas: 900_000n, maxFeePerGas: 60_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status === 'success') return null;
      // replay the reverted call at its block to read the reason
      const reason = await sim(r.blockNumber - 1n).then(() => 'reverted (reason not replayable)', (e) => String((e as Error).message));
      return { hash, message: reason };
    }
    try {
      await sim();
      return null;
    } catch (e) {
      return { message: String((e as Error).message) };
    }
  };
  const over = await refusedAsAgent(rawSpend(live ? 300_000n : 25_000_000n));
  if (over && /DailyCapExceeded/.test(over.message)) ok('6 raw over-cap spend', `XorrDelegation refuses: DailyCapExceeded${over.hash ? `, mined revert ${link(over.hash)}` : ''}`);
  else fail('6 raw over-cap spend', over ? over.message.slice(0, 200) : 'the contract accepted it');

  // 6b price floor: the owner tightens slippage to 0.3% (a second grant, same agent); a $0.05 buy in XORR's 5 USDC pool moves its
  //    price ~1% + the 0.3% fee, so the contract refuses the fill against Chainlink's floor whatever minOut the agent passes
  if (live) {
    const g2 = await tx(d.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'grant', args: [agent, CAP + 140_000n, expires, 30, [d.venue]] }), 'regrant');
    const floor = await refusedAsAgent(rawSpend(50_000n));
    if (floor && /BelowOracleFloor/.test(floor.message)) ok('6b price floor', `owner tightens slippage to 0.3% (${link(g2.hash)}); XorrDelegation refuses a $0.05 fill below Chainlink's price less 0.3%: BelowOracleFloor${floor.hash ? `, mined revert ${link(floor.hash)}` : ''}`);
    else fail('6b price floor', floor ? floor.message.slice(0, 200) : 'the contract accepted a fill below the floor');
  }

  // 7 sell the cirBTC back (live: done as 4b)
  if (!live) await sellBack('7', 9.5);

  // 8 settle (fork: jump an hour) → ERC-8004 reputation
  if (fork) {
    await pub.request({ method: 'evm_increaseTime' as never, params: [3700] as never });
    await pub.request({ method: 'evm_mine' as never, params: [] as never });
    // fork: Chainlink's rounds don't move on a fork; nudge nothing — settle on the real (frozen) answers.
    const deadline = Date.now() + 120_000;
    let settled = 0;
    while (Date.now() < deadline) {
      const rows = (await (await fetch(`${API}/rounds?owner=${owner}`)).json()).rounds as { settlement?: { edgeBps?: number; error?: string } }[];
      settled = rows.filter((r) => r.settlement && r.settlement.edgeBps !== undefined).length;
      if (settled >= 3) break;
      await new Promise((r) => setTimeout(r, 4000));
    }
    const agents = await (await fetch(`${API}/agents`)).json();
    const withRep = agents.seats.filter((s: { reputation: { count: number } | null }) => (s.reputation?.count ?? 0) > 0);
    if (settled >= 3 && withRep.length > 0) ok('8 settle → ERC-8004', `${settled} rounds settled by the keeper; ${withRep.length} seats now have reputation on the ERC-8004 Reputation Registry (${withRep.map((s: { name: string; reputation: { count: number; value: number } }) => `${s.name} n=${s.reputation.count} Σ=${s.reputation.value / 100}%`).join(', ')})`);
    else fail('8 settle → ERC-8004', `settled ${settled}, seats with reputation ${withRep.length}`);
  }

  if (live) {
    const h = Number(await pub.readContract({ address: d.council, abi: [{ type: 'function', name: 'HORIZON', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const, functionName: 'HORIZON' }));
    ok('8 settle → ERC-8004', `deferred: a decision can be settled ${Math.round(h / 60)} min after it was recorded or filled; the keeper (or anyone) settles it later, see the bottom of docs/E2E-TESTNET.md for the outcome`);
  }

  // 9 kill switch
  const k = await tx(d.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'revoke', args: [] }), 'revoke');
  const r5 = live ? await round('WETH', 'buy', 0.04) : await round('EURC', 'buy', 5);
  const stoppedBy = r5.ballots.find((b: { seat: string; vote: string }) => b.seat === 'risk-keeper' && b.vote === 'veto');
  if (r5.decision === 'vetoed' && stoppedBy && /kill switch/.test(stoppedBy.reason)) ok('9 kill switch', `revoke ${link(k.hash)}; next round: Risk Keeper: "${stoppedBy.reason}" (decision ${r5.decision}, no trade sent)`);
  else fail('9 kill switch', `${r5.decision}: ${r5.summary}`);

  // 10 after the revoke, even a raw spend straight to the contract (bypassing the council) is refused on chain
  const after = await refusedAsAgent(rawSpend(live ? 40_000n : 5_000_000n));
  if (after && /PolicyRevoked/.test(after.message)) ok('10 raw spend after revoke', `XorrDelegation refuses: PolicyRevoked${after.hash ? `, mined revert ${link(after.hash)}` : ''}`);
  else fail('10 raw spend after revoke', after ? after.message.slice(0, 200) : 'the contract accepted it');

  const bal = await (await fetch(`${API}/account/${owner}`)).json();
  console.log(`\nowner now: ${bal.balances.tokens.map((t: { label: string; amount: number }) => `${t.amount.toFixed(6)} ${t.label}`).join(', ')}; gas left ${bal.gasUsdc.toFixed(4)} USDC`);
  console.log(`owner transactions: ${txs.length}; passed ${results.filter((r) => r.ok).length}/${results.length}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
