// Command ids make retries idempotent on the server. crypto.randomUUID only exists in secure contexts, and a phone on
// the Wi-Fi opens this page over plain http://<computer>:5173, so fall back to getRandomValues (available everywhere).
export function newCommandId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') {
    try { return c.randomUUID(); } catch { /* insecure context */ }
  }
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
