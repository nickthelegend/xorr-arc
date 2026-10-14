import {
  isAddress,
  isHex,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
export type DurableCall = {
  version: 1;
  chainId: number;
  from: Address;
  to: Address;
  dataHash: Hex;
  value: string;
  gas: string;
  nonce: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  hash?: Hex;
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (chainId: number, from: Address) =>
  `arc:durable-call:v1:${chainId}:${from.toLowerCase()}`;
const busy = new Set<string>();
export function readCall(
  s: Store,
  chainId: number,
  from: Address,
): DurableCall | null {
  const raw = s.getItem(key(chainId, from));
  if (raw === null) return null;
  let p: DurableCall;
  try {
    p = JSON.parse(raw);
  } catch {
    throw Error(
      "The original transaction journal is unreadable. New submissions are blocked.",
    );
  }
  if (
    !p ||
    p.version !== 1 ||
    p.chainId !== chainId ||
    typeof p.from !== "string" ||
    p.from.toLowerCase() !== from.toLowerCase() ||
    ![p.from, p.to].every((a) => typeof a === "string" && isAddress(a)) ||
    !isHex(p.dataHash) ||
    p.dataHash.length !== 66 ||
    ![p.value, p.gas].every((n) => typeof n === "string" && /^\d+$/.test(n)) ||
    BigInt(p.gas) <= 0n ||
    !Number.isSafeInteger(p.nonce) ||
    p.nonce < 0 ||
    [p.maxFeePerGas, p.maxPriorityFeePerGas].some(
      (n) => n !== undefined && (typeof n !== "string" || !/^\d+$/.test(n)),
    ) ||
    (p.hash !== undefined && (!isHex(p.hash) || p.hash.length !== 66))
  )
    throw Error(
      "The original transaction journal is invalid. New submissions are blocked.",
    );
  return {
    version: 1,
    chainId: p.chainId,
    from: p.from,
    to: p.to,
    dataHash: p.dataHash,
    value: p.value,
    gas: p.gas,
    nonce: p.nonce,
    maxFeePerGas: p.maxFeePerGas,
    maxPriorityFeePerGas: p.maxPriorityFeePerGas,
    hash: p.hash,
  };
}
export function saveCall(s: Store, p: DurableCall) {
  const old = readCall(s, p.chainId, p.from);
  if (old) {
    for (const f of [
      "chainId",
      "from",
      "to",
      "dataHash",
      "value",
      "gas",
      "nonce",
      "maxFeePerGas",
      "maxPriorityFeePerGas",
    ] as const)
      if (old[f] !== p[f])
        throw Error("The original transaction call cannot be replaced.");
    if (old.hash && old.hash !== p.hash)
      throw Error("The original transaction hash cannot be replaced.");
  }
  const safe = readCall(
    { getItem: () => JSON.stringify(p), setItem() {}, removeItem() {} },
    p.chainId,
    p.from,
  )!;
  const raw = JSON.stringify(safe);
  s.setItem(key(p.chainId, p.from), raw);
  if (s.getItem(key(p.chainId, p.from)) !== raw)
    throw Error(
      "Transaction journal was not durably saved. Submission is blocked.",
    );
}
export function clearCall(s: Store, p: DurableCall) {
  const old = readCall(s, p.chainId, p.from);
  if (
    !old ||
    JSON.stringify(old) !==
      JSON.stringify(
        readCall(
          { getItem: () => JSON.stringify(p), setItem() {}, removeItem() {} },
          p.chainId,
          p.from,
        ),
      )
  )
    throw Error("Original transaction identity changed.");
  s.removeItem(key(p.chainId, p.from));
  if (readCall(s, p.chainId, p.from))
    throw Error("Original transaction journal could not be cleared.");
}
export async function recoverCall(
  client: PublicClient,
  s: Store,
  chainId: number,
  from: Address,
): Promise<TransactionReceipt> {
  const p = readCall(s, chainId, from);
  if (!p) throw Error("No original transaction is saved.");
  if (!p.hash)
    throw Error(
      "Original submission has no known hash. Genuine wallet/provider history is required; no new signature was requested.",
    );
  if ((await client.getChainId()) !== p.chainId)
    throw Error("Receipt RPC network differs from the original transaction.");
  const [r, tx] = await Promise.all([
    client.getTransactionReceipt({ hash: p.hash }),
    readMinedTransaction(client, p.hash),
  ]);
  const checks = {
    receiptHash: r.transactionHash.toLowerCase() === p.hash.toLowerCase(),
    transactionHash: tx.hash.toLowerCase() === p.hash.toLowerCase(),
    sender: tx.from.toLowerCase() === p.from.toLowerCase(),
    receiptSender: r.from.toLowerCase() === p.from.toLowerCase(),
    recipient: tx.to?.toLowerCase() === p.to.toLowerCase(),
    receiptRecipient: r.to?.toLowerCase() === p.to.toLowerCase(),
    calldata: keccak256(tx.input).toLowerCase() === p.dataHash.toLowerCase(),
    value: tx.value === BigInt(p.value),
    gas: tx.gas === BigInt(p.gas),
    nonce: tx.nonce === p.nonce,
    maxFeePerGas: p.maxFeePerGas === undefined || tx.maxFeePerGas === BigInt(p.maxFeePerGas),
    maxPriorityFeePerGas: p.maxPriorityFeePerGas === undefined || tx.maxPriorityFeePerGas === BigInt(p.maxPriorityFeePerGas),
    receiptBlock: tx.blockHash === r.blockHash && tx.blockNumber === r.blockNumber,
  };
  const mismatches = Object.entries(checks).filter(([, matches]) => !matches).map(([name]) => name);
  if (mismatches.length) throw Error(`Original transaction proof differs: ${mismatches.join(', ')}. Check the original transaction on Home.`);
  await waitForFinalized(client, r.blockNumber);
  const canonical = await client.getBlock({ blockNumber: r.blockNumber });
  if (canonical.hash !== r.blockHash)
    throw Error("Original receipt block is not canonical.");
  if (r.status !== "success" && r.status !== "reverted")
    throw Error("Original transaction status is unknown.");
  clearCall(s, p);
  if (r.status === "reverted")
    throw Error(`Original transaction reverted: ${p.hash}`);
  return r;
}
export async function submitCall(
  client: PublicClient,
  s: Store,
  input: Omit<DurableCall, "version" | "nonce" | "hash">,
  context: () => Promise<void>,
  submit: (nonce: number) => Promise<Hex>,
): Promise<TransactionReceipt> {
  const id = key(input.chainId, input.from);
  if (busy.has(id)) throw Error("Original transaction is still in progress.");
  busy.add(id);
  try {
    if (readCall(s, input.chainId, input.from))
      throw Error(
        "An original transaction is unresolved. Check its receipt before any new submission.",
      );
    await context();
    if ((await client.getChainId()) !== input.chainId)
      throw Error("RPC network changed.");
    const nonce = await client.getTransactionCount({
      address: input.from,
      blockTag: "pending",
    });
    await context();
    if (readCall(s, input.chainId, input.from))
      throw Error("Another transaction was saved while checking the wallet.");
    let p: DurableCall = { ...input, version: 1, nonce };
    saveCall(s, p);
    // Wallet sendTransaction may sign and submit internally: even a rejection is opaque after invocation.
    const hash = await submit(nonce);
    p = { ...p, hash };
    saveCall(s, p);
    await client.waitForTransactionReceipt({
      hash,
      timeout: 60000,
    });
    // Both transaction indexing and the finalized tag can trail a mined receipt on Arc.
    // Recovery waits for those reads, verifies the exact call and only then clears the journal.
    return await recoverCall(client, s, input.chainId, input.from);
  } finally {
    busy.delete(id);
  }
}

/** A receipt can be mined while Arc's transaction lookup still returns the pending transaction.
 * Retry only missing inclusion metadata. A different mined block or altered call still fails the proof below.
 * This is read-only: an indexing delay must never request another signature or send another approval.
 */
export async function readMinedTransaction(
  client: Pick<PublicClient, "getTransaction">,
  hash: Hex,
  tries = 30,
  pause = () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
) {
  for (let i = 0; i < tries; i++) {
    const tx = await client.getTransaction({ hash });
    if (tx.blockHash !== null && tx.blockNumber !== null) return tx;
    if (i + 1 < tries) await pause();
  }
  throw Error("Transaction receipt found; RPC transaction indexing is still pending. Check the unconfirmed transaction on Home. No new transaction was sent.");
}

export async function waitForFinalized(
  client: Pick<PublicClient, "getBlock">,
  block: bigint,
  tries = 30,
  pause = () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const final = await client.getBlock({ blockTag: "finalized" });
    if (final.number !== null && final.number >= block) return;
    if (i + 1 < tries) await pause();
  }
  throw Error(
    "Transaction mined; the RPC has not confirmed finality yet. Check the unconfirmed transaction on Home. No new transaction was sent.",
  );
}
