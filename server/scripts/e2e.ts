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
  for (const t of [d.usdc, d.cbtc, d.eurc, d.weth] as Address[]) {
    await tx(t, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [d.delegation, maxUint256] }), 'approve');
  }
  ok('1 approve', 'USDC, cirBTC, EURC, WETH approved to XorrDelegation');

  // 2 grant + guardian
  const expires = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400);
  const g = await tx(d.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'grant', args: [agent, 40_000_000n, expires, 100, [d.venue]] }), 'grant');
  await tx(d.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'setGuardian', args: [d.stopReceiver, true] }), 'guardian');
  ok('2 grant', `$40/day, 7 days, 1% slippage, venue ${d.venue} (${g.hash}); CCIP stop receiver is a guardian`);

  // 3 buy cirBTC
  const r1 = await round('CBTC', 'buy', 10);
  if (r1.decision === 'approved' && r1.trade?.hash) ok('3 buy cirBTC $10', `${r1.summary} ${r1.trade.hash} in ${r1.trade.ms} ms, received ${r1.trade.received} sats, memo ${r1.trade.memo.tagged ? 'tagged' : 'not tagged'}`);
  else fail('3 buy cirBTC $10', `${r1.summary} ${JSON.stringify(r1.trade ?? r1.ballots.map((b: { reason: string }) => b.reason))}`);

  // 4 buy EURC
  const r2 = await round('EURC', 'buy', 10);
  if (r2.decision === 'approved' && r2.trade?.hash) ok('4 buy EURC $10', `${r2.summary} ${r2.trade.hash}, received ${formatUnits(BigInt(r2.trade.received), 6)} EURC`);
  else fail('4 buy EURC $10', `${r2.summary} ${JSON.stringify(r2.trade ?? null)}`);

  // 5 over the cap: vetoed by the Risk Keeper
  const r3 = await round('CBTC', 'buy', 25);
  if (r3.decision === 'vetoed' && !r3.trade) ok('5 over-cap round', r3.summary);
  else fail('5 over-cap round', `${r3.decision}: ${r3.summary}`);

  // 6 a raw over-cap spend from the agent's own key is refused by the contract (simulated as the agent)
  try {
    const data = d.venueKind === 'uniswap-v3'
      ? encodeFunctionData({ abi: swapRouter02Abi, functionName: 'exactInputSingle', args: [{ tokenIn: d.usdc, tokenOut: d.weth, fee: 3000, recipient: owner, amountIn: 25_000_000n, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] })
      : encodeFunctionData({ abi: v2RouterAbi, functionName: 'swapExactTokensForTokens', args: [25_000_000n, 1n, [d.usdc, d.weth], owner, expires] });
    await pub.simulateContract({ account: agent, address: d.delegation, abi: delegationAbi, functionName: 'spend', args: [owner, d.venue, 25_000_000n, d.weth, 1n, '0x0000000000000000000000000000000000000000000000000000000000000000', data] });
    fail('6 raw over-cap spend', 'the contract accepted it');
  } catch (e) {
    const m = String((e as Error).message);
    if (/DailyCapExceeded/.test(m)) ok('6 raw over-cap spend', 'XorrDelegation refuses: DailyCapExceeded(25000000, 20000000)');
    else fail('6 raw over-cap spend', m.slice(0, 200));
  }

  // 7 sell the cirBTC back
  const r4 = await round('CBTC', 'sell', 9.5);
  if (r4.decision === 'approved' && r4.trade?.hash) ok('7 sell cirBTC', `${r4.summary} ${r4.trade.hash}, received ${formatUnits(BigInt(r4.trade.received), 6)} USDC`);
  else fail('7 sell cirBTC', `${r4.summary} ${JSON.stringify(r4.trade ?? r4.ballots.map((b: { vote: string; reason: string }) => `${b.vote}: ${b.reason}`))}`);

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

  // 9 kill switch
  const k = await tx(d.delegation, encodeFunctionData({ abi: delegationAbi, functionName: 'revoke', args: [] }), 'revoke');
  const r5 = await round('EURC', 'buy', 5);
  if (r5.decision === 'vetoed') ok('9 kill switch', `revoke ${k.hash}; next round: ${r5.summary}`);
  else fail('9 kill switch', `${r5.decision}: ${r5.summary}`);

  // 10 after the revoke, even a raw $5 spend straight to the contract (bypassing the council) is refused on chain
  try {
    const data = d.venueKind === 'uniswap-v3'
      ? encodeFunctionData({ abi: swapRouter02Abi, functionName: 'exactInputSingle', args: [{ tokenIn: d.usdc, tokenOut: d.weth, fee: 3000, recipient: owner, amountIn: 5_000_000n, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] })
      : encodeFunctionData({ abi: v2RouterAbi, functionName: 'swapExactTokensForTokens', args: [5_000_000n, 1n, [d.usdc, d.weth], owner, expires] });
    await pub.simulateContract({ account: agent, address: d.delegation, abi: delegationAbi, functionName: 'spend', args: [owner, d.venue, 5_000_000n, d.weth, 1n, '0x0000000000000000000000000000000000000000000000000000000000000000', data] });
    fail('10 raw spend after revoke', 'the contract accepted it');
  } catch (e) {
    if (/PolicyRevoked/.test(String((e as Error).message))) ok('10 raw spend after revoke', 'XorrDelegation refuses: PolicyRevoked');
    else fail('10 raw spend after revoke', String((e as Error).message).slice(0, 200));
  }

  const bal = await (await fetch(`${API}/account/${owner}`)).json();
  console.log(`\nowner now: ${bal.balances.tokens.map((t: { label: string; amount: number }) => `${t.amount.toFixed(6)} ${t.label}`).join(', ')}; gas left ${bal.gasUsdc.toFixed(4)} USDC`);
  console.log(`owner transactions: ${txs.length}; passed ${results.filter((r) => r.ok).length}/${results.length}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
