import {submitCall,recoverCall, readCall} from "./durable-call";
/**
 * The owner's wallet in the app. Two kinds, both self-custodial — XORR never holds a key that can move your money:
 *
 *   - a browser wallet (MetaMask, Rabby…: anything EIP-1193), switched to Arc;
 *   - a device key: a fresh private key generated in this browser and kept in its local storage. Fine for a testnet
 *     or fork demo; the app says so, and offers to export it.
 *
 * Gas on Arc is USDC, so the one token the owner holds also pays for every transaction they sign.
 */
import {
  keccak256,createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { create } from 'zustand';
import type { Config } from './api';

const KEY = 'xorr.arc.deviceKey';

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const injected = (): Eip1193 | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ethereum?: Eip1193; xorrTestWallet?: Eip1193 };
  // Explicit local browser rehearsal: keys remain in the test signer process. Never enabled in a normal build.
  if (process.env.EXPO_PUBLIC_TEST_WALLET === 'on' && window.location.hostname === '127.0.0.1' && w.xorrTestWallet) return w.xorrTestWallet;
  return w.ethereum ?? null;
};

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function chainFor(cfg: Config): Chain {
  return defineChain({
    id: cfg.chainId,
    name: cfg.fork ? `${cfg.arc.name} (local fork)` : cfg.arc.name,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
    blockExplorers: { default: { name: 'Arc explorer', url: cfg.explorerUrl } },
  });
}

type WalletState = {
  address: Address | null;
  kind: 'device' | 'injected' | null;
  wallet: WalletClient | null;
  pub: PublicClient | null;
  connectDevice: (cfg: Config) => void;
  connectInjected: (cfg: Config) => Promise<void>;
  restore: (cfg: Config) => void;
  disconnect: () => void;
  exportKey: () => Hex | null;
};

export const useWallet = create<WalletState>((set, get) => ({
  address: null,
  kind: null,
  wallet: null,
  pub: null,
  restore(cfg) {
    const k = storage()?.getItem(KEY) as Hex | null;
    if (k && !get().address) get().connectDevice(cfg);
  },
  connectDevice(cfg) {
    const s = storage();
    let key = s?.getItem(KEY) as Hex | null;
    if (!key) {
      key = generatePrivateKey();
      s?.setItem(KEY, key);
    }
    const account = privateKeyToAccount(key);
    const chain = chainFor(cfg);
    set({
      address: account.address,
      kind: 'device',
      wallet: createWalletClient({ account, chain, transport: http(cfg.rpcUrl) }),
      pub: createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as PublicClient,
    });
  },
  async connectInjected(cfg) {
    if (process.env.EXPO_PUBLIC_TEST_WALLET === 'on' && cfg.chainId !== 5042002) throw new Error('Browser rehearsal is restricted to Arc testnet.');
    const eth = injected();
    if (!eth) throw new Error('No browser wallet found. Use a device key, or install MetaMask/Rabby.');
    const chain = chainFor(cfg);
    const [address] = (await eth.request({ method: 'eth_requestAccounts' })) as Address[];
    const hexId = `0x${cfg.chainId.toString(16)}`;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
    } catch {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hexId, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: [cfg.rpcUrl], blockExplorerUrls: [cfg.explorerUrl] }],
      });
    }
    set({
      address: address!,
      kind: 'injected',
      wallet: createWalletClient({ account: address!, chain, transport: custom(eth) }),
      pub: createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as PublicClient,
    });
  },
  disconnect() {
    set({ address: null, kind: null, wallet: null, pub: null });
  },
  exportKey() {
    return (storage()?.getItem(KEY) as Hex | null) ?? null;
  },
}));

/** Sign and send one transaction from the owner's wallet, and wait for Arc's (final) receipt. */
export async function sendTx(to: Address, data: Hex, value = 0n): Promise<{ hash: Hex; ms: number }> {
  const { wallet, pub, address } = useWallet.getState();
  if (!wallet || !pub || !address) throw new Error('Connect a wallet first.');
  const t0 = Date.now();
  const gas = await pub.estimateGas({ account: address, to, data, value });
  const store=storage();if(!store)throw Error('Durable transaction storage is unavailable. Submission is blocked.');
  const chainId=wallet.chain?.id;if(!chainId)throw Error('Wallet network is unavailable.');
  const context=async()=>{const now=useWallet.getState();const [addresses,network]=await Promise.all([wallet.getAddresses(),wallet.getChainId()]);if(now.address?.toLowerCase()!==address.toLowerCase()||now.wallet!==wallet||network!==chainId||!addresses.some(a=>a.toLowerCase()===address.toLowerCase()))throw Error('Wallet or network changed. No new transaction was requested.');};
  const limit=(gas*125n)/100n;const fees={maxFeePerGas:60_000_000_000n,maxPriorityFeePerGas:1_000_000_000n};
  const r=await submitCall(pub,store,{chainId,from:address,to,dataHash:keccak256(data),value:value.toString(),gas:limit.toString(),maxFeePerGas:fees.maxFeePerGas.toString(),maxPriorityFeePerGas:fees.maxPriorityFeePerGas.toString()},context,nonce=>wallet.sendTransaction({account:wallet.account??address,chain:wallet.chain,to,data,value,gas:limit,nonce,...fees}));
  return {hash:r.transactionHash,ms:Date.now()-t0};
}

export async function signMessage(message: string): Promise<Hex> {
  const { wallet, address } = useWallet.getState();
  if (!wallet || !address) throw new Error('Connect a wallet first.');
  return wallet.signMessage({ account: wallet.account ?? address, message });
}

/** Read-only original-call recovery; never signs or automatically resubmits. */
/** True when an owner transaction was journaled but never confirmed (the tab closed mid-send): only then is the recovery button shown. */
export function hasPendingOwnerTransaction(){const {wallet,address}=useWallet.getState();const store=storage();if(!wallet?.chain||!address||!store)return false;try{return !!readCall(store,wallet.chain.id,address);}catch{return false;}}
export async function recoverOwnerTransaction(){const {pub,wallet,address}=useWallet.getState();const store=storage();if(!pub||!wallet?.chain||!address||!store)throw Error('Restore the original wallet and durable storage.');return recoverCall(pub,store,wallet.chain.id,address);}
