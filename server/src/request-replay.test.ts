import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReplayGuard } from './request-replay';
it('signed actions are consumed once and remain consumed after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xorr-replay-'));
  try {
    const file = join(dir, 'claims.json');
    const guard = createReplayGuard(file, () => 100);
    expect(guard.claim('round-a', 200)).toBe(true);
    expect(guard.claim('round-a', 200)).toBe(false);
    expect(createReplayGuard(file, () => 150).claim('round-a', 200)).toBe(false);
    expect(createReplayGuard(file, () => 250).claim('round-b', 300)).toBe(true);
    expect(createReplayGuard(file, () => 250).claim('expired', 200)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
