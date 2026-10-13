import { describe, expect, it } from 'vitest';
import { SELL_DUST_USD, convene, type RoundInputs } from './council';

const base = (over: Partial<RoundInputs> = {}): RoundInputs => ({
  proposal: { sym: 'WETH', label: 'xWETH', side: 'sell', usd: 0.04 },
  price: { ok: true, chainlink: 2500, ageSec: 600, maxAgeSec: 90_000, mirror: true, fill: 2505, venue: 'v2', gapBps: 20, maxGapBps: 150 },
  permission: { ok: true, dailyCapUsd: 0.1, remainingUsd: 0.02, expiresAt: 2_000_000_000, revoked: false, stopped: false, slippageBps: 200, venueAllowed: true },
  holding: { ok: true, assetUsd: 0.04 },
  trend: { ok: false, error: 'no history' },
  peg: { ok: true, usdc: 1, eurc: 1.12, eur: null, por: { ratio: 1 } },
  now: 1_900_000_000,
  ...over,
});

describe('council', () => {
  it('sells a small position: the dust floor is cents, not dollars', () => {
    expect(SELL_DUST_USD).toBeLessThan(0.04);
    expect(convene(base()).decision).toBe('approved');
  });
  it('vetoes dust and says what it is', () => {
    const r = convene(base({ holding: { ok: true, assetUsd: 0.005 } }));
    expect(r.decision).toBe('vetoed');
    expect(r.summary).toMatch(/Nothing to sell/);
  });
  it('names every desk that vetoed, not just the first', () => {
    const r = convene(base({ proposal: { sym: 'WETH', label: 'xWETH', side: 'buy', usd: 0.04 }, price: { ok: true, chainlink: 2500, ageSec: 600, maxAgeSec: 90_000, mirror: true, fill: 2600, venue: 'v2', gapBps: 400, maxGapBps: 150 } }));
    expect(r.decision).toBe('vetoed');
    expect(r.summary).toMatch(/Price Desk/);
    expect(r.summary).toMatch(/also vetoed by the Risk Keeper/);
  });
});
