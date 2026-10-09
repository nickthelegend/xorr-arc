import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Persist claims before a signed action runs, so a captured trade cannot run twice after restart. */
export function createReplayGuard(file: string, now = Date.now) {
  let claims: Record<string, number> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return {
    claim(key: string, expiresAt: number): boolean {
      const time = now();
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= time) return false;
      for (const [id, expiry] of Object.entries(claims)) if (expiry <= time) delete claims[id];
      if (claims[key] !== undefined) return false;
      const next = { ...claims, [key]: expiresAt };
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
      renameSync(tmp, file);
      claims = next;
      return true;
    },
  };
}
