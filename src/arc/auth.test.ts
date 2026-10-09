import { it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { requestMessage } from './api';
import { verifyRequest } from '../../server/src/auth';
const owner = privateKeyToAccount(`0x${'1'.repeat(64)}`);
it('browser signatures match executor messages even when the wallet returns lowercase', async () => {
  const body = { sym: 'WETH', side: 'buy', usd: 1 }; const at = Date.now();
  const signature = await owner.signMessage({ message: requestMessage('round', owner.address.toLowerCase(), body, at) });
  await expect(verifyRequest({ action: 'round', owner: owner.address.toLowerCase(), body, at, signature })).resolves.toBe(owner.address);
  await expect(verifyRequest({ action: 'autopilot', owner: owner.address, body, at, signature })).rejects.toThrow(/signature/);
});
it('invalid timestamps cannot bypass the freshness window', async () => {
  for (const at of [NaN, Infinity, 0, 1.5]) {
    const signature = await owner.signMessage({ message: requestMessage('round', owner.address, {}, at) });
    await expect(verifyRequest({ action: 'round', owner: owner.address, body: {}, at, signature })).rejects.toThrow(/timestamp/);
  }
});
