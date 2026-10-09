/** Formatting for Arc values: dollars, token amounts, ages, short hashes. */
export const usd = (n: number, d = 2) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const px = (n: number) => (n >= 1000 ? usd(n, 0) : n >= 1 ? usd(n, 2) : `$${n.toPrecision(4)}`);
export const amt = (n: number, d = 6) => n.toLocaleString('en-US', { maximumFractionDigits: d });
export const short = (h?: string | null, n = 6) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : '—');
export const age = (sec: number) => (sec < 90 ? `${Math.max(0, Math.round(sec))} s` : sec < 5400 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`);
export const bps = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)} bps`;
export const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
