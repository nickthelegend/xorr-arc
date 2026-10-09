import { describe, it, expect } from 'vitest';
import { createReadGate } from './read-gate';
describe('wallet read isolation', () => {
  it('old wallet results stay discarded after switching or disconnecting', () => {
    const gate = createReadGate();
    const old = gate.begin(); gate.invalidate(); const current = gate.begin();
    expect(old()).toBe(false); expect(current()).toBe(true);
  });
  it('an older delayed result cannot overwrite a newer account response', () => {
    const gate = createReadGate(); const old = gate.begin(); const fresh = gate.begin();
    expect(fresh()).toBe(true); expect(old()).toBe(false);
  });
  it('slow polling can still show responses as they arrive in order', () => {
    const gate = createReadGate(); const one = gate.begin(); const two = gate.begin();
    expect(one()).toBe(true); expect(two()).toBe(true);
  });
});
