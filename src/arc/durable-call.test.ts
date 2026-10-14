import { describe, it, expect, vi } from "vitest";
import { readMinedTransaction, readCall, recoverCall, saveCall, submitCall, waitForFinalized, type DurableCall } from "./durable-call";
import { keccak256, type PublicClient } from "viem";
describe("Arc finalized tag lag", () => {
  it("waits for the mined block without signing or resubmitting", async () => {
    const getBlock = vi
      .fn()
      .mockResolvedValueOnce({ number: 9n })
      .mockResolvedValueOnce({ number: 10n });
    const pause = vi.fn(async () => {});
    await waitForFinalized(
      { getBlock } as unknown as PublicClient,
      10n,
      3,
      pause,
    );
    expect(getBlock).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(getBlock).toHaveBeenCalledWith({ blockTag: "finalized" });
  });
  it("keeps an unconfirmed receipt pending if the RPC never catches up", async () => {
    const getBlock = vi.fn(async () => ({ number: 9n }));
    await expect(
      waitForFinalized(
        { getBlock } as unknown as PublicClient,
        10n,
        2,
        async () => {},
      ),
    ).rejects.toThrow("No new transaction was sent");
    expect(getBlock).toHaveBeenCalledTimes(2);
  });
});

describe('Arc receipt before transaction indexing', () => {
  const from = '0x1111111111111111111111111111111111111111' as const;
  const to = '0x2222222222222222222222222222222222222222' as const;
  const hash = `0x${'ab'.repeat(32)}` as const;
  const blockHash = `0x${'cd'.repeat(32)}` as const;
  const input = '0x1234' as const;
  const saved: DurableCall = {version:1,chainId:5042002,from,to,hash,dataHash:keccak256(input),value:'0',gas:'50000',nonce:4,maxFeePerGas:'60000000000',maxPriorityFeePerGas:'1000000000'};
  function fixture() {
    const entries = new Map<string,string>();
    const store = {getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v);},removeItem:vi.fn((k:string)=>{entries.delete(k);})};
    const tx = {hash,from,to,input,value:0n,gas:50000n,nonce:4,maxFeePerGas:60000000000n,maxPriorityFeePerGas:1000000000n,blockHash,blockNumber:10n};
    const receipt = {transactionHash:hash,from,to,blockHash,blockNumber:10n,status:'success'};
    const rpc = {getChainId:vi.fn(async()=>5042002),getTransactionCount:vi.fn(async()=>4),waitForTransactionReceipt:vi.fn(async()=>receipt),getTransactionReceipt:vi.fn(async()=>receipt),getTransaction:vi.fn(async()=>tx),getBlock:vi.fn(async()=>({number:10n,hash:blockHash}))};
    return {store,tx,receipt,rpc,client:rpc as unknown as PublicClient};
  }
  it('finishes an approval once lookup catches up, with exactly one submission', async () => {
    const f=fixture();
    f.rpc.getTransaction.mockResolvedValueOnce({...f.tx,blockHash:null,blockNumber:null} as unknown as typeof f.tx);
    const submit=vi.fn(async()=>hash);
    const {version: _version,nonce: _nonce,hash: _hash,...intent}=saved;
    await expect(submitCall(f.client,f.store,intent,async()=>{},submit)).resolves.toEqual(f.receipt);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(f.rpc.getTransaction).toHaveBeenCalledTimes(2);
    expect(readCall(f.store,5042002,from)).toBeNull();
    expect(f.rpc.getBlock).toHaveBeenCalledWith({blockNumber:10n});
  });
  it('bounds pending lookup retries without submitting anything', async () => {
    const f=fixture();
    f.rpc.getTransaction.mockResolvedValue({...f.tx,blockHash:null,blockNumber:null} as unknown as typeof f.tx);
    saveCall(f.store,saved);
    const pause=vi.fn(async()=>{});
    await expect(readMinedTransaction(f.client,hash,3,pause)).rejects.toThrow('No new transaction was sent');
    expect(f.rpc.getTransaction).toHaveBeenCalledTimes(3);
    expect(readCall(f.store,5042002,from)?.hash).toBe(hash);
    expect(f.store.removeItem).not.toHaveBeenCalled();
  });
  it.each([
    ['sender',{from:to}], ['calldata',{input:'0x5678'}], ['value',{value:1n}], ['gas',{gas:49999n}],
    ['nonce',{nonce:5}], ['maxFeePerGas',{maxFeePerGas:40000000000n}],
    ['maxPriorityFeePerGas',{maxPriorityFeePerGas:0n}], ['receiptBlock',{blockHash:hash}],
    ['receiptBlock',{blockNumber:11n}],
  ])('keeps the journal when %s differs', async (field, patch) => {
    const f=fixture();
    f.rpc.getTransaction.mockResolvedValue({...f.tx,...patch} as typeof f.tx);
    saveCall(f.store,saved);
    await expect(recoverCall(f.client,f.store,5042002,from)).rejects.toThrow(String(field));
    expect(f.store.removeItem).not.toHaveBeenCalled();
  });
  it('still refuses a noncanonical receipt block', async () => {
    const f=fixture();
    f.rpc.getBlock.mockResolvedValue({number:10n,hash});
    saveCall(f.store,saved);
    await expect(recoverCall(f.client,f.store,5042002,from)).rejects.toThrow('not canonical');
    expect(f.store.removeItem).not.toHaveBeenCalled();
  });
});
