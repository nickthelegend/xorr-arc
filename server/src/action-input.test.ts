import { describe, expect, it } from 'vitest';
import { autopilotInput, roundAmount } from './action-input';
describe('signed action inputs', () => {
  it('accepts exact finite requested amount, never clamps or substitutes a default', () => {
    expect(roundAmount(0.5, 10)).toBe(0.5);
    for (const value of ['5', null, undefined, 0, -1, NaN, Infinity, 11]) expect(() => roundAmount(value, 10)).toThrow();
  });
  it('requires a real boolean and rejects invalid autopilot budgets', () => {
    expect(autopilotInput({ on: false, usd: 5 }, 10)).toEqual({ on: false, usd: 5 });
    for (const body of [null, {}, { on: 'false', usd: 5 }, { on: true, usd: '5' }, { on: true, usd: 100 }]) expect(() => autopilotInput(body, 10)).toThrow();
  });
});
