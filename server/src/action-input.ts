/** Never coerce a signed value into a different trade or autopilot setting. */
export function roundAmount(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) throw new Error(`A round must be a finite number above $0 and at most $${max}.`);
  return value;
}
export function autopilotInput(body: unknown, max: number): { on: boolean; usd: number } {
  if (!body || typeof body !== 'object' || typeof (body as { on?: unknown }).on !== 'boolean') throw new Error('Autopilot on must be a boolean.');
  const input = body as { on: boolean; usd?: unknown };
  return { on: input.on, usd: roundAmount(input.usd, max) };
}
