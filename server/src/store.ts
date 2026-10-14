/**
 * The executor's own record: council rounds (inputs, ballots, decision, transactions) and owners on autopilot.
 * A JSON file per network — small, inspectable, and never the source of truth for limits or balances, which are always
 * read from Arc. Every round's decision and fill are also on chain (XorrCouncil, XorrDelegation, Arc Memo).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Address, Hex } from 'viem';
import type { Ballot, Decision, RoundInputs } from './council.js';
import { DATA_DIR, IS_FORK, NETWORK } from './env.js';

export type RoundRecord = {
  id: Hex;
  owner: Address;
  createdAt: number;
  trigger: 'owner' | 'autopilot';
  inputs: RoundInputs;
  ballots: Ballot[];
  decision: Decision;
  summary: string;
  record?: { hash: Hex; ms: number } | { error: string };
  trade?:
    | {
        hash: Hex;
        ms: number;
        gasUsed: string;
        memo: { tagged: boolean; line: string };
        amountIn: string;
        received: string | null;
        floor: string;
        venue: string;
      }
    | { error: string };
  maintenance?: import('./repeg.js').Repeg;
  settlement?: { hash: Hex; edgeBps: number } | { error: string };
};

type Db = { repeg?: { day: number; usdc: string }; rounds: RoundRecord[]; autopilot: Record<string, { on: boolean; usd: number; since: number }> };

const file = resolve(DATA_DIR, `${NETWORK}${IS_FORK ? '-fork' : ''}.json`);
let db: Db = { rounds: [], autopilot: {} };
if (existsSync(file)) db = JSON.parse(readFileSync(file, 'utf8')) as Db;

function save() {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  renameSync(tmp, file);
}

export const store = {
  reserveRepegUsdc(amount: bigint) {
    const day = Math.floor(Date.now() / 86400000);
    const spent = db.repeg?.day === day ? BigInt(db.repeg.usdc) : 0n;
    if (spent + amount > 250_000n) throw new Error('Daily 0.25 USDC pool maintenance budget reached');
    db.repeg = { day, usdc: String(spent + amount) };
    save();
  },
  add(r: RoundRecord) {
    db.rounds.unshift(r);
    if (db.rounds.length > 2_000) db.rounds.length = 2_000;
    save();
  },
  update(id: Hex, patch: Partial<RoundRecord>) {
    const r = db.rounds.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    save();
  },
  get: (id: string) => db.rounds.find((x) => x.id.toLowerCase() === id.toLowerCase()) ?? null,
  byOwner: (owner: string) => db.rounds.filter((x) => x.owner.toLowerCase() === owner.toLowerCase()),
  all: () => db.rounds,
  autopilot: () => db.autopilot,
  setAutopilot(owner: Address, on: boolean, usd: number) {
    db.autopilot[owner.toLowerCase()] = { on, usd, since: Date.now() };
    save();
  },
};
