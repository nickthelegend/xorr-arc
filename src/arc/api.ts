/**
 * The executor's API, from the app. Reads are plain GETs; anything that acts for the owner is signed by the owner's
 * wallet (the executor checks the signature and the on-chain permission — never a session).
 */
import { getAddress, type Address, type Hex } from 'viem';
import type { ArcConfig, SeatId, Sym, Vote, XorrDeployment } from '../../shared/arc';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:9120').replace(/\/$/, '');

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`);
  const body = await r.json();
  if (!r.ok) throw new Error(body?.error ?? `${r.status}`);
  return body as T;
}

export type Config = {
  network: 'arc-testnet' | 'arc-mainnet';
  fork: boolean;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  arc: ArcConfig;
  deployment: XorrDeployment | null;
  executor: Address | null;
  memoLive: boolean;
  maxRoundUsd: number;
  features: { gateway: boolean; cctp: boolean; usyc: boolean };
  block: string | null;
};

export type FeedRead = { price: number; updatedAt: number; ageSec: number; maxAgeSec: number; fresh: boolean; mirror: boolean; description: string; feed: Address };
export type MarketRow = {
  sym: Sym;
  label: string;
  token: Address;
  feed?: FeedRead;
  venue?: { venue: string; price: number; gapBps: number } | { error: string } | null;
  error?: string;
};
export type Markets = { network: string; mirror: boolean; probeUsd: number; rows: MarketRow[]; cirBtcReserve: { reserve: number; supply: number; ratio: number; ageSec: number } | { error: string }; readAt: number };

export type Account = {
  owner: Address;
  agent: Address;
  balances: { tokens: { sym: Sym; label: string; raw: string; amount: number }[]; usyc: number };
  gasUsdc: number;
  permission: {
    dailyCap: number;
    expiresAt: number;
    maxSlippageBps: number;
    revoked: boolean;
    stopped: boolean;
    remainingToday: number;
    spentToday: number;
    venues: Address[];
    granted: boolean;
  };
  guardian: { stopReceiver: Address; set: boolean };
  allowances: { sym: Sym; raw: string }[];
  autopilot: { on: boolean; usd: number };
  usyc: { entitled: boolean; priceUsdc: number | null; teller: Address } | { error: string };
};

export type Ballot = { seat: SeatId; vote: Vote; confidence: number; reason: string };
export type Round = {
  id: Hex;
  owner: Address;
  createdAt: number;
  trigger: 'owner' | 'autopilot';
  inputs: { proposal: { sym: Sym; label: string; side: 'buy' | 'sell'; usd: number }; price: { ok: boolean; chainlink?: number; fill?: number; gapBps?: number; venue?: string; mirror?: boolean; ageSec?: number; error?: string } };
  ballots: Ballot[];
  decision: 'approved' | 'rejected' | 'vetoed';
  summary: string;
  record?: { hash: Hex; ms: number } | { error: string };
  trade?: { hash: Hex; ms: number; gasUsed: string; memo: { tagged: boolean; line: string }; amountIn: string; received: string | null; floor: string; venue: string } | { error: string };
  settlement?: { hash: Hex; edgeBps: number } | { error: string };
};

export type AgentSeat = {
  id: SeatId;
  name: string;
  role: string;
  veto: boolean;
  seat: number;
  agentId: string;
  operator: Address | null;
  uri: string | null;
  reputation: { count: number; value: number; decimals: number } | null;
  scored: number;
  averageEdgeBps: number;
};

export const api = {
  config: () => get<Config>('/config'),
  markets: () => get<Markets>('/markets'),
  account: (owner: string) => get<Account>(`/account/${owner}`),
  rounds: (owner?: string) => get<{ rounds: Round[] }>(`/rounds${owner ? `?owner=${owner}` : ''}`),
  round: (id: string) => get<{ round: Round; onchain: unknown; memo: { tx: Hex; sender: Address; memoIndex: string }[] }>(`/rounds/${id}`),
  agents: () => get<{ identityRegistry: Address; reputationRegistry: Address; council: Address; seats: AgentSeat[] }>('/agents'),
  keeper: () => get<{ log: { at: number; line: string }[] }>('/keeper'),
};

/** The exact message the executor verifies (server/src/auth.ts). */
export function requestMessage(action: string, owner: string, body: unknown, at: number): string {
  return `XORR on Arc\naction: ${action}\nowner: ${getAddress(owner)}\nbody: ${JSON.stringify(body)}\nat: ${at}`;
}

export async function postSigned<T>(path: string, action: string, owner: Address, body: unknown, sign: (m: string) => Promise<Hex>): Promise<T> {
  const at = Date.now();
  const signature = await sign(requestMessage(action, owner, body, at));
  const r = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner, body, at, signature }) });
  const out = await r.json();
  if (!r.ok) throw new Error(out?.error ?? `${r.status}`);
  return out as T;
}
