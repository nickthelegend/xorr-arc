import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), send: vi.fn(), network: 'arc-testnet', chain: vi.fn(), quota: vi.fn(), fresh: true }));
vi.mock('./chain.js', () => ({ executor: { address: '0x0000000000000000000000000000000000000003' }, pub: { readContract: mocks.read, getChainId: mocks.chain, getBalance: async () => 10n ** 18n }, send: mocks.send, explain: (e: Error) => e.message }));
vi.mock('./env.js', () => ({ get NETWORK() { return mocks.network; } }));
vi.mock('./market.js', () => ({ readFeed: async () => ({ fresh: mocks.fresh, price: 2500 }) }));
vi.mock('./store.js', () => ({ store: { reserveRepegUsdc: mocks.quota } }));
import { repegTestnet } from './repeg.js';
import type { XorrDeployment } from '../../shared/arc.js';
const d = { chainId: 5042002, mirrorFeeds: true, venueKind: 'uniswap-v2', usdc: '0x0000000000000000000000000000000000000001', weth: '0x0000000000000000000000000000000000000002', v2Factory: '0x0000000000000000000000000000000000000004' } as unknown as XorrDeployment;
beforeEach(() => {
  vi.clearAllMocks(); mocks.fresh = true; mocks.quota.mockReset(); mocks.network = 'arc-testnet'; mocks.chain.mockResolvedValue(5042002);
  mocks.send.mockResolvedValue({ hash: '0x1234' });
  mocks.read.mockImplementation(async ({functionName, address}) => {
    if (functionName === 'getPair') return '0x0000000000000000000000000000000000000005';
    if (functionName === 'token0') return d.usdc;
    if (functionName === 'token1') return d.weth;
    if (functionName === 'balanceOf') return address === d.usdc ? 5_040000n : 1984000000000000n;
  });
});
describe('testnet re-peg safety boundaries', () => {
  it('refuses mainnet runtime even with a testnet deployment', async () => {
    mocks.network = 'arc-mainnet'; await repegTestnet(d); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not re-peg against a stale mirror', async () => {
    mocks.fresh = false; expect((await repegTestnet(d)).note).toContain('stale'); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('refuses drift above 10 percent', async () => {
    const normal = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async args => args.functionName === 'balanceOf' && args.address === d.usdc ? 7_000000n : normal(args));
    expect((await repegTestnet(d)).note).toContain('10%'); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('respects the persisted daily budget before moving USDC', async () => {
    const normal = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async args => args.functionName === 'balanceOf' && args.address === d.usdc ? 4_900000n : normal(args));
    mocks.quota.mockImplementation(() => { throw Error('Daily budget reached'); });
    expect((await repegTestnet(d)).note).toContain('Daily budget'); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('preserves donation evidence when sync fails', async () => {
    mocks.send.mockResolvedValueOnce({ hash: '0x1234' }).mockRejectedValueOnce(Error('sync failed'));
    const r = await repegTestnet(d); expect(r.status).toBe('unavailable'); expect(r.hashes).toEqual(['0x1234']);
  });

  it.each([{...d, chainId: 5042}, {...d, venueKind: 'uniswap-v3'}, {...d, mirrorFeeds: false}])('never touches a mainnet or non-mirror deployment', async dep => {
    expect((await repegTestnet(dep as XorrDeployment)).status).toBe('unavailable'); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('checks RPC chain identity before sending', async () => {
    mocks.chain.mockResolvedValue(5042); await repegTestnet(d); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('returns transaction evidence for token donation and sync', async () => {
    const r = await repegTestnet(d); expect(r.status).toBe('repegged'); expect(r.hashes).toHaveLength(2); expect(mocks.quota).not.toHaveBeenCalled();
  });
  it('refuses funding above the per-round bound', async () => {
    const normal = mocks.read.getMockImplementation()!;
    mocks.read.mockImplementation(async args => args.functionName === 'balanceOf' && args.address === d.usdc ? 4_700000n : normal(args));
    const r = await repegTestnet(d); expect(r.note).toContain('0.10'); expect(mocks.send).not.toHaveBeenCalled();
  });
});
