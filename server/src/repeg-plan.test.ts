import { describe, it, expect } from 'vitest';
import { planRepeg } from './repeg-plan.js';

describe('bounded testnet re-peg arithmetic', () => {
  const price = 2500_00000000n;
  it('adds faucet tokens after a buy without spending USDC or moving the mirror', () => {
    const p = planRepeg(5_040000n, 1984000000000000n, price, 18);
    expect(p.token).toBe(32000000000000n);
    expect(p.usdc).toBe(0n);
    expect(planRepeg(5_040000n, 1984000000000000n + p.token, price, 18).gapBps).toBe(0);
  });
  it('adds only the required USDC after a sale', () => {
    const p = planRepeg(4_960000n, 2016000000000000n, price, 18);
    expect(p.usdc).toBe(80000n);
    expect(p.token).toBe(0n);
    expect(planRepeg(4_960000n + p.usdc, 2016000000000000n, price, 18).gapBps).toBe(0);
  });
  it('does nothing within 5 bps', () => {
    expect(planRepeg(5_000001n, 2000000000000000n, price, 18).token).toBe(0n);
  });
  it('supports 8 decimal test tokens without floating point rounding', () => {
    const p = planRepeg(5_000000n, 4900n, 100000_00000000n, 8);
    expect(p.token).toBe(100n);
  });
  it.each([[0n, 1n, price], [1n, 0n, price], [1n, 1n, 0n]])('rejects empty or invalid inputs', (u,t,p) => {
    expect(() => planRepeg(u,t,p,18)).toThrow();
  });
});
