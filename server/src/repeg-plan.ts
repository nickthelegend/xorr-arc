/** Add liquidity on one side only. Integer math supports 6/8/18-decimal tokens. */
export function planRepeg(usdc: bigint, token: bigint, price: bigint, decimals: number) {
  if (usdc <= 0n || token <= 0n || price <= 0n) throw new Error('Pool or mirror has no positive price/liquidity');
  const scale = 10n ** BigInt(decimals) * 100_000_000n;
  const lhs = usdc * scale;
  const rhs = token * price * 1_000_000n;
  const gapBps = Number((lhs > rhs ? lhs - rhs : rhs - lhs) * 10_000n / rhs);
  if (gapBps <= 5) return { token: 0n, usdc: 0n, gapBps };
  // Round additions up so a sub-unit deficit never persists.
  if (lhs > rhs) return { token: (lhs + price * 1_000_000n - 1n) / (price * 1_000_000n) - token, usdc: 0n, gapBps };
  return { token: 0n, usdc: (rhs + scale - 1n) / scale - usdc, gapBps };
}
