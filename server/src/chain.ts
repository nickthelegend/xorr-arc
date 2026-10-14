/**
 * Arc from the executor: clients, the executor's key, sending with Arc's fee rules, and Arc's Memo.
 *
 * Gas is USDC. Arc's mempool refuses a maxFeePerGas under 20 gwei, so every send carries at least that; Arc charges
 * gas used, so limits get a 25% margin at no cost. Finality is deterministic and sub-second: a receipt is final.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  defineChain,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  stringToBytes,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { delegationAbi, memoAbi } from './abis.js';
import { CFG, EXECUTOR_KEY, RPC_URL } from './env.js';

export const arcChain = defineChain({
  id: CFG.chainId,
  name: CFG.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Arcscan', url: CFG.explorerUrl } },
});

export const pub = createPublicClient({ chain: arcChain, transport: http(RPC_URL, { retryCount: 4, retryDelay: 600 }) });
export const executor = EXECUTOR_KEY ? privateKeyToAccount(EXECUTOR_KEY) : null;
export const wallet = executor
  ? createWalletClient({ account: executor, chain: arcChain, transport: http(RPC_URL, { retryCount: 2 }) })
  : null;

const MIN_FEE = 20_000_000_000n; // Arc's 20 gwei maxFeePerGas floor

let budgetUsed = 0n;
const txBudget = process.env.XORR_TX_BUDGET_USDC ? BigInt(Math.floor(Number(process.env.XORR_TX_BUDGET_USDC) * 1e6)) * 10n ** 12n : null;
let nonceLock: Promise<unknown> = Promise.resolve();

/** Send one transaction from the executor, estimated, fee-floored, and wait for its (final) receipt. */
export async function send(to: Address, data: Hex, label: string): Promise<{ hash: Hex; gasUsed: bigint; ms: number }> {
  if (!wallet || !executor) throw new Error('No executor key: set XORR_EXECUTOR_KEY.');
  const run = async () => {
    const t0 = Date.now();
    const gas = await pub.estimateGas({ account: executor.address, to, data });
    const fees = await pub.estimateFeesPerGas().catch(() => ({ maxFeePerGas: MIN_FEE, maxPriorityFeePerGas: 1_000_000_000n }));
    const maxFeePerGas = (fees.maxFeePerGas ?? MIN_FEE) < MIN_FEE ? MIN_FEE * 2n : (fees.maxFeePerGas ?? MIN_FEE) * 2n;
    if (txBudget !== null) {
      const ceiling = (gas * 125n / 100n) * maxFeePerGas;
      if (budgetUsed + ceiling > txBudget) throw new Error('Executor rehearsal gas budget reached');
      budgetUsed += ceiling; // Conservative reservation, including uncertain broadcasts.
    }
    const hash = await wallet.sendTransaction({
      to,
      data,
      gas: (gas * 125n) / 100n,
      maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000_000n,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash, pollingInterval: 250 });
    if (receipt.status !== 'success') throw new Error(`${label} reverted on chain (${hash})`);
    return { hash, gasUsed: receipt.gasUsed, ms: Date.now() - t0 };
  };
  const p = nonceLock.then(run, run);
  nonceLock = p.catch(() => undefined);
  return p;
}

// ─── Arc Memo ────────────────────────────────────────────────────────────────

/**
 * Arc's Memo contract calls `target` AS the transaction's EOA sender (the CallFrom precompile) and emits
 * `Memo(sender, target, callDataHash, memoId, memo, memoIndex)`. XORR sends every agent trade through it with the
 * council decision id as `memoId`, so anyone can find the round behind a trade with one `eth_getLogs`.
 *
 * Whether the node executes CallFrom is probed, not assumed: an `eth_call` of Memo wrapping a USDC transfer that must
 * fail as its caller. A CallFailed(bytes) revert carrying the inner revert proves CallFrom ran. Where it doesn't (some
 * forks), trades go out as plain calls and say so.
 */
const MEMO_CALL_FAILED = '0xed1966a2';
let memoProbe: { at: number; live: Promise<boolean> } | null = null;

export function memoLine(parts: string[]): string {
  return parts.join(' ').slice(0, 160);
}

export function wrapInMemo(target: Address, data: Hex, memoId: Hex, line: string): { to: Address; data: Hex } {
  return {
    to: CFG.memo,
    data: encodeFunctionData({ abi: memoAbi, functionName: 'memo', args: [target, data, memoId, toHex(stringToBytes(line))] }),
  };
}

function revertData(e: unknown): string | null {
  let found: string | null = null;
  const visit = (x: unknown, depth: number) => {
    if (!x || depth > 8 || found) return;
    const d = (x as { data?: unknown }).data;
    if (typeof d === 'string' && d.startsWith('0x')) found = d;
    else if (d && typeof d === 'object' && typeof (d as { data?: unknown }).data === 'string') found = (d as { data: string }).data;
    visit((x as { cause?: unknown }).cause, depth + 1);
  };
  visit(e, 0);
  if (!found) {
    const m = /(0xed1966a2[0-9a-fA-F]*)/.exec(String((e as Error)?.message ?? ''));
    if (m?.[1]) found = m[1];
  }
  return found;
}

export function memoLive(): Promise<boolean> {
  if (memoProbe && Date.now() - memoProbe.at < 10 * 60_000) return memoProbe.live;
  const transfer = encodeFunctionData({
    abi: parseAbi(['function transfer(address to, uint256 value) returns (bool)']),
    functionName: 'transfer',
    args: ['0x0000000000000000000000000000000000000001', 10n ** 15n],
  });
  const w = wrapInMemo(CFG.usdc, transfer, keccak256(stringToBytes('xorr:probe')), 'probe');
  const live = pub
    .call({ account: '0x000000000000000000000000000000000000dEaD', to: w.to, data: w.data })
    .then(() => false)
    .catch((e: unknown) => {
      const d = revertData(e);
      if (!d) {
        memoProbe = null;
        return false;
      }
      return d.toLowerCase().startsWith(MEMO_CALL_FAILED) && d.length > 10 + 128;
    });
  memoProbe = { at: Date.now(), live };
  return live;
}

// ─── Errors, in words ────────────────────────────────────────────────────────

export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName) return `${revert.data.errorName}(${(revert.data.args ?? []).map(String).join(', ')})`;
    let d = revertData(e);
    if (d?.toLowerCase().startsWith(MEMO_CALL_FAILED)) {
      // Memo wraps the target's revert in CallFailed(bytes): unwrap it to the delegation's own error.
      try {
        const inner = decodeErrorResult({ abi: memoAbi as Abi, data: d as Hex });
        d = (inner.args?.[0] as string) ?? d;
      } catch {
        /* keep the wrapper */
      }
    }
    if (d) {
      try {
        const r = decodeErrorResult({ abi: delegationAbi as Abi, data: d as Hex });
        return `${r.errorName}(${(r.args ?? []).map(String).join(', ')})`;
      } catch {
        /* not ours */
      }
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}
